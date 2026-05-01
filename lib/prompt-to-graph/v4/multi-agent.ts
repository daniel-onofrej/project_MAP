// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V4 — Multi-Agent Detection & Generation
//
// Self-contained multi-agent pipeline for V4.
// Detects multi-agent patterns and generates master + N subagent graphs.
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import type { AgentConfig, NodeData, MultiAgentDetection } from '../../types';
import { DEFAULT_GEMINI_MODEL } from '../../types';
import { promptToGraphV4 } from './generate';
import { buildSubAgentContext, extractInterfaceContract } from '../v1/multi-agent-context';
import { findBestRoleMatch } from '../v1/role-matching';

// ─────────────────────────────────────────────────────────────────────────────
// Normalize JS-string-concatenation prompt syntax to clean markdown.
// ─────────────────────────────────────────────────────────────────────────────
function normalizePromptText(raw: string): string {
  const trimmed = raw.trim();
  const lines = trimmed.split('\n');
  const jsStringLines = lines.filter(l => /\\n["']\s*\+?\s*$/.test(l.trim()) || /^["']/.test(l.trim()));
  if (jsStringLines.length < lines.filter(l => l.trim()).length * 0.4) {
    return raw;
  }
  const cleaned = lines.map(line => {
    let l = line;
    l = l.replace(/^\s*["']/, '');
    l = l.replace(/\\n\\n["']\s*\+?\s*$/, '\n');
    l = l.replace(/\\n["']\s*\+?\s*$/, '');
    l = l.replace(/["']\s*\+?\s*$/, '');
    l = l.replace(/["']\s*;?\s*$/, '');
    l = l.replace(/\\n/g, '\n');
    l = l.replace(/\\"/g, '"').replace(/\\'/g, "'");
    return l;
  });
  return cleaned.join('').replace(/\n+$/, '');
}

/** Deterministic hash → hex string for generating stable IDs. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Agent Detection
// ─────────────────────────────────────────────────────────────────────────────

const MULTI_AGENT_DETECTION_PROMPT = `You are an agent architecture analyzer.

Analyze the given prompt and determine if it describes a MULTI-AGENT system — i.e., a master/coordinator/router agent that delegates to multiple specialist sub-agents.

Signs of a multi-agent system:
- A "router" or "intent classifier" that routes to named agents
- Multiple named agents listed (e.g. "PRICE_CHECK", "LIST_BUILDER", "RECIPE")
- Each agent has its own distinct behavior/prompt described separately
- Phrases like "route to", "delegate to", "specialist agent", "sub-agent"

Signs of a SINGLE agent (NOT multi-agent):
- One agent with multiple rules/steps/tools
- Decision trees within a single agent
- Tools or APIs called by one agent (tools are NOT agents)

IMPORTANT: Do NOT confuse TOOLS with AGENTS. A tool is an external API/function call. An agent is an autonomous AI module with its own prompt/behavior.

Return a JSON object:
- If multi-agent: { "isMasterAgent": true, "masterRole": "ROUTER", "subAgentRoles": ["AGENT_A", "AGENT_B", ...], "masterPromptFragment": "the portion of text that is the master agent's own logic", "subAgentPromptHints": ["hint about what AGENT_A does", "hint about what AGENT_B does", ...] }
- If single agent: { "isMasterAgent": false, "masterRole": "", "subAgentRoles": [], "masterPromptFragment": "", "subAgentPromptHints": [] }

Return ONLY the JSON object. No other text.`;

export async function detectMultiAgent(
  prompt: string,
  options: { apiKey: string; model?: string }
): Promise<MultiAgentDetection | null> {
  const normalized = normalizePromptText(prompt);
  const { apiKey, model = DEFAULT_GEMINI_MODEL } = options;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      config: {
        temperature: 0,
        topP: 0,
        thinkingConfig: (model?.includes('gemini-2') ? { thinkingBudget: 0 } : { thinkingLevel: 'MINIMAL' }) as any,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        systemInstruction: MULTI_AGENT_DETECTION_PROMPT,
      } as any,
      contents: [{ role: 'user', parts: [{ text: normalized }] }],
    });

    const text = response.text?.trim() ?? '';
    if (!text) return null;

    const parsed = JSON.parse(text) as MultiAgentDetection;
    if (!parsed.isMasterAgent) return null;
    if (!parsed.subAgentRoles?.length) return null;
    return parsed;
  } catch (err) {
    console.error('Multi-agent detection failed:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Agent Graph Generation
// ─────────────────────────────────────────────────────────────────────────────

export type AgentGenStatus = 'pending' | 'generating' | 'done' | 'error';

export interface AgentGenProgress {
  role: string;
  status: AgentGenStatus;
  error?: string;
}

export interface MultiAgentOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
}

export async function generateMultiAgentGraphs(
  masterPrompt: string,
  subAgentPrompts: { role: string; prompt: string }[],
  options: MultiAgentOptions,
  onProgress?: (agents: AgentGenProgress[]) => void,
  masterRole?: string
): Promise<{ master: AgentConfig; subAgents: AgentConfig[] }> {
  const resolvedMasterRole = masterRole || 'MASTER';

  const v4Opts = {
    apiKey: options.apiKey,
    model: options.model,
    signal: options.signal,
    onChunk: options.onChunk,
  };

  // Initial state: master generating, all subagents pending
  const progressState: AgentGenProgress[] = [
    { role: resolvedMasterRole, status: 'generating' },
    ...subAgentPrompts.map(({ role }) => ({ role, status: 'pending' as AgentGenStatus })),
  ];
  onProgress?.([...progressState]);

  // Step 1: Generate master first (needed for context building)
  const master = await promptToGraphV4(masterPrompt, v4Opts);
  master.agentRole = resolvedMasterRole;
  master.childAgentIds = [];
  master.generatedWith = 'v4';

  progressState[0] = { role: resolvedMasterRole, status: 'done' };
  onProgress?.([...progressState]);

  if (options.signal?.aborted) {
    throw new DOMException('Generation aborted', 'AbortError');
  }

  // Step 2: Generate all subagents in parallel using V4 pipeline
  const AGENT_TIMEOUT_MS = 180_000;
  const MAX_RETRIES = 1;

  // Mark all subagents as generating
  for (let i = 0; i < subAgentPrompts.length; i++) {
    progressState[i + 1] = { role: subAgentPrompts[i].role, status: 'generating' };
  }
  onProgress?.([...progressState]);

  const generateOne = async (i: number): Promise<AgentConfig> => {
    const { role, prompt } = subAgentPrompts[i];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (options.signal?.aborted) {
        throw new DOMException('Generation aborted', 'AbortError');
      }

      if (attempt > 0) {
        console.log(`[MultiAgent] Retrying ${role} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        await new Promise(resolve => setTimeout(resolve, 2_000));
      }

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Generation timed out after ${AGENT_TIMEOUT_MS / 1000}s`)),
          AGENT_TIMEOUT_MS
        );
      });

      try {
        const subAgentContext = buildSubAgentContext(
          master,
          role,
          subAgentPrompts.map(s => s.role)
        );
        const augmentedPrompt = `${subAgentContext}\n\n---\n\n${prompt}`;

        console.log(`[MultiAgent] ${role} attempt ${attempt + 1}: starting (prompt: ${augmentedPrompt.length} chars)`);
        const subAgent = await Promise.race([
          promptToGraphV4(augmentedPrompt, { ...v4Opts, onChunk: undefined }),
          timeoutPromise,
        ]);
        clearTimeout(timeoutId!);

        subAgent.originalPrompt = prompt;
        subAgent.agentRole = role;
        subAgent.parentAgentId = master.id;
        subAgent.name = `${role} Agent`;
        subAgent.id = `agent-${djb2(`${role}|${prompt.trim()}`)}`;
        subAgent.generatedWith = 'v4';

        // Strip sibling AGENT nodes — they are context-only, not real children
        const siblingRoles = subAgentPrompts
          .filter(s => s.role.toUpperCase() !== role.toUpperCase())
          .map(s => s.role.toUpperCase());
        const siblingNodeIds = new Set<string>();
        for (const node of subAgent.nodes) {
          if (node.type !== 'AGENT') continue;
          const nodeRole = ((node.config?.agentRole as string) || node.label || '').toUpperCase();
          const isSibling = siblingRoles.some(sr =>
            nodeRole.includes(sr) || sr.includes(nodeRole) ||
            node.label.toUpperCase().includes(sr) || sr.includes(node.label.toUpperCase())
          );
          if (isSibling) siblingNodeIds.add(node.id);
        }
        if (siblingNodeIds.size > 0) {
          subAgent.nodes = subAgent.nodes.filter(n => !siblingNodeIds.has(n.id));
          subAgent.connections = subAgent.connections.filter(
            c => !siblingNodeIds.has(c.source) && !siblingNodeIds.has(c.target)
          );
          const remainingAgentIds = subAgent.nodes
            .filter(n => n.type === 'AGENT' && n.config?.linkedAgentId)
            .map(n => n.config.linkedAgentId as string);
          subAgent.childAgentIds = remainingAgentIds.length > 0 ? remainingAgentIds : undefined as any;
        }

        console.log(`[MultiAgent] ${role} attempt ${attempt + 1}: SUCCESS (${subAgent.nodes.length} nodes)`);
        progressState[i + 1] = { role, status: 'done' };
        onProgress?.([...progressState]);
        return subAgent;
      } catch (err) {
        clearTimeout(timeoutId!);
        const errDetail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.error(`[MultiAgent] ${role} attempt ${attempt + 1}: FAILED —`, errDetail);
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        if (attempt >= MAX_RETRIES) {
          const errMsg = err instanceof Error ? err.message : 'Failed';
          progressState[i + 1] = { role, status: 'error', error: errMsg };
          onProgress?.([...progressState]);
          throw err;
        }
      }
    }
    throw new Error(`${role}: all retries exhausted`);
  };

  const settled = await Promise.allSettled(
    subAgentPrompts.map((_, i) => generateOne(i))
  );

  // If the user aborted, surface the AbortError immediately
  for (const result of settled) {
    if (result.status === 'rejected') {
      const err = result.reason;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
    }
  }

  // Collect successful subagents
  const subAgentResults: AgentConfig[] = settled
    .filter((r): r is PromiseFulfilledResult<AgentConfig> => r.status === 'fulfilled')
    .map(r => r.value);

  console.log(`[MultiAgent] Final results: ${subAgentResults.length}/${subAgentPrompts.length} subagents succeeded`);
  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[MultiAgent] Subagent ${i} (${subAgentPrompts[i].role}) rejected:`, r.reason);
    } else {
      console.log(`[MultiAgent] Subagent ${i} (${subAgentPrompts[i].role}): ${r.value.nodes.length} nodes`);
    }
  });

  // Assign child IDs in original order
  for (const subAgent of subAgentResults) {
    master.childAgentIds.push(subAgent.id);
  }

  // ── Step A: Link existing AGENT nodes to subagents by scored role matching ──
  const linkedRoles = new Set<string>();
  const subRoles = subAgentResults.map(s => s.agentRole || '');

  for (const node of master.nodes) {
    if (node.type !== 'AGENT') continue;
    const nodeLabel = node.label || '';
    const availableRoles = subRoles.filter(r => !linkedRoles.has(r.toUpperCase()));

    let { bestMatch, confidence } = findBestRoleMatch(nodeLabel, availableRoles);

    if ((!bestMatch || confidence < 0.5) && availableRoles.length > 0) {
      const labelUpper = nodeLabel.toUpperCase();
      for (const role of availableRoles) {
        if (labelUpper.includes(role.toUpperCase()) || role.toUpperCase().includes(labelUpper)) {
          bestMatch = role;
          confidence = 0.8;
          break;
        }
      }
    }

    if (bestMatch && confidence >= 0.5) {
      const matchedSub = subAgentResults.find(s => (s.agentRole || '').toUpperCase() === bestMatch.toUpperCase());
      if (matchedSub) {
        node.config = {
          ...node.config,
          linkedAgentId: matchedSub.id,
          agentRole: matchedSub.agentRole,
          roleMatchConfidence: confidence,
        };
        linkedRoles.add(bestMatch.toUpperCase());
      }
    }
  }

  // ── Step B: Deduplicate AGENT nodes ─────────────────────────────────────────
  const seenAgentRoles = new Set<string>();
  const nodeIdsToRemove = new Set<string>();
  for (const node of master.nodes) {
    if (node.type !== 'AGENT') continue;
    const role = ((node.config?.agentRole as string) || node.label || '').toUpperCase();
    if (seenAgentRoles.has(role)) {
      nodeIdsToRemove.add(node.id);
    } else {
      seenAgentRoles.add(role);
    }
  }
  if (nodeIdsToRemove.size > 0) {
    master.nodes = master.nodes.filter(n => !nodeIdsToRemove.has(n.id));
    master.connections = master.connections.filter(
      c => !nodeIdsToRemove.has(c.source) && !nodeIdsToRemove.has(c.target)
    );
  }

  // ── Step C: Link existing in-flow AGENT nodes to subagent configs ─────────
  const agentNodes = master.nodes.filter(n => n.type === 'AGENT');
  for (const sub of subAgentResults) {
    const subRole = sub.agentRole || '';
    const alreadyLinked = agentNodes.some(n => {
      const nodeRole = (n.config?.agentRole as string) || n.label || '';
      const { confidence } = findBestRoleMatch(nodeRole, [subRole]);
      return confidence >= 0.5;
    });
    if (alreadyLinked) continue;

    const labelMatch = agentNodes.some(n =>
      n.label.toUpperCase().includes(subRole.toUpperCase()) ||
      subRole.toUpperCase().includes(n.label.toUpperCase())
    );
    if (labelMatch) continue;

    // No match at all — inject a standalone AGENT node (rare with V4)
    const newNodeId = `agent-node-${djb2(subRole.toUpperCase())}`;
    const newNode: NodeData = {
      id: newNodeId,
      type: 'AGENT',
      label: sub.agentRole || sub.name,
      description: `Sub-agent: ${sub.agentRole}`,
      config: {
        logicSnippet: sub.agentRole || '',
        sourceSection: 'Sub-Agents in this System',
        sourceFormat: 'prose',
        order: 9000 + subAgentResults.indexOf(sub),
        column: 'center',
        linkedAgentId: sub.id,
        agentRole: sub.agentRole,
      },
      position: { x: 0, y: 0 },
    };
    master.nodes.push(newNode);

    const stepNode = master.nodes.find(n => n.type === 'STEP' || n.type === 'ACTION');
    const anchor = stepNode ?? master.nodes.find(n => n.type === 'START') ?? master.nodes[0];
    if (anchor && anchor.id !== newNodeId) {
      master.connections.push({
        id: `conn-injected-${newNodeId}`,
        source: anchor.id,
        target: newNodeId,
        condition: sub.agentRole || undefined,
      });
    }
  }

  // ── Step D: Populate interface contracts on all AGENT nodes ─────────────
  for (const node of master.nodes) {
    if (node.type !== 'AGENT') continue;
    const contract = extractInterfaceContract(master, node.id);
    node.config = {
      ...node.config,
      interfaceContract: contract,
    };
  }

  return { master, subAgents: subAgentResults };
}
