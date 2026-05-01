import type { AgentConfig, Connection, NodeData, PromptPattern } from './types';

// ── Built-in Pattern Definitions ─────────────────────────────────────────────
// Node positions are relative to (0, 0). insertPatternIntoGraph() offsets them.
// Placeholder IDs (e.g. "p-cot-1") are replaced with crypto.randomUUID() on insert.

export const BUILT_IN_PATTERNS: PromptPattern[] = [
  // ── 1. Chain of Thought ────────────────────────────────────────────────────
  {
    id: 'chain-of-thought',
    name: 'Chain of Thought',
    description: 'Sequential reasoning: break a problem into 3 explicit thinking steps before producing an answer.',
    category: 'reasoning',
    icon: '🔗',
    tags: ['reasoning', 'steps', 'cot', 'thinking'],
    entryNodeId: 'p-cot-1',
    exitNodeIds: ['p-cot-3'],
    nodes: [
      { id: 'p-cot-1', type: 'STEP', label: 'Analyse Problem', description: 'Identify the core problem, constraints, and what success looks like.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-cot-2', type: 'STEP', label: 'Reason Through', description: 'Work through the problem step-by-step, considering alternatives.', config: {}, position: { x: 0, y: 120 } },
      { id: 'p-cot-3', type: 'STEP', label: 'Formulate Answer', description: 'Synthesise findings into a clear, justified final answer.', config: {}, position: { x: 0, y: 240 } },
    ],
    connections: [
      { id: 'p-cot-c1', source: 'p-cot-1', target: 'p-cot-2' },
      { id: 'p-cot-c2', source: 'p-cot-2', target: 'p-cot-3' },
    ],
  },

  // ── 2. Self-Critique Loop ──────────────────────────────────────────────────
  {
    id: 'self-critique',
    name: 'Self-Critique Loop',
    description: 'Generate a response, evaluate quality, and retry if it does not meet the bar.',
    category: 'reasoning',
    icon: '🔄',
    tags: ['critique', 'retry', 'loop', 'quality'],
    entryNodeId: 'p-sc-1',
    exitNodeIds: ['p-sc-1', 'p-sc-3'],
    nodes: [
      { id: 'p-sc-1', type: 'ACTION', label: 'Generate Response', description: 'Produce an initial response or solution.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-sc-2', type: 'GUARD', label: 'Quality Check', description: 'Evaluate the response: is it accurate, complete, and on-topic?', config: {}, position: { x: 0, y: 120 } },
      { id: 'p-sc-3', type: 'DECISION', label: 'Accept or Retry?', description: 'If quality passes, proceed. If not, regenerate.', config: {}, position: { x: 0, y: 240 } },
    ],
    connections: [
      { id: 'p-sc-c1', source: 'p-sc-1', target: 'p-sc-2' },
      { id: 'p-sc-c2', source: 'p-sc-2', target: 'p-sc-3' },
      { id: 'p-sc-c3', source: 'p-sc-3', target: 'p-sc-1', condition: 'retry' },
    ],
  },

  // ── 3. Input Guard ────────────────────────────────────────────────────────
  {
    id: 'input-guard',
    name: 'Input Guard',
    description: 'Validate incoming input before processing. Reject invalid input early.',
    category: 'validation',
    icon: '🛡️',
    tags: ['validation', 'guard', 'input', 'safety'],
    entryNodeId: 'p-ig-1',
    exitNodeIds: ['p-ig-2'],
    nodes: [
      { id: 'p-ig-1', type: 'GUARD', label: 'Validate Input', description: 'Check that the input meets required format, length, and content rules.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-ig-2', type: 'CONDITION', label: 'Valid or Invalid?', description: 'Route valid input to processing. Reject invalid input with a clear error message.', config: {}, position: { x: 0, y: 120 } },
    ],
    connections: [
      { id: 'p-ig-c1', source: 'p-ig-1', target: 'p-ig-2' },
    ],
  },

  // ── 4. Schema Validator ───────────────────────────────────────────────────
  {
    id: 'schema-validator',
    name: 'Schema Validator',
    description: 'Apply a schema rule, check compliance, and resolve mismatches gracefully.',
    category: 'validation',
    icon: '📐',
    tags: ['schema', 'format', 'validation', 'data'],
    entryNodeId: 'p-sv-1',
    exitNodeIds: ['p-sv-3'],
    nodes: [
      { id: 'p-sv-1', type: 'RULE', label: 'Schema Rule', description: 'Define the expected data schema, required fields, and types.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-sv-2', type: 'CONDITION', label: 'Schema Check', description: 'Check whether input conforms to the schema rule.', config: {}, position: { x: 0, y: 120 } },
      { id: 'p-sv-3', type: 'RESOLUTION', label: 'Handle Mismatch', description: 'If schema violation detected, coerce, fix, or return an error to the caller.', config: {}, position: { x: 0, y: 240 } },
    ],
    connections: [
      { id: 'p-sv-c1', source: 'p-sv-1', target: 'p-sv-2' },
      { id: 'p-sv-c2', source: 'p-sv-2', target: 'p-sv-3', condition: 'invalid' },
    ],
  },

  // ── 5. Graceful Fallback ──────────────────────────────────────────────────
  {
    id: 'graceful-fallback',
    name: 'Graceful Fallback',
    description: 'Try the primary action; if it fails, execute a fallback rather than erroring out.',
    category: 'error-handling',
    icon: '🪂',
    tags: ['fallback', 'error', 'resilience', 'try-catch'],
    entryNodeId: 'p-gf-1',
    exitNodeIds: ['p-gf-2', 'p-gf-3'],
    nodes: [
      { id: 'p-gf-1', type: 'CONDITION', label: 'Try Primary Path?', description: 'Decide whether the primary action is available and safe to attempt.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-gf-2', type: 'ACTION', label: 'Primary Action', description: 'The preferred action to take when conditions allow.', config: {}, position: { x: -140, y: 120 } },
      { id: 'p-gf-3', type: 'ACTION', label: 'Fallback Action', description: 'A safe alternative when the primary action is unavailable or fails.', config: {}, position: { x: 140, y: 120 } },
    ],
    connections: [
      { id: 'p-gf-c1', source: 'p-gf-1', target: 'p-gf-2', condition: 'available' },
      { id: 'p-gf-c2', source: 'p-gf-1', target: 'p-gf-3', condition: 'unavailable' },
    ],
  },

  // ── 6. Retry & Escalate ────────────────────────────────────────────────────
  {
    id: 'retry-escalate',
    name: 'Retry & Escalate',
    description: 'Attempt an action, check the result, retry on transient failure, and escalate if retries are exhausted.',
    category: 'error-handling',
    icon: '🆙',
    tags: ['retry', 'escalate', 'error', 'handoff'],
    entryNodeId: 'p-re-1',
    exitNodeIds: ['p-re-4'],
    nodes: [
      { id: 'p-re-1', type: 'ACTION', label: 'Attempt Action', description: 'Execute the primary action.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-re-2', type: 'GUARD', label: 'Check Result', description: 'Did the action succeed? Inspect output for errors or partial failure.', config: {}, position: { x: 0, y: 120 } },
      { id: 'p-re-3', type: 'DECISION', label: 'Retry or Escalate?', description: 'On failure: retry if attempts remain, otherwise escalate to a human or senior system.', config: {}, position: { x: 0, y: 240 } },
      { id: 'p-re-4', type: 'HANDOFF', label: 'Escalate', description: 'Hand off to a human agent or escalation system with full context of the failure.', config: {}, position: { x: 0, y: 360 } },
    ],
    connections: [
      { id: 'p-re-c1', source: 'p-re-1', target: 'p-re-2' },
      { id: 'p-re-c2', source: 'p-re-2', target: 'p-re-3', condition: 'failed' },
      { id: 'p-re-c3', source: 'p-re-3', target: 'p-re-1', condition: 'retry' },
      { id: 'p-re-c4', source: 'p-re-3', target: 'p-re-4', condition: 'escalate' },
    ],
  },

  // ── 7. Priority Router ─────────────────────────────────────────────────────
  {
    id: 'priority-router',
    name: 'Priority Router',
    description: 'Route incoming requests to one of three paths based on priority, type, or criteria.',
    category: 'routing',
    icon: '🚦',
    tags: ['routing', 'decision', 'branch', 'priority'],
    entryNodeId: 'p-pr-1',
    exitNodeIds: ['p-pr-2', 'p-pr-3', 'p-pr-4'],
    nodes: [
      { id: 'p-pr-1', type: 'DECISION', label: 'Route by Priority', description: 'Classify the request and route it to the appropriate handler.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-pr-2', type: 'OPTION', label: 'High Priority', description: 'Handle urgent or critical requests immediately.', config: {}, position: { x: -200, y: 140 } },
      { id: 'p-pr-3', type: 'OPTION', label: 'Normal Priority', description: 'Handle standard requests through the default flow.', config: {}, position: { x: 0, y: 140 } },
      { id: 'p-pr-4', type: 'OPTION', label: 'Low Priority', description: 'Defer or batch low-priority requests.', config: {}, position: { x: 200, y: 140 } },
    ],
    connections: [
      { id: 'p-pr-c1', source: 'p-pr-1', target: 'p-pr-2', condition: 'high' },
      { id: 'p-pr-c2', source: 'p-pr-1', target: 'p-pr-3', condition: 'normal' },
      { id: 'p-pr-c3', source: 'p-pr-1', target: 'p-pr-4', condition: 'low' },
    ],
  },

  // ── 8. Fan-out Aggregator ──────────────────────────────────────────────────
  {
    id: 'fan-out-aggregator',
    name: 'Fan-out Aggregator',
    description: 'Split work across two parallel actions, then aggregate results into one response.',
    category: 'routing',
    icon: '🕸️',
    tags: ['parallel', 'aggregate', 'fan-out', 'merge'],
    entryNodeId: 'p-fa-1',
    exitNodeIds: ['p-fa-4'],
    nodes: [
      { id: 'p-fa-1', type: 'DECISION', label: 'Fan Out', description: 'Split the request into parallel workloads.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-fa-2', type: 'ACTION', label: 'Worker A', description: 'Process the first portion of the workload.', config: {}, position: { x: -140, y: 140 } },
      { id: 'p-fa-3', type: 'ACTION', label: 'Worker B', description: 'Process the second portion of the workload.', config: {}, position: { x: 140, y: 140 } },
      { id: 'p-fa-4', type: 'RESOLUTION', label: 'Aggregate Results', description: 'Merge results from all workers into a single coherent response.', config: {}, position: { x: 0, y: 280 } },
    ],
    connections: [
      { id: 'p-fa-c1', source: 'p-fa-1', target: 'p-fa-2' },
      { id: 'p-fa-c2', source: 'p-fa-1', target: 'p-fa-3' },
      { id: 'p-fa-c3', source: 'p-fa-2', target: 'p-fa-4' },
      { id: 'p-fa-c4', source: 'p-fa-3', target: 'p-fa-4' },
    ],
  },

  // ── 9. Context Accumulator ─────────────────────────────────────────────────
  {
    id: 'context-accumulator',
    name: 'Context Accumulator',
    description: 'Read prior context from memory, enrich with current processing, and write updated context back.',
    category: 'memory',
    icon: '🧠',
    tags: ['memory', 'context', 'state', 'accumulate'],
    entryNodeId: 'p-ca-1',
    exitNodeIds: ['p-ca-3'],
    nodes: [
      { id: 'p-ca-1', type: 'MEMORY', label: 'Read Context', description: 'Load relevant prior context from memory (conversation history, user profile, session state).', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-ca-2', type: 'ACTION', label: 'Process with Context', description: 'Execute the task using loaded context to produce an informed output.', config: {}, position: { x: 0, y: 140 } },
      { id: 'p-ca-3', type: 'MEMORY', label: 'Update Context', description: 'Persist new information and updated state back to memory for future turns.', config: {}, position: { x: 0, y: 280 } },
    ],
    connections: [
      { id: 'p-ca-c1', source: 'p-ca-1', target: 'p-ca-2' },
      { id: 'p-ca-c2', source: 'p-ca-2', target: 'p-ca-3' },
    ],
  },

  // ── 10. Safe Tool Wrapper ──────────────────────────────────────────────────
  {
    id: 'safe-tool-wrapper',
    name: 'Safe Tool Wrapper',
    description: 'Validate before calling a tool, call it, then inspect the result — with a guard at each step.',
    category: 'integration',
    icon: '🔧',
    tags: ['tool', 'integration', 'safety', 'wrapper'],
    entryNodeId: 'p-tw-1',
    exitNodeIds: ['p-tw-3'],
    nodes: [
      { id: 'p-tw-1', type: 'GUARD', label: 'Pre-call Validation', description: 'Verify inputs and permissions before invoking the external tool.', config: {}, position: { x: 0, y: 0 } },
      { id: 'p-tw-2', type: 'TOOL', label: 'Tool Call', description: 'Invoke the external tool or service with validated parameters.', config: {}, position: { x: 0, y: 140 } },
      { id: 'p-tw-3', type: 'CONDITION', label: 'Check Tool Result', description: 'Inspect the tool response: success path or error handling path.', config: {}, position: { x: 0, y: 280 } },
    ],
    connections: [
      { id: 'p-tw-c1', source: 'p-tw-1', target: 'p-tw-2' },
      { id: 'p-tw-c2', source: 'p-tw-2', target: 'p-tw-3' },
    ],
  },
];

// ── Pattern categories metadata (for UI display) ──────────────────────────────
export const PATTERN_CATEGORIES = [
  { id: 'reasoning',      label: 'Reasoning',       icon: '🔗' },
  { id: 'validation',     label: 'Validation',      icon: '🛡️' },
  { id: 'error-handling', label: 'Error Handling',  icon: '🪂' },
  { id: 'routing',        label: 'Routing',          icon: '🚦' },
  { id: 'memory',         label: 'Memory',           icon: '🧠' },
  { id: 'integration',    label: 'Integration',      icon: '🔧' },
] as const;

// ── Insertion utility ─────────────────────────────────────────────────────────

export function insertPatternIntoGraph(
  agent: AgentConfig,
  pattern: PromptPattern,
  position: { x: number; y: number },
  connectToNodeId?: string
): { updatedAgent: AgentConfig; insertedNodeIds: string[] } {
  const idMap = new Map<string, string>();
  for (const node of pattern.nodes) {
    idMap.set(node.id, crypto.randomUUID());
  }

  const insertedNodes: NodeData[] = pattern.nodes.map(node => ({
    ...node,
    id: idMap.get(node.id)!,
    config: { ...node.config },
    position: {
      x: node.position.x + position.x,
      y: node.position.y + position.y,
    },
  }));

  const insertedConnections: Connection[] = pattern.connections.map(conn => ({
    ...conn,
    id: crypto.randomUUID(),
    source: idMap.get(conn.source) ?? conn.source,
    target: idMap.get(conn.target) ?? conn.target,
  }));

  const autoConnections: Connection[] = [];
  if (connectToNodeId) {
    const newEntryId = idMap.get(pattern.entryNodeId);
    if (newEntryId) {
      autoConnections.push({
        id: crypto.randomUUID(),
        source: connectToNodeId,
        target: newEntryId,
      });
    }
  }

  const updatedAgent: AgentConfig = {
    ...agent,
    nodes: [...agent.nodes, ...insertedNodes],
    connections: [...agent.connections, ...insertedConnections, ...autoConnections],
    updatedAt: new Date().toISOString(),
  };

  return { updatedAgent, insertedNodeIds: insertedNodes.map(n => n.id) };
}
