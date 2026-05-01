import type { AgentConfig, NodeData, Connection, SimplicityScore } from './types';

export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  maxDepth: number;
  branchingFactor: number;
  totalNodes: number;
  totalEdges: number;
  cognitiveLoad: number;
  score: 'simple' | 'moderate' | 'complex' | 'very-complex';
  suggestions: string[];
}

export function calculateComplexity(agent: AgentConfig): ComplexityMetrics {
  const { nodes, connections } = agent;
  const suggestions: string[] = [];

  // Calculate cyclomatic complexity (edges - nodes + 2)
  const cyclomaticComplexity = Math.max(1, connections.length - nodes.length + 2);

  // Calculate max depth using BFS
  const maxDepth = calculateMaxDepth(nodes, connections);

  // Calculate branching factor (average outgoing connections per node)
  const outgoingCounts = nodes.map(node =>
    connections.filter(c => c.source === node.id).length
  );
  const branchingFactor = outgoingCounts.length > 0
    ? outgoingCounts.reduce((a, b) => a + b, 0) / outgoingCounts.length
    : 0;

  // Calculate Cognitive Load Score (0-100)
  // Higher weights for nodes that require more LLM focus
  const WEIGHTS: Record<string, number> = {
    'RULE': 8,
    'GUARD': 8,
    'DECISION': 8,
    'CONDITION': 5,
    'TRIGGER': 5,
    'TASK': 4,
    'HANDOFF': 4,
    'ACTION': 3,
    'STEP': 3,
    'PERSONA': 2,
    'INPUT': 2,
    'CONFIG': 1,
    'MEMORY': 1,
    'LOGGING': 1,
    'REFERENCE': 1,
    'START': 1,
    'END': 1,
    'RESOLUTION': 1,
  };

  let rawCognitiveLoad = 0;
  nodes.forEach(node => {
    const baseWeight = WEIGHTS[node.type] || 2;
    // Add instruction density weight (description length)
    const densityWeight = Math.min(5, Math.floor((node.description?.length || 0) / 150));
    rawCognitiveLoad += baseWeight + densityWeight;
  });

  // Branching factor penalty
  rawCognitiveLoad += Math.floor(branchingFactor * 10);

  // Cyclomatic and depth penalties
  rawCognitiveLoad += (cyclomaticComplexity * 2) + (maxDepth * 1.5);

  const cognitiveLoad = Math.min(100, Math.round(rawCognitiveLoad));

  // Determine complexity score based on cognitive load
  let score: ComplexityMetrics['score'] = 'simple';
  if (cognitiveLoad >= 70) {
    score = 'very-complex';
    suggestions.push('Consider breaking this agent into smaller sub-agents');
  } else if (cognitiveLoad >= 45) {
    score = 'complex';
    suggestions.push('This agent has high cognitive load. Consider simplifying logic paths');
  } else if (cognitiveLoad >= 20) {
    score = 'moderate';
  }

  // Check for specific issues
  const orphanedNodes = nodes.filter(node =>
    !connections.some(c => c.source === node.id || c.target === node.id) && node.type !== 'AGENT'
  );
  if (orphanedNodes.length > 0) {
    suggestions.push(`Remove ${orphanedNodes.length} orphaned node${orphanedNodes.length > 1 ? 's' : ''}`);
  }

  const deadEnds = nodes.filter(node => {
    const outgoing = connections.filter(c => c.source === node.id);
    return outgoing.length === 0 && node.type !== 'RESOLUTION' && node.type !== 'MEMORY';
  });
  if (deadEnds.length > 0) {
    suggestions.push(`Add resolution nodes for ${deadEnds.length} dead-end path${deadEnds.length > 1 ? 's' : ''}`);
  }

  return {
    cyclomaticComplexity,
    maxDepth,
    branchingFactor: Math.round(branchingFactor * 10) / 10,
    totalNodes: nodes.length,
    totalEdges: connections.length,
    cognitiveLoad,
    score,
    suggestions,
  };
}

// ── PDF Action Verbs (from Google Prompt Engineering whitepaper p.55) ──────────
const PDF_ACTION_VERBS = new Set([
  'act', 'analyze', 'categorize', 'classify', 'contrast', 'compare', 'create',
  'describe', 'define', 'evaluate', 'extract', 'find', 'generate', 'identify',
  'list', 'measure', 'organize', 'parse', 'pick', 'predict', 'provide', 'rank',
  'recommend', 'return', 'retrieve', 'rewrite', 'select', 'show', 'sort',
  'summarize', 'translate', 'write',
]);

const FILLER_PHRASES = [
  'please ', 'basically ', 'in order to ', 'it is important that ',
  'you should note that ', 'it should be noted ', 'as you know ',
  'needless to say ', 'of course ',
];

export function calculateSimplicityScore(agent: AgentConfig): SimplicityScore {
  // Gather all text: originalPrompt + node descriptions + logicSnippets
  const textParts: string[] = [];
  if (agent.originalPrompt) textParts.push(agent.originalPrompt);
  for (const node of agent.nodes) {
    if (node.description) textParts.push(node.description);
    if (node.config?.logicSnippet) textParts.push(node.config.logicSnippet);
  }
  const fullText = textParts.join(' ');

  if (!fullText.trim()) {
    return { score: 100, level: 'green', avgSentenceLength: 0, fillerPhraseCount: 0, actionVerbCount: 0, redundancyCount: 0 };
  }

  // Average sentence length
  const sentences = fullText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  const avgSentenceLength = sentences.length > 0
    ? Math.round(sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length)
    : 0;

  // Filler phrase count
  const lowerText = fullText.toLowerCase();
  const fillerPhraseCount = FILLER_PHRASES.reduce((count, phrase) => {
    let idx = 0;
    let found = 0;
    while ((idx = lowerText.indexOf(phrase, idx)) !== -1) { found++; idx += phrase.length; }
    return count + found;
  }, 0);

  // Action verb count (first 100 words of originalPrompt only for initial signal)
  const first100Words = (agent.originalPrompt || '').toLowerCase().split(/\s+/).slice(0, 100);
  const actionVerbCount = first100Words.filter(w => PDF_ACTION_VERBS.has(w.replace(/[^a-z]/g, ''))).length;

  // Redundancy: detect instruction phrases repeated 3+ times
  const instructionPhrases = sentences
    .map(s => s.toLowerCase().split(/\s+/).slice(0, 5).join(' '))
    .filter(p => p.length > 10);
  const phraseCounts: Record<string, number> = {};
  for (const p of instructionPhrases) {
    phraseCounts[p] = (phraseCounts[p] || 0) + 1;
  }
  const redundancyCount = Object.values(phraseCounts).filter(c => c >= 3).length;

  // Score formula
  const base = 100
    - (avgSentenceLength > 30 ? 20 : avgSentenceLength > 20 ? 10 : 0)
    - (fillerPhraseCount * 5)
    - (redundancyCount * 10)
    + (actionVerbCount > 0 ? 10 : 0);
  const score = Math.max(0, Math.min(100, base));
  const level = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';

  return { score, level, avgSentenceLength, fillerPhraseCount, actionVerbCount, redundancyCount };
}

function calculateMaxDepth(nodes: NodeData[], connections: Connection[]): number {
  if (nodes.length === 0) return 0;

  // Find start node
  const incomingConnections = new Set(connections.map(c => c.target));
  const startNode = nodes.find(n => n.type === 'AGENT' && !incomingConnections.has(n.id));

  if (!startNode) return 1;

  const visited = new Set<string>();
  const queue: { nodeId: string; depth: number }[] = [{ nodeId: startNode.id, depth: 0 }];
  let maxDepth = 0;

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    maxDepth = Math.max(maxDepth, depth);

    const outgoing = connections.filter(c => c.source === nodeId);
    outgoing.forEach(conn => {
      if (!visited.has(conn.target)) {
        queue.push({ nodeId: conn.target, depth: depth + 1 });
      }
    });
  }

  return maxDepth;
}
