// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V4 — Pipeline Orchestrator
//
// Clean single-call pipeline:
//   Stage 0 (code)  parse prompt → Ledger
//   Stage 1 (LLM)   single call  → GraphPlan (nodes + edges)
//   Stage 2 (code)  validate + fix cycles
//   Stage 3 (code)  materialize  → AgentConfig + compact JSON
//
// One LLM call. One optional repair call if validation fails.
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import type { AgentConfig, NodeData, Connection } from '../../types';
import { DEFAULT_GEMINI_MODEL } from '../../types';
import { applyAutoLayout } from '../../graph/auto-layout';
import { buildLedger, formatLedger, resolveRefs } from './parse';
import { SYSTEM_PROMPT, REPAIR_PROMPT } from './prompt';
import type {
  EdgeTuple,
  GraphPlan,
  Ledger,
  PlanNode,
  TokenUsage,
  TypeCode,
  V4Options,
  V4Result,
} from './types';

export const V4_MODEL = DEFAULT_GEMINI_MODEL;

// ── Type code → display type ──────────────────────────────────────────────────

const TYPE_MAP: Record<TypeCode, string> = {
  st: 'START', e: 'END', i: 'INPUT', d: 'DECISION', a: 'ACTION',
  t: 'TOOL', ru: 'RULE', s: 'STEP', o: 'OPTION', ag: 'AGENT',
  ref: 'REFERENCE', cf: 'CONFIG', tr: 'TRIGGER', c: 'CONDITION',
  ta: 'TASK', p: 'PERSONA', m: 'MEMORY', h: 'HANDOFF',
  lg: 'LOGGING', g: 'GUARD', r: 'RESOLUTION', gr: 'GROUP',
};

const VALID_CODES = new Set(Object.keys(TYPE_MAP));

/** Deterministic hash → hex string for generating stable child agent IDs. */
function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// ── JSON parsing ──────────────────────────────────────────────────────────────

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

// ── Normalization ─────────────────────────────────────────────────────────────

function normType(val: unknown): TypeCode {
  if (typeof val === 'string' && VALID_CODES.has(val)) return val as TypeCode;
  return 'a';
}

function normRefs(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String).filter(s => /^§/.test(s) || /^\d+$/.test(s));
  if (typeof val === 'string') return val.split(/[\s,]+/).filter(s => /^§/.test(s) || /^\d+$/.test(s));
  return [];
}

function normPlan(raw: any): GraphPlan {
  const meta = raw?.meta ?? {};
  const nodes: PlanNode[] = (Array.isArray(raw?.nodes) ? raw.nodes : []).map((n: any, i: number) => ({
    id: Math.max(1, Math.trunc(Number(n?.id ?? i + 1))),
    type: normType(n?.type),
    label: typeof n?.label === 'string' ? n.label : `Node ${i + 1}`,
    refs: normRefs(n?.refs),
    tool: typeof n?.tool === 'string' ? n.tool : undefined,
    outcome: typeof n?.outcome === 'string' ? n.outcome : undefined,
    scope: n?.scope === 'g' || n?.scope === 's' ? n.scope : undefined,
    governs: Array.isArray(n?.governs) ? n.governs.map(Number).filter(Number.isFinite) : undefined,
  }));

  const edges: EdgeTuple[] = (Array.isArray(raw?.edges) ? raw.edges : [])
    .map((e: any): EdgeTuple | null => {
      if (Array.isArray(e)) {
        const src = Math.trunc(Number(e[0]));
        const tgt = Math.trunc(Number(e[1]));
        if (!Number.isFinite(src) || !Number.isFinite(tgt) || src < 1 || tgt < 1) return null;
        return [src, tgt, e[2] != null ? String(e[2]) : undefined];
      }
      return null;
    })
    .filter((e: EdgeTuple | null): e is EdgeTuple => e !== null);

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
  };
}

// ── Cycle detection + removal ─────────────────────────────────────────────────

function removeCycles(plan: GraphPlan): GraphPlan {
  const adj = new Map<number, number[]>();
  for (const [src, tgt] of plan.edges) {
    if (!adj.has(src)) adj.set(src, []);
    adj.get(src)!.push(tgt);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<number, number>();
  const backEdges = new Set<string>();

  for (const n of plan.nodes) color.set(n.id, WHITE);

  function dfs(u: number) {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) backEdges.add(`${u}->${v}`);
      else if (color.get(v) === WHITE) dfs(v);
    }
    color.set(u, BLACK);
  }

  const start = plan.nodes.find(n => n.type === 'st');
  if (start) dfs(start.id);
  for (const n of plan.nodes) {
    if (color.get(n.id) === WHITE) dfs(n.id);
  }

  if (backEdges.size === 0) return plan;

  // Find a terminal to reroute back-edges
  const terminal = plan.nodes.find(n => n.type === 'h')
    ?? plan.nodes.find(n => n.type === 'e')
    ?? plan.nodes.find(n => n.type === 'r');
  const reroutedSources = new Set<number>();

  const filtered: EdgeTuple[] = [];
  for (const edge of plan.edges) {
    const key = `${edge[0]}->${edge[1]}`;
    if (backEdges.has(key)) {
      if (terminal && !reroutedSources.has(edge[0]) && edge[0] !== terminal.id) {
        filtered.push([edge[0], terminal.id, 'Escalate (cycle removed)']);
        reroutedSources.add(edge[0]);
      }
      continue;
    }
    filtered.push(edge);
  }

  return { ...plan, edges: filtered };
}

// ── Connectivity enforcement ──────────────────────────────────────────────────

function ensureConnected(plan: GraphPlan): GraphPlan {
  const connected = new Set<number>();
  for (const [src, tgt] of plan.edges) {
    connected.add(src);
    connected.add(tgt);
  }

  const ANNOTATION = new Set<TypeCode>(['p', 'ru', 'cf', 'g', 'ref', 'tr', 'm']);
  const orphans = plan.nodes.filter(n => !connected.has(n.id));
  if (orphans.length === 0) return plan;

  const startId = plan.nodes.find(n => n.type === 'st')?.id ?? 1;
  const extra: EdgeTuple[] = [];

  for (const node of orphans) {
    if (ANNOTATION.has(node.type)) {
      // Wire annotation → its governed targets or START
      const targets = node.governs?.length ? node.governs : [startId];
      for (const t of targets) extra.push([node.id, t, 'Governs']);
    } else {
      // Wire orphan flow node to START
      extra.push([startId, node.id, 'Proceed']);
    }
  }

  return { ...plan, edges: [...plan.edges, ...extra] };
}

// ── Validation ────────────────────────────────────────────────────────────────

interface Violation { code: string; message: string }

function validate(plan: GraphPlan, ledger: Ledger): Violation[] {
  const violations: Violation[] = [];

  // Check START node exists
  if (!plan.nodes.some(n => n.type === 'st')) {
    violations.push({ code: 'NO_START', message: 'No st=start node' });
  }

  // Check §N coverage
  const claimed = new Set(plan.nodes.flatMap(n => n.refs));
  const unclaimed = ledger.refs.filter(r => !claimed.has(r));
  if (unclaimed.length > 0) {
    violations.push({ code: 'UNCOVERED', message: `Uncovered: ${unclaimed.join(', ')}` });
  }

  // Check for orphan flow nodes
  const connected = new Set<number>();
  for (const [src, tgt] of plan.edges) { connected.add(src); connected.add(tgt); }
  const orphans = plan.nodes.filter(n => !connected.has(n.id));
  if (orphans.length > 0) {
    violations.push({ code: 'ORPHAN', message: `Orphan nodes: ${orphans.map(n => n.id).join(', ')}` });
  }

  return violations;
}

// ── Inject missing INPUT nodes for section headings ───────────────────────────

/**
 * Ensure every major section heading (## Rule B, ## Step 3, etc.) has an
 * s=step node as a visual entry gate. If the LLM didn't create one, inject it
 * and re-route incoming jump edges to go through the STEP node.
 */
function injectSectionInputs(plan: GraphPlan, ledger: Ledger): GraphPlan {
  // First: convert any LLM-created i=input nodes to s=step
  plan = {
    ...plan,
    nodes: plan.nodes.map(n => n.type === 'i' ? { ...n, type: 's' as TypeCode } : n),
  };

  // Find heading paragraphs that describe a named section (not the preamble or agent title)
  const headingParagraphs = ledger.paragraphs.filter(p =>
    /^#{1,6}\s+/.test(p.text.trim()) && p.section !== 'Preamble',
  );

  // Build a map: section name → heading §N ref
  const sectionToRef = new Map<string, string>();
  for (const p of headingParagraphs) {
    sectionToRef.set(p.section, p.ref);
  }

  // Find which sections already have an s=step entry node
  const sectionsWithInput = new Set<string>();
  for (const n of plan.nodes) {
    if (n.type === 's') {
      // Find the section this input belongs to by checking its refs
      for (const ref of n.refs) {
        const p = ledger.paragraphs.find(lp => lp.ref === ref);
        if (p) sectionsWithInput.add(p.section);
      }
      // Also match by label (fuzzy: check if either contains the other, or shares key words)
      for (const [section] of sectionToRef) {
        const labelLower = n.label.toLowerCase();
        const sectionLower = section.toLowerCase();
        if (labelLower.includes(sectionLower) || sectionLower.includes(labelLower)) {
          sectionsWithInput.add(section);
        }
        // Match partial labels like "Rule B" inside "Rule B — Standard Window Check"
        const labelWords = labelLower.split(/[\s—\-:]+/).filter(w => w.length > 1);
        const sectionWords = sectionLower.split(/[\s—\-:]+/).filter(w => w.length > 1);
        const overlap = labelWords.filter(w => sectionWords.includes(w));
        if (overlap.length >= 2) sectionsWithInput.add(section);
      }
    }
  }

  // For sections without an INPUT node, inject one
  let maxId = Math.max(...plan.nodes.map(n => n.id), 0);
  const newNodes: PlanNode[] = [];
  const newEdges: EdgeTuple[] = [];
  // Map: section name → INPUT node id (for re-routing)
  const sectionInputId = new Map<number, number>();

  for (const [section, ref] of sectionToRef) {
    if (sectionsWithInput.has(section)) continue;

    // Skip the first section if it's the agent title (already covered by START)
    const para = ledger.paragraphs.find(p => p.ref === ref);
    if (!para) continue;
    const headingText = para.text.replace(/^#{1,6}\s+/, '').trim();
    // Skip if it looks like the main agent name (first heading)
    if (para.index <= 1) continue;

    maxId++;
    const inputNode: PlanNode = {
      id: maxId,
      type: 's',
      label: headingText,
      refs: [ref],
    };
    newNodes.push(inputNode);

    // Find the first flow node in this section that was created by the LLM
    const sectionNodes = plan.nodes.filter(n => {
      if (n.type === 'st') return false;
      return n.refs.some(r => {
        const p = ledger.paragraphs.find(lp => lp.ref === r);
        return p?.section === section;
      });
    });

    if (sectionNodes.length > 0) {
      // Find the "entry" node (one with incoming edges from outside this section,
      // or the first by id)
      const sectionIds = new Set(sectionNodes.map(n => n.id));
      let entryNode = sectionNodes.find(n =>
        plan.edges.some(([src, tgt]) => tgt === n.id && !sectionIds.has(src)),
      ) ?? sectionNodes[0];

      // Re-route incoming edges from outside this section to go through the INPUT node
      const rerouted = plan.edges.map((e): EdgeTuple => {
        if (e[1] === entryNode.id && !sectionIds.has(e[0])) {
          return [e[0], maxId, e[2]];
        }
        return e;
      });
      plan = { ...plan, edges: rerouted };

      // Wire INPUT → section entry node
      newEdges.push([maxId, entryNode.id, 'Proceed']);
    }
  }

  if (newNodes.length === 0) return plan;

  return {
    ...plan,
    nodes: [...plan.nodes, ...newNodes],
    edges: [...plan.edges, ...newEdges],
  };
}

// ── Promote sub-agent tool nodes to agent nodes ──────────────────────────────

/**
 * Detect tool nodes that are actually sub-agents and promote them to ag=agent.
 *
 * Detection heuristics:
 * 1. The ledger contains agent registry patterns ("You have access to:",
 *    "Available agents:", "Subagents:") listing these names
 * 2. Label matches agent naming patterns: XAgent, X_Agent, AgentX, X-Agent
 */
function promoteSubAgents(plan: GraphPlan, ledger: Ledger): GraphPlan {
  // Detect agent registry sections in the prompt and extract listed names
  const registryNames = new Set<string>();
  const registryRe = /(?:you have access to|available agents?|subagents?|sub-agents?|sub agents?):\s*/i;

  for (const para of ledger.paragraphs) {
    if (registryRe.test(para.text)) {
      const lines = para.text.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(?:\d+\.|[-*])\s+(\S+)/);
        if (match) {
          registryNames.add(match[1].toLowerCase());
        }
      }
    }
  }

  // Agent naming pattern: XAgent, AgentX, X_Agent, Agent_X, X-Agent, Agent-X
  const agentNameRe = /^(\w+Agent|Agent\w+|\w+_Agent|Agent_\w+|\w+-Agent|Agent-\w+)$/i;

  const nodes = plan.nodes.map(n => {
    if (n.type !== 't') return n;

    const labelLower = n.label.toLowerCase().trim();
    const isRegistered = registryNames.has(labelLower);
    const isAgentName = agentNameRe.test(n.label.trim());

    if (isRegistered || isAgentName) {
      return { ...n, type: 'ag' as TypeCode };
    }
    return n;
  });

  return { ...plan, nodes };
}

// ── Merge duplicate tool nodes ────────────────────────────────────────────────

/**
 * If the LLM created multiple t=tool nodes with the same label (e.g., two
 * "MembershipCheck" nodes), merge them into one and re-route all edges.
 */
function mergeToolDuplicates(plan: GraphPlan): GraphPlan {
  const toolNodes = plan.nodes.filter(n => n.type === 't');
  const labelGroups = new Map<string, PlanNode[]>();

  for (const tn of toolNodes) {
    const key = tn.label.toLowerCase().trim();
    if (!labelGroups.has(key)) labelGroups.set(key, []);
    labelGroups.get(key)!.push(tn);
  }

  const remapId = new Map<number, number>();
  const toRemove = new Set<number>();

  for (const [, group] of labelGroups) {
    if (group.length <= 1) continue;
    // Keep the first, merge the rest into it
    const keeper = group[0];
    for (let i = 1; i < group.length; i++) {
      const dup = group[i];
      remapId.set(dup.id, keeper.id);
      toRemove.add(dup.id);
      // Merge refs
      for (const r of dup.refs) {
        if (!keeper.refs.includes(r)) keeper.refs.push(r);
      }
    }
  }

  if (toRemove.size === 0) return plan;

  const nodes = plan.nodes.filter(n => !toRemove.has(n.id));
  const edgeSet = new Set<string>();
  const edges: EdgeTuple[] = [];

  for (const e of plan.edges) {
    const src = remapId.get(e[0]) ?? e[0];
    const tgt = remapId.get(e[1]) ?? e[1];
    if (src === tgt) continue; // Skip self-loops
    const key = `${src}->${tgt}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    edges.push([src, tgt, e[2]]);
  }

  return { ...plan, nodes, edges };
}

// ── Materialization (GraphPlan → AgentConfig) ─────────────────────────────────

function materialize(
  plan: GraphPlan,
  ledger: Ledger,
  options: V4Options,
  modelName: string,
): { agentConfig: AgentConfig; compactJson: string } {
  // Track which individual §N refs have already been given to a prior node
  // so the SAME paragraph text isn't duplicated across multiple nodes.
  const claimedRefs = new Set<string>();

  // Build NodeData[]
  const nodes: NodeData[] = plan.nodes.map(n => {
    // Only resolve refs that haven't been claimed by an earlier node
    const freshRefs = n.refs.filter(r => !claimedRefs.has(r));
    // Mark these refs as claimed
    for (const r of n.refs) claimedRefs.add(r);

    const snippet = freshRefs.length > 0
      ? resolveRefs(ledger, freshRefs)
      : resolveRefs(ledger, n.refs); // fallback: if all refs were claimed, still show something

    // Section = the section of the first ref (stay within one section)
    const section = n.refs.length > 0
      ? ledger.paragraphs.find(p => p.ref === n.refs[0])?.section ?? ''
      : '';

    return {
      id: `n${n.id}`,
      type: TYPE_MAP[n.type] as any,
      label: n.label,
      description: '',
      config: {
        logicSnippet: snippet,
        origSnippet: snippet,
        sourceSection: section,
        sourceFormat: 'prose',
        order: n.id,
        tool: n.tool ?? null,
        value: null,
        outcome: n.outcome ?? null,
        inputRequired: n.type === 'i' ? true : null,
        ruleScope: n.scope === 'g' ? 'global' : n.scope === 's' ? 'scoped' : null,
        appliesTo: n.governs?.map(v => `n${v}`) ?? null,
        personaScope: n.type === 'p' ? 'agent' : null,
        column: 'center',
        branchGroup: null,
      },
      position: { x: 0, y: 0 },
    };
  });

  // Promote business-outcome END nodes to RESOLUTION
  const BIZ_RE = /\b(approv|deny|refund|credit|partial|reject|grant|reimburse|compensat)/i;
  for (const node of nodes) {
    if (node.type === 'END' && BIZ_RE.test(`${node.label} ${(node.config as any)?.outcome ?? ''}`)) {
      (node as any).type = 'RESOLUTION';
      node.config.pfgType = 'resolution';
    }
  }

  // Enrich AGENT nodes with linkedAgentId, agentRole, description
  // so the canvas renders them as clickable sub-agent links.
  const childAgentIds: string[] = [];
  for (const node of nodes) {
    if (node.type !== 'AGENT') continue;
    const role = node.label.trim();
    // Generate a deterministic child agent ID from the role name
    const childId = `agent-${djb2Hex(role)}`;
    childAgentIds.push(childId);
    node.description = `Sub-agent: ${role}`;
    node.config = {
      ...node.config,
      linkedAgentId: childId,
      agentRole: role,
      pfgType: 'agent',
    };
  }

  // Build Connection[]
  const connections: Connection[] = plan.edges.map((e, i) => ({
    id: `e${i + 1}`,
    source: `n${e[0]}`,
    target: `n${e[1]}`,
    condition: e[2] ?? undefined,
  }));

  // Layout
  const layoutted = (!options.skipLayout && !options.existingPositions)
    ? applyAutoLayout(nodes, connections)
    : nodes;

  // Compact JSON
  const compact = JSON.stringify({
    m: [plan.meta.agent_id, plan.meta.persona, plan.meta.tone, plan.meta.version, plan.meta.description, ledger.format],
    g: {
      n: plan.nodes.map(n => {
        const tuple: any[] = [n.id, n.type, n.label, resolveRefs(ledger, n.refs)];
        if (n.tool) tuple.push(n.tool);
        return tuple;
      }),
      e: plan.edges.map(e => e[2] ? [e[0], e[1], e[2]] : [e[0], e[1]]),
    },
  });

  // Extract the master agent role from persona or prompt
  const masterRole = plan.meta.persona || plan.meta.agent_id || '';

  const agentConfig: AgentConfig = {
    id: plan.meta.agent_id || `agent_${Date.now()}`,
    name: plan.meta.persona || 'Agent',
    description: plan.meta.description,
    originalPrompt: ledger.prompt,
    nodes: layoutted,
    connections,
    version: plan.meta.version || '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceFormat: 'json-compact',
    rawLlmOutput: compact,
    ...(childAgentIds.length > 0 ? { childAgentIds, agentRole: masterRole } : {}),
    settings: {
      llmProvider: 'gemini',
      apiKey: '',
      model: modelName,
      temperature: 0,
    },
  };

  return { agentConfig, compactJson: compact };
}

// ── LLM call ──────────────────────────────────────────────────────────────────

function isTransient(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /fetch failed|timeout|429|503|temporarily unavailable/i.test(msg);
}

async function callLlm(
  systemPrompt: string,
  userMessage: string,
  options: V4Options,
): Promise<{ text: string; usage?: TokenUsage }> {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const model = options.model ?? V4_MODEL;

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

/**
 * Convert a prompt to a graph using a single LLM call.
 *
 * Returns an AgentConfig ready for the canvas.
 */
export async function promptToGraphV4(
  rawPrompt: string,
  options: V4Options,
): Promise<AgentConfig> {
  const result = await promptToGraphV4Detailed(rawPrompt, options);
  return result.agentConfig;
}

/**
 * Full pipeline with all intermediate artifacts.
 */
export async function promptToGraphV4Detailed(
  rawPrompt: string,
  options: V4Options,
): Promise<V4Result> {
  const modelName = options.model ?? V4_MODEL;

  // ── Stage 0: Parse ────────────────────────────────────────────────────────
  options.onPhaseChange?.(1, 'Parse prompt', 'started');
  const ledger = buildLedger(rawPrompt);
  options.onPhaseChange?.(1, 'Parse prompt', 'done');

  // ── Stage 1: Single LLM call ─────────────────────────────────────────────
  options.onPhaseChange?.(2, 'Generate graph', 'started');

  const userMessage = `Paragraph ledger:\n${formatLedger(ledger)}`;
  const { text: rawText, usage } = await callLlm(SYSTEM_PROMPT, userMessage, options);
  if (usage) options.onUsage?.(usage);

  let plan = normPlan(parseJson(rawText));

  options.onPhaseChange?.(2, 'Generate graph', 'done');

  // ── Stage 2: Validate + fix ───────────────────────────────────────────────
  options.onPhaseChange?.(3, 'Validate & fix', 'started');

  plan = removeCycles(plan);
  plan = ensureConnected(plan);

  const violations = validate(plan, ledger);

  // If serious violations, try one repair call
  if (violations.length > 0) {
    try {
      const repairMsg = [
        `Original plan:\n${JSON.stringify(plan)}`,
        `\nViolations:\n${violations.map(v => `- ${v.code}: ${v.message}`).join('\n')}`,
        `\nParagraph ledger:\n${formatLedger(ledger)}`,
      ].join('\n');

      const { text: repairText, usage: repairUsage } = await callLlm(REPAIR_PROMPT, repairMsg, options);
      if (repairUsage && usage) {
        const combined: TokenUsage = {
          promptTokens: usage.promptTokens + repairUsage.promptTokens,
          responseTokens: usage.responseTokens + repairUsage.responseTokens,
          thoughtsTokens: (usage.thoughtsTokens ?? 0) + (repairUsage.thoughtsTokens ?? 0),
          totalTokens: usage.totalTokens + repairUsage.totalTokens,
        };
        options.onUsage?.(combined);
      }

      let repaired = normPlan(parseJson(repairText));
      repaired = removeCycles(repaired);
      repaired = ensureConnected(repaired);

      // Use repaired plan if it's better
      const newViolations = validate(repaired, ledger);
      if (newViolations.length < violations.length) {
        plan = repaired;
      }
    } catch {
      // Repair failed — use original plan (best effort)
    }
  }

  // Final cycle sweep after all fixes
  plan = removeCycles(plan);

  // Promote tool nodes that are actually sub-agents to ag=agent
  plan = promoteSubAgents(plan, ledger);

  // Post-processing: inject missing section STEP nodes
  // (mergeToolDuplicates intentionally NOT called — duplicate tools
  //  are allowed per-section for readable graphs; dedup happens in reconstruction)
  plan = injectSectionInputs(plan, ledger);
  plan = ensureConnected(plan);

  options.onPhaseChange?.(3, 'Validate & fix', 'done');

  // ── Stage 3: Materialize ──────────────────────────────────────────────────
  options.onPhaseChange?.(4, 'Materialize', 'started');

  const { agentConfig, compactJson } = materialize(plan, ledger, options, modelName);

  options.onPhaseChange?.(4, 'Materialize', 'done');

  return { agentConfig, plan, ledger, compactJson };
}
