import { GoogleGenAI } from '@google/genai';
import type { AgentConfig } from '../../types';
import { DEFAULT_GEMINI_MODEL } from '../../types';
import { buildLedger } from '../v6/parse';
import { parseFrontmatter, condenseCodeBlocks } from '../v6/preprocess';
import { analyzePermissions } from '../v6/analyze-permissions';
import {
  removeCycles,
  ensureConnected,
  duplicateSharedBranchNodes,
  wireRuleReferences,
  materialize,
} from '../v6/generate';
import { tagDNA, formatDNA } from './dna-tagger';
import { MODE_A_PROMPT } from './prompts/mode-a';
import { MODE_C_PROMPT } from './prompts/mode-c';
import { V7_REPAIR_PROMPT } from './prompts/base';
import type { DNAItem, GraphStyle, V7Options, V7Result, GraphPlan, TokenUsage } from './types';

export const V7_MODEL = DEFAULT_GEMINI_MODEL;

// ── JSON helpers ──────────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(cleaned) as T;
}

// ── Normalize GraphPlan from LLM output ───────────────────────────────────────

function normPlan(raw: any): GraphPlan & { _dnaMap: Map<number, string[]> } {
  const meta = raw?.meta ?? {};
  const dnaMap = new Map<number, string[]>();

  const nodes = (Array.isArray(raw?.nodes) ? raw.nodes : []).map((n: any, i: number) => {
    const id = Math.max(1, Math.trunc(Number(n?.id ?? i + 1)));
    const dnaIds: string[] = Array.isArray(n?.dna_ids) ? n.dna_ids : [];
    dnaMap.set(id, dnaIds);
    return {
      id,
      type: typeof n?.type === 'string' ? n.type : 'a',
      label: typeof n?.label === 'string' ? n.label : `Node ${i + 1}`,
      refs: [],
      tool: typeof n?.tool === 'string' ? n.tool : undefined,
      outcome: typeof n?.outcome === 'string' ? n.outcome : undefined,
      scope: n?.scope === 'g' || n?.scope === 's' ? n.scope : undefined,
      governs: Array.isArray(n?.governs) ? n.governs.map(Number).filter(Number.isFinite) : undefined,
      desc: typeof n?.desc === 'string' ? n.desc : undefined,
    };
  });

  const edges: [number, number, string?][] = (Array.isArray(raw?.edges) ? raw.edges : [])
    .map((e: any): [number, number, string?] | null => {
      if (!Array.isArray(e)) return null;
      const src = Math.trunc(Number(e[0]));
      const tgt = Math.trunc(Number(e[1]));
      if (!Number.isFinite(src) || !Number.isFinite(tgt) || src < 1 || tgt < 1) return null;
      return [src, tgt, e[2] != null ? String(e[2]) : undefined];
    })
    .filter((e: any): e is [number, number, string?] => e !== null);

  return {
    meta: {
      agent_id: typeof meta.agent_id === 'string' ? meta.agent_id : '',
      persona: typeof meta.persona === 'string' ? meta.persona : '',
      tone: typeof meta.tone === 'string' ? meta.tone : '',
      version: typeof meta.version === 'string' ? meta.version : '',
      description: typeof meta.description === 'string' ? meta.description : '',
    },
    nodes,
    edges,
    _dnaMap: dnaMap,
  } as any;
}

/** Map dna_ids back to paragraph refs so V6's materialize() can populate logicSnippet. */
function populateRefsFromDNA(
  plan: GraphPlan & { _dnaMap?: Map<number, string[]> },
  dnaItems: DNAItem[],
): GraphPlan {
  const dnaMap = (plan as any)._dnaMap as Map<number, string[]> | undefined;
  if (!dnaMap) return plan;

  return {
    ...plan,
    nodes: plan.nodes.map(n => {
      const dnaIds = dnaMap.get(n.id) ?? [];
      const refs = dnaIds.map(id => {
        const idx = parseInt(id.replace('dna_', ''), 10);
        return Number.isFinite(idx) ? `§${idx}` : null;
      }).filter(Boolean) as string[];
      return { ...n, refs: refs.length > 0 ? refs : n.refs };
    }),
  };
}

// ── Annotation edge capping ───────────────────────────────────────────────────
//
// The LLM tends to set governs:[1,2,3,...all nodes] on persona/guard nodes,
// creating a spiderweb. Enforce:
//   p=persona  → exactly 1 "Governs" edge to the start node
//   g=guard / ru=rule / wp=warning / cf=config / m=memory / ref=reference
//              → at most 1 "Governs" edge (keep the first; drop the rest)

const ANNOTATION_NODE_TYPES = new Set(['p', 'g', 'ru', 'wp', 'cf', 'm', 'ref', 'tr']);

function capAnnotationEdges(plan: GraphPlan): GraphPlan {
  const startId = plan.nodes.find(n => n.type === 'st')?.id;
  const annotationIds = new Set(
    plan.nodes.filter(n => ANNOTATION_NODE_TYPES.has(n.type)).map(n => n.id),
  );

  if (annotationIds.size === 0) return plan;

  // Count how many "Governs" edges each annotation node already emits
  const governsEdgesBySrc = new Map<number, Array<[number, number, string?]>>();
  const otherEdges: Array<[number, number, string?]> = [];

  for (const edge of plan.edges) {
    const [src, , label] = edge;
    if (annotationIds.has(src) && label && /govern/i.test(label)) {
      const list = governsEdgesBySrc.get(src) ?? [];
      list.push(edge);
      governsEdgesBySrc.set(src, list);
    } else {
      otherEdges.push(edge);
    }
  }

  const cappedEdges: Array<[number, number, string?]> = [];

  for (const [src, edges] of governsEdgesBySrc) {
    const node = plan.nodes.find(n => n.id === src);
    if (!node) continue;

    if (node.type === 'p') {
      // Persona: only connects to start
      if (startId != null) {
        cappedEdges.push([src, startId, 'Governs']);
      }
    } else {
      // All other annotation types: keep only the first edge
      if (edges.length > 0) cappedEdges.push(edges[0]);
    }
  }

  return { ...plan, edges: [...otherEdges, ...cappedEdges] };
}

// ── LLM call ──────────────────────────────────────────────────────────────────

function isTransient(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /fetch failed|timeout|429|503|temporarily unavailable/i.test(msg);
}

async function callLlm(
  systemPrompt: string,
  userMessage: string,
  options: V7Options,
): Promise<{ text: string; usage?: TokenUsage }> {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const model = options.model ?? V7_MODEL;
  let response: any;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await ai.models.generateContent({
        model,
        config: {
          temperature: 0,
          topP: 0,
          thinkingConfig: { thinkingLevel: 'MINIMAL' } as any,
          maxOutputTokens: 32768,
          responseMimeType: 'application/json',
          systemInstruction: systemPrompt,
        } as any,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      });
      break;
    } catch (error) {
      if (attempt >= 3 || !isTransient(error)) throw error;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }

  if (!response) throw new Error('LLM call failed');
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const text = response.text?.trim() ?? '';
  options.onChunk?.(text);

  const u = (response as any).usageMetadata;
  const usage: TokenUsage | undefined = u ? {
    promptTokens: u.promptTokenCount ?? 0,
    responseTokens: u.candidatesTokenCount ?? 0,
    thoughtsTokens: u.thoughtsTokenCount ?? 0,
    totalTokens: u.totalTokenCount ?? 0,
  } : undefined;

  return { text, usage };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function promptToGraphV7(rawPrompt: string, options: V7Options): Promise<AgentConfig> {
  const result = await promptToGraphV7Detailed(rawPrompt, options);
  return result.agentConfig;
}

export async function promptToGraphV7Detailed(rawPrompt: string, options: V7Options): Promise<V7Result> {
  const graphStyle: GraphStyle = options.graphStyle ?? 'A';
  const modelName = options.model ?? V7_MODEL;

  // Stage -1: Pre-process
  options.onPhaseChange?.(0, 'Pre-process', 'started');
  const { body: cleanedBody } = parseFrontmatter(rawPrompt);
  const condensedPrompt = condenseCodeBlocks(cleanedBody);
  options.onPhaseChange?.(0, 'Pre-process', 'done');

  // Stage 1: DNA Tagging
  options.onPhaseChange?.(1, 'Tag content DNA', 'started');
  const dnaItems = tagDNA(condensedPrompt);
  options.onPhaseChange?.(1, 'Tag content DNA', 'done');

  // Build a DNA-backed ledger so materialize() can populate logicSnippet
  const baseLedger = buildLedger(condensedPrompt);
  const dnaLedger = {
    ...baseLedger,
    prompt: rawPrompt,
    paragraphs: dnaItems.map((item, i) => ({
      ref: `§${i}`,
      index: i,
      text: item.text,
      section: item.section,
    })),
    refs: dnaItems.map((_, i) => `§${i}`),
  };

  // Stage 2: LLM Graph Builder
  options.onPhaseChange?.(2, 'Generate graph', 'started');
  const systemPrompt = graphStyle === 'C' ? MODE_C_PROMPT : MODE_A_PROMPT;
  const userMessage = `Graph style: ${graphStyle}\n\nDNA items:\n${formatDNA(dnaItems)}`;
  const { text: rawText, usage } = await callLlm(systemPrompt, userMessage, options);
  if (usage) options.onUsage?.(usage);
  options.onPhaseChange?.(2, 'Generate graph', 'done');

  // Stage 3: Validate + fix
  options.onPhaseChange?.(3, 'Validate & fix', 'started');
  const rawPlan = normPlan(parseJson(rawText));
  let plan: GraphPlan = populateRefsFromDNA(rawPlan, dnaItems);
  plan = removeCycles(plan);
  plan = ensureConnected(plan, dnaLedger);
  plan = wireRuleReferences(plan, dnaLedger);
  plan = capAnnotationEdges(plan);
  // Style C intentionally creates shared merge nodes — skip duplication to avoid tripling them
  if (graphStyle !== 'C') plan = duplicateSharedBranchNodes(plan);
  options.onPhaseChange?.(3, 'Validate & fix', 'done');

  // Stage 4: Materialize
  options.onPhaseChange?.(4, 'Materialize', 'started');
  const { agentConfig, compactJson } = materialize(plan, dnaLedger, options as any, modelName, 'agent-spec');
  (agentConfig as any).originalPrompt = rawPrompt;
  (agentConfig as any).generatedWith = 'v7';
  (agentConfig as any).graphStyle = graphStyle;
  options.onPhaseChange?.(4, 'Materialize', 'done');

  // Stage 5: Permissions
  options.onPhaseChange?.(5, 'Analyze permissions', 'started');
  const permissionsManifest = analyzePermissions(agentConfig);
  (agentConfig as any).permissionsManifest = permissionsManifest;
  options.onPhaseChange?.(5, 'Analyze permissions', 'done');

  return { agentConfig, dnaItems, plan, compactJson, graphStyle };
}
