/**
 * Experimental graph edit agent — sends only the relevant subgraph
 * (selected node + 1-hop neighbors) to Gemini to save tokens.
 *
 * Falls back to the full graph when no node is selected.
 * The standard graph-edit-agent.ts is untouched and remains the default.
 */

import { GoogleGenAI } from '@google/genai';
import type { AgentConfig, NodeData, Connection } from '../types';
import { DEFAULT_GEMINI_MODEL } from '../types';
import {
  type GraphEditResult,
  type GraphEditAgentResult,
  applyGraphEdits,
  GRAPH_EDIT_SYSTEM_PROMPT,
  GRAPH_EDIT_COMPACT_PROMPT,
  expandCompactEditResult,
  serializeGraphCompact,
} from './graph-edit-agent';
import { getGraphRuleSettings } from '../storage/storage';
import { DAG_RULES_FOR_EDITING } from '../dag-prompt-rules';
import yaml from 'js-yaml';

// Re-export so callers only need to import from this file
export type { GraphEditResult, GraphEditAgentResult };

// ── Serialization helpers ─────────────────────────────────────────────────

function serializeNode(n: NodeData) {
  return {
    id: n.id,
    type: n.type,
    label: n.label,
    description: n.description ?? '',
    config: {
      pfgType: (n.config as Record<string, unknown>)?.pfgType ?? n.type.toLowerCase(),
      logicSnippet: (n.config as Record<string, unknown>)?.logicSnippet ?? '',
      column: (n.config as Record<string, unknown>)?.column ?? 'center',
      ruleScope: (n.config as Record<string, unknown>)?.ruleScope ?? null,
      order: (n.config as Record<string, unknown>)?.order ?? 0,
    },
  };
}

function serializeConnection(c: Connection) {
  return {
    id: c.id,
    source: c.source,
    target: c.target,
    condition: c.condition ?? '',
  };
}

// ── Auto-detect relevant nodes from user message ──────────────────────────

/**
 * Score each node against the user's message using token overlap.
 * Returns node IDs sorted by relevance (highest first), or empty if
 * nothing matches well enough.
 */
export function detectRelevantNodes(
  agent: AgentConfig,
  userMessage: string,
): string[] {
  const msgTokens = tokenize(userMessage);
  if (msgTokens.size === 0) return [];

  const scored: { id: string; score: number }[] = [];

  for (const node of agent.nodes) {
    const nodeText = [
      node.label,
      node.description ?? '',
      (node.config as Record<string, unknown>)?.logicSnippet as string ?? '',
    ].join(' ');
    const nodeTokens = tokenize(nodeText);
    if (nodeTokens.size === 0) continue;

    // Jaccard-like overlap weighted toward message tokens
    let overlap = 0;
    for (const t of msgTokens) {
      if (nodeTokens.has(t)) overlap++;
    }
    // Also check if the node label appears as a substring in the message (fuzzy)
    const labelLower = node.label.toLowerCase();
    const msgLower = userMessage.toLowerCase();
    const substringBonus = msgLower.includes(labelLower) ? 0.5 : 0;

    const score = (overlap / msgTokens.size) + substringBonus;
    if (score > 0.15) {
      scored.push({ id: node.id, score });
    }
  }

  // Also check edge conditions — user might reference a condition label
  for (const conn of agent.connections) {
    if (!conn.condition) continue;
    const condLower = conn.condition.toLowerCase();
    const msgLower = userMessage.toLowerCase();
    if (msgLower.includes(condLower) || condLower.split(/\s+/).some(w => w.length > 3 && msgLower.includes(w))) {
      // Boost both endpoints
      for (const id of [conn.source, conn.target]) {
        const existing = scored.find(s => s.id === id);
        if (existing) existing.score += 0.3;
        else scored.push({ id, score: 0.3 });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.id);
}

/** Tokenize text into lowercase words, filtering out stop words and short tokens. */
function tokenize(text: string): Set<string> {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'only', 'same', 'than', 'too', 'very',
    'just', 'because', 'if', 'then', 'else', 'when', 'where', 'how',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'it', 'its', 'my', 'your', 'his', 'her', 'our', 'their',
    'add', 'remove', 'change', 'edit', 'update', 'modify', 'delete', 'set',
    'make', 'create', 'node', 'edge', 'graph', 'condition', 'label',
  ]);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  const result = new Set<string>();
  for (const w of words) {
    if (w.length > 2 && !STOP_WORDS.has(w)) result.add(w);
  }
  return result;
}

// ── Subgraph extraction ───────────────────────────────────────────────────

/**
 * Extract a subgraph centered on one or more anchor node IDs:
 * all anchors + their 1-hop neighbors + edges between the set.
 * Returns null if no anchor nodes are found.
 */
export function extractRelevantSubgraph(
  agent: AgentConfig,
  anchorNodeIds: string | string[],
) {
  const anchors = Array.isArray(anchorNodeIds) ? anchorNodeIds : [anchorNodeIds];
  const validAnchors = anchors.filter(id => agent.nodes.some(n => n.id === id));
  if (validAnchors.length === 0) return null;

  // Collect all anchor + 1-hop neighbor IDs
  const neighborIds = new Set<string>(validAnchors);
  for (const c of agent.connections) {
    if (neighborIds.has(c.source)) neighborIds.add(c.target);
    if (neighborIds.has(c.target)) neighborIds.add(c.source);
  }

  const subNodes = agent.nodes.filter(n => neighborIds.has(n.id));
  const subConns = agent.connections.filter(
    c => neighborIds.has(c.source) && neighborIds.has(c.target),
  );

  return {
    nodes: subNodes.map(serializeNode),
    connections: subConns.map(serializeConnection),
    anchorNodeIds: validAnchors,
    totalGraphNodes: agent.nodes.length,
    totalGraphConnections: agent.connections.length,
  };
}

// ── System prompt addendum for partial-graph mode ─────────────────────────

const PARTIAL_GRAPH_PREAMBLE = `
**IMPORTANT — PARTIAL GRAPH MODE (experimental)**

You are receiving a SUBSET of the full graph, not the entire graph.
Only the nodes and connections relevant to the user's edit (auto-detected
or manually selected) and their immediate neighbors are included.

Rules for partial-graph mode:
- You may reference node IDs that appear in the provided subgraph.
- Do NOT assume you have the full picture — avoid removing nodes/connections
  that might connect to parts of the graph you cannot see.
- If the edit clearly requires context beyond the provided subgraph,
  set "summary" to start with "[NEEDS_FULL_GRAPH] " and describe why.
  The system will automatically retry with the full graph.
- The "anchorNodeIds" field tells you which nodes were identified as relevant.
  Focus your edits around that area.
- promptUpdate strategy should be "none" in partial mode (the caller
  handles prompt sync separately when working with subgraphs).

`;

// ── Main entry point ──────────────────────────────────────────────────────

export interface ExperimentalGraphEditOptions {
  userMessage: string;
  currentAgent: AgentConfig;
  apiKey: string;
  model?: string;
  onChunk?: (text: string) => void;
  /** The currently selected node — if set, only its subgraph is sent. */
  selectedNodeId?: string | null;
}

export async function graphEditAgentExperimental(
  options: ExperimentalGraphEditOptions,
): Promise<GraphEditAgentResult & { usedPartialGraph: boolean; detectedNodeIds?: string[] }> {
  const {
    userMessage,
    currentAgent,
    apiKey,
    model = DEFAULT_GEMINI_MODEL,
    selectedNodeId,
  } = options;

  const graphRules = getGraphRuleSettings();
  const chatFormat = graphRules.chatEditFormat ?? 'json';

  // Determine anchor nodes: user-selected OR auto-detected from message
  let anchorIds: string[] = [];
  if (selectedNodeId) {
    anchorIds = [selectedNodeId];
  } else {
    const detected = detectRelevantNodes(currentAgent, userMessage);
    anchorIds = detected.slice(0, 3);
  }

  // Try subgraph extraction
  let usePartial = false;
  let subgraph: ReturnType<typeof extractRelevantSubgraph> = null;

  if (anchorIds.length > 0) {
    subgraph = extractRelevantSubgraph(currentAgent, anchorIds);
    if (subgraph && subgraph.nodes.length < currentAgent.nodes.length * 0.8) {
      usePartial = true;
    }
  }

  // YAML addendum for this module
  const YAML_ADDENDUM = `\n\n### OUTPUT FORMAT: YAML\n\nOutput your response as YAML using the same field names: summary, newNodes, newConnections, removedNodeIds, removedConnectionIds, updatedNodes, updatedConnections, promptUpdate.\nOutput ONLY the YAML. No markdown fences, no preamble.\n`;

  // ── Build input & system prompt based on format ──
  let userPrompt: string;
  let systemPrompt: string;
  let responseMimeType: string;
  let inputFormatUsed: 'json' | 'json-compact' = 'json';

  if (chatFormat === 'json-compact') {
    // Compact format — use compact serializer
    if (usePartial && subgraph) {
      // Compact partial graph
      const compactNodes = subgraph.nodes.map((n: any) => {
        const typeCode = (n.config?.pfgType ?? n.type ?? '').toLowerCase();
        const colMap: Record<string, string> = { left: 'l', center: 'c', right: 'r' };
        const col = colMap[n.config?.column ?? 'center'] ?? 'c';
        return [n.id, typeCode, n.label, n.config?.logicSnippet ?? '', col];
      });
      const compactConns = subgraph.connections.map((c: any) => [c.id, c.source, c.target, c.condition ?? '']);
      const compactSnapshot = JSON.stringify({
        id: currentAgent.id, name: currentAgent.name,
        op: currentAgent.originalPrompt ?? '',
        _partial: true, anchors: subgraph.anchorNodeIds,
        total: { n: subgraph.totalGraphNodes, c: subgraph.totalGraphConnections },
        n: compactNodes, c: compactConns,
      });
      userPrompt = `CURRENT AGENT GRAPH (compact, partial):\n${compactSnapshot}\n\nUSER EDIT REQUEST:\n${userMessage}`;
      systemPrompt = PARTIAL_GRAPH_PREAMBLE + GRAPH_EDIT_COMPACT_PROMPT;
    } else {
      const compactGraph = serializeGraphCompact(currentAgent);
      userPrompt = `CURRENT AGENT GRAPH (compact):\n${compactGraph}\n\nUSER EDIT REQUEST:\n${userMessage}`;
      systemPrompt = GRAPH_EDIT_COMPACT_PROMPT;
    }
    if (graphRules.injectDAGRulesInPrompts) systemPrompt += '\n\n' + DAG_RULES_FOR_EDITING;
    responseMimeType = 'application/json';
    inputFormatUsed = 'json-compact';
  } else {
    // Standard JSON input for both JSON and YAML
    let agentSnapshot: Record<string, unknown>;
    let promptPrefix = '';

    if (usePartial && subgraph) {
      agentSnapshot = {
        id: currentAgent.id, name: currentAgent.name,
        originalPrompt: currentAgent.originalPrompt ?? '',
        _partialGraph: true, anchorNodeIds: subgraph.anchorNodeIds,
        totalGraphNodes: subgraph.totalGraphNodes,
        totalGraphConnections: subgraph.totalGraphConnections,
        nodes: subgraph.nodes, connections: subgraph.connections,
      };
      promptPrefix = PARTIAL_GRAPH_PREAMBLE;
    } else {
      agentSnapshot = {
        id: currentAgent.id, name: currentAgent.name,
        originalPrompt: currentAgent.originalPrompt ?? '',
        nodes: currentAgent.nodes.map(serializeNode),
        connections: currentAgent.connections.map(serializeConnection),
      };
    }
    userPrompt = `CURRENT AGENT GRAPH:\n${JSON.stringify(agentSnapshot, null, 2)}\n\nUSER EDIT REQUEST:\n${userMessage}`;

    const basePrompt = promptPrefix + GRAPH_EDIT_SYSTEM_PROMPT;
    const withDag = graphRules.injectDAGRulesInPrompts ? basePrompt + '\n\n' + DAG_RULES_FOR_EDITING : basePrompt;

    if (chatFormat === 'yaml') {
      systemPrompt = withDag + YAML_ADDENDUM;
      responseMimeType = 'text/plain';
    } else {
      systemPrompt = withDag;
      responseMimeType = 'application/json';
    }
  }

  // ── Call Gemini ──
  const ai = new GoogleGenAI({ apiKey });

  let raw = '';
  const stream = await (ai.models as any).generateContentStream({
    model,
    config: {
      temperature: 0,
      topP: 0,
      thinkingConfig: (model?.includes('3.1') ? { thinkingLevel: 'MINIMAL' } : { thinkingBudget: 0 }) as any,
      responseMimeType,
      systemInstruction: systemPrompt,
    },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  });

  for await (const chunk of stream) {
    const text = (chunk as any).text ?? '';
    options.onChunk?.(text);
    raw += text;
  }

  const rawOutputChars = raw.length;

  // ── Parse based on format ──
  let editResult: GraphEditResult;
  try {
    if (chatFormat === 'yaml') {
      let yamlText = raw.trim();
      if (yamlText.startsWith('```')) {
        yamlText = yamlText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      }
      editResult = yaml.load(yamlText) as GraphEditResult;
    } else if (chatFormat === 'json-compact') {
      editResult = expandCompactEditResult(JSON.parse(raw));
    } else {
      editResult = JSON.parse(raw);
    }
  } catch {
    throw new Error(
      `Graph edit agent (experimental) returned invalid ${chatFormat.toUpperCase()}. Raw: ${raw.slice(0, 500)}`
    );
  }

  // Defensive normalization
  editResult.newNodes = editResult.newNodes ?? [];
  editResult.newConnections = editResult.newConnections ?? [];
  editResult.removedNodeIds = editResult.removedNodeIds ?? [];
  editResult.removedConnectionIds = editResult.removedConnectionIds ?? [];
  editResult.updatedNodes = editResult.updatedNodes ?? [];
  editResult.updatedConnections = editResult.updatedConnections ?? [];
  editResult.summary = editResult.summary ?? 'Graph updated';
  editResult.promptUpdates = editResult.promptUpdates ?? [{ strategy: 'none', insertText: '' }];

  // If partial mode and the AI says it needs full graph, retry with full graph
  if (usePartial && editResult.summary.startsWith('[NEEDS_FULL_GRAPH]')) {
    return graphEditAgentExperimental({
      ...options,
      selectedNodeId: null,
    }).then(result => ({ ...result, usedPartialGraph: false, detectedNodeIds: undefined }));
  }

  if (usePartial) {
    editResult.promptUpdates = [{ strategy: 'none', insertText: '' }];
  }

  const updatedAgent = applyGraphEdits(currentAgent, editResult);

  return {
    agent: updatedAgent,
    editResult,
    summary: editResult.summary,
    formatInfo: {
      inputFormat: inputFormatUsed,
      outputFormat: chatFormat,
      rawOutputChars,
    },
    usedPartialGraph: usePartial,
    detectedNodeIds: usePartial && !selectedNodeId ? anchorIds : undefined,
  };
}
