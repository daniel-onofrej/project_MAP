import { GoogleGenAI } from '@google/genai';
import type { AgentConfig, NodeData, Connection, AnalysisCategory, RiskPermission, CognitiveLoadScore, SimplicityScore, InstructionConstraintRatio } from '../types';
import { DEFAULT_GEMINI_MODEL } from '../types';
import { calculateComplexity, calculateSimplicityScore } from '../complexity-metrics';
import { detectRiskPermissions } from '../capability-analyzer';
import { applyAutoLayout } from '../graph/auto-layout';
import { getGraphRuleSettings } from '../storage/storage';
import { DAG_RULES_FOR_ANALYSIS } from '../dag-prompt-rules';

// ── Shared types ────────────────────────────────────────────────────────────

export interface AIConflictIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: AnalysisCategory;
  type: string;
  title: string;
  description: string;
  suggestion: string;
  nodeIds: string[];
  quotedPhrase?: string;
  conflictPair?: [string, string];
}

export interface ConflictFix {
  issueId: string;
  updateNodes: { id: string; label?: string; type?: string; description?: string; config?: Record<string, any> }[];
  updateEdges: { id: string; condition?: string; source?: string; target?: string }[];
  addNodes: NodeData[];
  addEdges: Connection[];
  removeNodeIds: string[];
  removeEdgeIds: string[];
  /** Patch originalPrompt: replace each `find` string with `replace` */
  promptReplacements?: { find: string; replace: string }[];
}

export interface DeterministicResult {
  issues: AIConflictIssue[];
  riskPermissions: RiskPermission[];
  cognitiveLoadScore: CognitiveLoadScore;
  simplicityScore: SimplicityScore;
  instructionConstraintRatio: InstructionConstraintRatio;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: DETERMINISTIC ANALYSIS (instant, no API call)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Column helpers ──────────────────────────────────────────────────────────

const RIGHT_COLUMN_TYPES = new Set([
  'RULE', 'TOOL', 'CONFIG', 'MEMORY', 'GUARD', 'REFERENCE', 'TRIGGER', 'LOGGING',
]);
const LEFT_COLUMN_TYPES = new Set(['PERSONA', 'INPUT']);
const CENTER_COLUMN_TYPES = new Set([
  'START', 'END', 'ACTION', 'STEP', 'DECISION', 'CONDITION', 'OPTION',
  'AGENT', 'TASK', 'HANDOFF', 'RESOLUTION',
]);

function resolveColumn(node: NodeData): 'left' | 'center' | 'right' {
  const col = node.config?.column;
  if (col === 'left' || col === 'center' || col === 'right') return col;
  if (LEFT_COLUMN_TYPES.has(node.type)) return 'left';
  if (RIGHT_COLUMN_TYPES.has(node.type)) return 'right';
  return 'center';
}

// ── Cognitive Load Score ────────────────────────────────────────────────────

function calculateCognitiveLoad(agent: AgentConfig): CognitiveLoadScore {
  const complexity = calculateComplexity(agent);
  const ruleCount = agent.nodes.filter(n => n.type === 'RULE').length;
  const conditionNodes = agent.nodes.filter(n => n.type === 'CONDITION' || n.type === 'DECISION');
  const conditionDepth = complexity.maxDepth;
  const constraintDensity = agent.nodes.length > 0
    ? ruleCount / agent.nodes.length
    : 0;

  // Score 0-100 based on weighted factors
  const rawScore =
    (complexity.cyclomaticComplexity * 4) +
    (ruleCount * 5) +
    (conditionNodes.length * 6) +
    (complexity.maxDepth * 3) +
    (constraintDensity * 30);

  const score = Math.min(100, Math.round(rawScore));
  const level = score >= 70 ? 'red' : score >= 40 ? 'yellow' : 'green';

  return {
    score,
    level,
    ruleCount,
    conditionDepth,
    constraintDensity: Math.round(constraintDensity * 100) / 100,
  };
}

// ── Deterministic: Prompt Quality checks ────────────────────────────────────

function checkCognitiveOverload(agent: AgentConfig, loadScore: CognitiveLoadScore): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];

  if (loadScore.level === 'red') {
    issues.push({
      id: 'det_overload_critical',
      severity: 'critical',
      category: 'prompt-quality',
      type: 'cognitive_overload',
      title: 'Agent is overloaded with constraints',
      description: `Cognitive load score: ${loadScore.score}/100. ${loadScore.ruleCount} rules, ${loadScore.conditionDepth} levels deep, ${Math.round(loadScore.constraintDensity * 100)}% constraint density. LLMs struggle with this many simultaneous constraints — instructions will be dropped or randomly prioritized.`,
      suggestion: 'Split this agent into smaller sub-agents, each handling a focused responsibility. Use the Multi-Agent Wizard to create a router + specialized agents.',
      nodeIds: agent.nodes.filter(n => n.type === 'RULE').map(n => n.id),
    });
  } else if (loadScore.level === 'yellow') {
    issues.push({
      id: 'det_overload_warning',
      severity: 'warning',
      category: 'prompt-quality',
      type: 'cognitive_overload',
      title: 'Moderate cognitive load',
      description: `Cognitive load score: ${loadScore.score}/100. ${loadScore.ruleCount} rules, ${loadScore.conditionDepth} levels deep. This is manageable but approaching the limit where LLMs start dropping instructions.`,
      suggestion: 'Consider consolidating related rules or extracting complex branches into sub-agents.',
      nodeIds: [],
    });
  }

  return issues;
}

function checkUndefinedOutputStructure(agent: AgentConfig): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];

  // Check originalPrompt for output-related keywords
  const prompt = (agent.originalPrompt ?? '').toLowerCase();
  const outputKeywords = ['output', 'format', 'return', 'respond with', 'produce', 'generate', 'template', 'structure', 'schema', 'json', 'markdown', 'csv'];
  const hasOutputInPrompt = outputKeywords.some(kw => prompt.includes(kw));

  // Check END/HANDOFF nodes for descriptions
  const terminalNodes = agent.nodes.filter(n => n.type === 'END' || n.type === 'HANDOFF');
  const terminalWithDesc = terminalNodes.filter(n => n.description && n.description.trim().length > 10);

  if (!hasOutputInPrompt && terminalWithDesc.length === 0 && agent.nodes.length > 2) {
    issues.push({
      id: 'det_no_output_format',
      severity: 'warning',
      category: 'prompt-quality',
      type: 'undefined_output',
      title: 'No output format defined',
      description: 'The prompt does not specify what format the agent should produce, and END/HANDOFF nodes have no output descriptions. Without a defined structure, different runs will produce inconsistent layouts and evaluation becomes impossible.',
      suggestion: 'Add an output format section to the prompt specifying the expected structure (e.g., JSON schema, markdown template, bullet points). Also add descriptions to END nodes explaining what they produce.',
      nodeIds: terminalNodes.map(n => n.id),
    });
  } else if (terminalNodes.length > 0 && terminalWithDesc.length === 0 && hasOutputInPrompt) {
    issues.push({
      id: 'det_end_no_desc',
      severity: 'info',
      category: 'prompt-quality',
      type: 'undefined_output',
      title: 'END nodes lack output descriptions',
      description: 'The prompt mentions output format, but END/HANDOFF nodes have no descriptions. This makes it unclear what each terminal path produces.',
      suggestion: 'Add descriptions to END/HANDOFF nodes specifying the output they produce.',
      nodeIds: terminalNodes.map(n => n.id),
    });
  }

  return issues;
}

// Known contradiction pairs for deterministic conflict detection
const CONTRADICTION_PAIRS: [string[], string[]][] = [
  // Verbosity
  [['concise', 'brief', 'short', 'minimal', 'succinct', 'terse'], ['thorough', 'detailed', 'comprehensive', 'exhaustive', 'complete', 'in-depth', 'elaborate', 'verbose']],
  // Speed vs accuracy
  [['fast', 'quick', 'rapid', 'efficient', 'speedy', 'instant'], ['careful', 'accurate', 'precise', 'meticulous', 'rigorous', 'thorough', 'deliberate']],
  // Simplicity vs complexity
  [['simple', 'straightforward', 'basic', 'plain', 'easy', 'minimalist'], ['complex', 'nuanced', 'sophisticated', 'advanced', 'intricate']],
  // Tone: formal vs casual
  [['formal', 'professional', 'corporate', 'businesslike', 'polished'], ['casual', 'informal', 'conversational', 'friendly', 'relaxed', 'colloquial']],
  // Rigidity vs flexibility
  [['strict', 'rigid', 'exact', 'literal', 'verbatim', 'prescriptive'], ['flexible', 'adaptive', 'creative', 'interpretive', 'lenient', 'loose']],
  // Autonomy vs confirmation
  [['autonomous', 'independent', 'automatic', 'self-directed', 'never ask', 'don\'t ask'], ['confirm', 'verify', 'ask permission', 'check with', 'approval', 'authorize', 'always ask']],
  // Permissiveness vs restriction
  [['never refuse', 'always help', 'always comply', 'accept all', 'no restrictions'], ['reject', 'refuse', 'deny', 'block', 'restrict', 'forbidden', 'prohibited', 'never allow']],
  // Brevity vs explanation
  [['no explanation', 'just the answer', 'skip reasoning', 'answer only'], ['explain', 'reasoning', 'step-by-step', 'show your work', 'justify', 'walk through']],
  // Proactive vs reactive
  [['proactive', 'anticipate', 'suggest', 'recommend', 'offer'], ['only when asked', 'reactive', 'wait for', 'on request', 'don\'t suggest']],
  // Confidence vs hedging
  [['confident', 'definitive', 'assertive', 'certain', 'authoritative'], ['hedging', 'uncertain', 'cautious', 'maybe', 'might', 'qualify', 'disclaimer']],
  // Broad vs focused
  [['broad', 'wide-ranging', 'general', 'cover everything', 'holistic'], ['focused', 'narrow', 'specific', 'targeted', 'limited scope', 'only relevant']],
  // Empathetic vs neutral
  [['empathetic', 'emotional', 'supportive', 'compassionate', 'caring'], ['neutral', 'objective', 'impartial', 'unemotional', 'detached', 'clinical']],
  // Verbose error handling vs silent
  [['fail silently', 'ignore errors', 'skip failures', 'suppress'], ['fail loudly', 'raise error', 'throw exception', 'halt on error', 'stop on failure']],
  // Prioritization conflicts
  [['prioritize speed', 'performance first', 'optimize for speed'], ['prioritize accuracy', 'correctness first', 'optimize for quality']],
  [['prioritize security', 'security first', 'never trust'], ['prioritize usability', 'user experience first', 'frictionless', 'seamless']],
];

function checkConflictingInstructions(agent: AgentConfig): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];
  const ruleNodes = agent.nodes.filter(n => n.type === 'RULE' || n.type === 'PERSONA');

  for (let i = 0; i < ruleNodes.length; i++) {
    for (let j = i + 1; j < ruleNodes.length; j++) {
      const textA = `${ruleNodes[i].label} ${ruleNodes[i].description ?? ''} ${ruleNodes[i].config?.logic_snippet ?? ''}`.toLowerCase();
      const textB = `${ruleNodes[j].label} ${ruleNodes[j].description ?? ''} ${ruleNodes[j].config?.logic_snippet ?? ''}`.toLowerCase();

      for (const [groupA, groupB] of CONTRADICTION_PAIRS) {
        const aHasFirst = groupA.some(w => textA.includes(w));
        const bHasSecond = groupB.some(w => textB.includes(w));
        const aHasSecond = groupB.some(w => textA.includes(w));
        const bHasFirst = groupA.some(w => textB.includes(w));

        if ((aHasFirst && bHasSecond) || (aHasSecond && bHasFirst)) {
          const matchedA = aHasFirst
            ? groupA.find(w => textA.includes(w))!
            : groupB.find(w => textA.includes(w))!;
          const matchedB = aHasFirst
            ? groupB.find(w => textB.includes(w))!
            : groupA.find(w => textB.includes(w))!;

          issues.push({
            id: `det_conflict_${ruleNodes[i].id}_${ruleNodes[j].id}`,
            severity: 'critical',
            category: 'prompt-quality',
            type: 'conflicting_instructions',
            title: `Contradicting instructions: "${matchedA}" vs "${matchedB}"`,
            description: `"${ruleNodes[i].label}" uses "${matchedA}" while "${ruleNodes[j].label}" uses "${matchedB}". LLMs treat these as equal constraints and may oscillate between them or produce unstable outputs.`,
            suggestion: 'Reconcile these instructions: either remove one, or rewrite both to specify exactly when each applies (e.g., "Be concise in summaries, detailed in analysis sections").',
            nodeIds: [ruleNodes[i].id, ruleNodes[j].id],
            conflictPair: [ruleNodes[i].label, ruleNodes[j].label],
          });
          break; // One conflict per pair is enough
        }
      }
    }
  }

  return issues;
}

// ── Deterministic: Safety checks ────────────────────────────────────────────

function checkUnguardedRisks(riskPermissions: RiskPermission[]): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];

  for (const perm of riskPermissions) {
    if (perm.guardBypassed) {
      issues.push({
        id: `det_bypassed_${perm.nodeId}`,
        severity: 'critical',
        category: 'safety',
        type: 'guard_bypass',
        title: `Guard can be bypassed: ${perm.name}`,
        description: `"${perm.name}" has a GUARD node, but there exists an alternative path that reaches this action without passing through the guard.`,
        suggestion: `Ensure ALL paths to "${perm.name}" pass through the guard, or add guards on the alternative paths.`,
        nodeIds: [perm.nodeId, ...(perm.guardNodeId ? [perm.guardNodeId] : [])],
      });
    } else if (perm.riskLevel === 'high' && !perm.hasGuard) {
      issues.push({
        id: `det_unguarded_${perm.nodeId}`,
        severity: 'critical',
        category: 'safety',
        type: 'unguarded_dangerous_action',
        title: `Unguarded ${perm.category} action: ${perm.name}`,
        description: `"${perm.name}" performs a ${perm.category.replace('-', ' ')} operation without a preceding GUARD node. ${perm.reason ?? 'This action could cause irreversible damage.'}`,
        suggestion: `Add a GUARD node before "${perm.name}" that requires explicit confirmation.`,
        nodeIds: [perm.nodeId],
      });
    } else if (perm.riskLevel === 'medium' && !perm.hasGuard) {
      issues.push({
        id: `det_risky_${perm.nodeId}`,
        severity: 'warning',
        category: 'safety',
        type: 'risky_action_no_guard',
        title: `${perm.category} action without safety check: ${perm.name}`,
        description: `"${perm.name}" performs a ${perm.category.replace('-', ' ')} operation. ${perm.reason ?? 'Consider adding a safety check.'}`,
        suggestion: `Consider adding a GUARD node before "${perm.name}".`,
        nodeIds: [perm.nodeId],
      });
    }
  }

  return issues;
}

// ── Deterministic: Graph Structure checks ───────────────────────────────────

function checkDeadEnds(agent: AgentConfig): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];
  const hasOutgoing = new Set(agent.connections.map(c => c.source));

  for (const node of agent.nodes) {
    if (resolveColumn(node) !== 'center') continue;
    if (node.type === 'END' || node.type === 'HANDOFF') continue;
    if (!hasOutgoing.has(node.id)) {
      issues.push({
        id: `det_deadend_${node.id}`,
        severity: 'critical',
        category: 'graph-structure',
        type: 'dead_end',
        title: `Dead end: ${node.label}`,
        description: `"${node.label}" (${node.type}) has no outgoing connections. Execution will stop here without reaching a terminal state.`,
        suggestion: `Add a connection from "${node.label}" to the next step in the flow, or to an END node if this is a terminal action.`,
        nodeIds: [node.id],
      });
    }
  }

  return issues;
}

function checkUnreachableNodes(agent: AgentConfig): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];
  const hasIncoming = new Set(agent.connections.map(c => c.target));

  for (const node of agent.nodes) {
    if (resolveColumn(node) !== 'center') continue;
    if (node.type === 'START') continue;
    if (!hasIncoming.has(node.id)) {
      issues.push({
        id: `det_unreachable_${node.id}`,
        severity: 'warning',
        category: 'graph-structure',
        type: 'unreachable_node',
        title: `Unreachable: ${node.label}`,
        description: `"${node.label}" (${node.type}) has no incoming connections from any other node and is not a START node. It will never execute.`,
        suggestion: `Connect "${node.label}" to the appropriate point in the flow, or remove it if no longer needed.`,
        nodeIds: [node.id],
      });
    }
  }

  return issues;
}

function checkMissingFallbacks(agent: AgentConfig): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];
  const decisionNodes = agent.nodes.filter(n => n.type === 'DECISION' || n.type === 'CONDITION');

  for (const node of decisionNodes) {
    const outgoing = agent.connections.filter(c => c.source === node.id);
    if (outgoing.length === 0) continue; // Already caught by dead-end check

    // An edge counts as a fallback only if it explicitly says "else"/"default"/"otherwise"/"fallback",
    // OR if it's the only unconditioned edge (single exit = implicit default).
    // Multiple empty-condition edges are NOT treated as fallbacks — that's ambiguous.
    const conditionedEdges = outgoing.filter(e => (e.condition ?? '').trim() !== '');
    const unconditionedEdges = outgoing.filter(e => (e.condition ?? '').trim() === '');
    const hasExplicitDefault = outgoing.some(e => {
      const cond = (e.condition ?? '').toLowerCase();
      return cond.includes('else') || cond.includes('default') || cond.includes('otherwise') || cond.includes('fallback');
    });
    const hasImplicitDefault = unconditionedEdges.length === 1 && conditionedEdges.length > 0;
    const hasDefault = hasExplicitDefault || hasImplicitDefault;

    if (!hasDefault && conditionedEdges.length > 0) {
      issues.push({
        id: `det_nofallback_${node.id}`,
        severity: 'warning',
        category: 'graph-structure',
        type: 'missing_fallback',
        title: `No default branch: ${node.label}`,
        description: `"${node.label}" has ${outgoing.length} conditional branches but no default/else path. If no condition matches, execution will stall.`,
        suggestion: `Add a default/else branch from "${node.label}" to handle cases that don't match any condition.`,
        nodeIds: [node.id],
      });
    }
  }

  return issues;
}

// ── Deterministic: Prompt Injection Detection ────────────────────────────────

const INJECTION_PATTERNS: { pattern: RegExp; label: string; severity: 'critical' | 'warning' }[] = [
  // Direct override attempts
  { pattern: /ignore\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|rules?|prompts?|constraints?)/i, label: 'Instruction override attempt', severity: 'critical' },
  { pattern: /disregard\s+(all\s+)?(previous|above|prior|earlier)/i, label: 'Instruction disregard attempt', severity: 'critical' },
  { pattern: /forget\s+(everything|all|what)\s+(you|i)\s+(told|said|mentioned)/i, label: 'Memory wipe attempt', severity: 'critical' },
  // Role confusion / hijacking
  { pattern: /\b(system|assistant|admin)\s*:\s/i, label: 'Role injection (fake system/assistant prefix)', severity: 'critical' },
  { pattern: /you\s+are\s+now\s+(in\s+)?(a\s+)?(new|admin|root|unrestricted|god)\s*(mode)?/i, label: 'Role escalation attempt', severity: 'critical' },
  { pattern: /act\s+as\s+(if\s+)?(you\s+are\s+)?(a\s+)?(different|new|unrestricted)/i, label: 'Identity override attempt', severity: 'critical' },
  { pattern: /pretend\s+(that\s+)?(you|there)\s+(are|is)\s+no\s+(rules?|restrictions?|limits?|constraints?)/i, label: 'Constraint removal attempt', severity: 'critical' },
  // Template injection (unsanitized variables)
  { pattern: /\{\{\s*\w+\s*\}\}/i, label: 'Template variable ({{var}}) — may allow injection if user-supplied', severity: 'warning' },
  { pattern: /\$\{\s*\w+/i, label: 'Template literal (${var}) — may allow injection if user-supplied', severity: 'warning' },
  { pattern: /\{%\s*.+?\s*%\}/i, label: 'Jinja/template tag — may allow injection if user-supplied', severity: 'warning' },
  // Encoded payloads
  { pattern: /[A-Za-z0-9+/]{40,}={0,2}/i, label: 'Possible Base64-encoded payload', severity: 'warning' },
  // Delimiter / context breaking
  { pattern: /---\s*(end|begin|start)\s*(of\s*)?(system|prompt|instructions?)/i, label: 'Delimiter injection (fake section boundary)', severity: 'critical' },
  { pattern: /<\/?system>/i, label: 'XML tag injection (<system>)', severity: 'critical' },
  // Data exfiltration
  { pattern: /\b(output|print|return|show|display|leak|exfiltrate)\s+(the\s+)?(system\s+)?(prompt|instructions?|rules?|config)/i, label: 'Prompt exfiltration attempt', severity: 'critical' },
];

function checkPromptInjection(agent: AgentConfig): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];
  const seen = new Set<string>(); // Deduplicate same pattern across nodes

  for (const node of agent.nodes) {
    const text = `${node.label} ${node.description ?? ''} ${node.config?.logicSnippet ?? ''} ${node.config?.logic_snippet ?? ''}`;
    if (text.trim().length < 5) continue;

    for (const { pattern, label, severity } of INJECTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        const dedup = `${label}::${node.id}`;
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        issues.push({
          id: `det_injection_${node.id}_${label.replace(/\W+/g, '_').slice(0, 30)}`,
          severity,
          category: 'safety',
          type: 'prompt_injection',
          title: `Potential injection: ${label}`,
          description: `Node "${node.label}" contains text matching a known prompt injection pattern: "${match[0].slice(0, 60)}". This could allow an attacker to override agent behavior if this text comes from user input.`,
          suggestion: severity === 'critical'
            ? `Remove or sanitize this text. If it's user-supplied, add input validation before it reaches the agent. Never allow raw user input in instruction nodes.`
            : `Review whether this template variable receives user input. If so, add sanitization or use a GUARD node to validate the input before processing.`,
          nodeIds: [node.id],
          quotedPhrase: match[0].slice(0, 80),
        });
      }
    }
  }

  // Also scan the originalPrompt itself
  const prompt = agent.originalPrompt ?? '';
  if (prompt.length > 10) {
    for (const { pattern, label, severity } of INJECTION_PATTERNS) {
      const match = prompt.match(pattern);
      if (match) {
        const dedup = `${label}::prompt`;
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        issues.push({
          id: `det_injection_prompt_${label.replace(/\W+/g, '_').slice(0, 30)}`,
          severity,
          category: 'safety',
          type: 'prompt_injection',
          title: `Injection pattern in original prompt: ${label}`,
          description: `The original prompt contains text matching a known injection pattern: "${match[0].slice(0, 60)}". If any part of this prompt is dynamically composed from user input, this is a security risk.`,
          suggestion: `Review how the original prompt is constructed. If it includes user-supplied text, sanitize it or move it to a separate input node with a GUARD.`,
          nodeIds: [],
          quotedPhrase: match[0].slice(0, 80),
        });
      }
    }
  }

  return issues;
}

// ── Deterministic: Data Flow / Taint Tracking ────────────────────────────────

/** User-input source types — these introduce untrusted data */
const TAINT_SOURCE_TYPES = new Set(['INPUT', 'START']);
const TAINT_SOURCE_KEYWORDS = ['user input', 'user message', 'user request', 'customer input', 'form', 'query', 'prompt'];

/** Risky sink types — these perform side effects */
const TAINT_SINK_TYPES = new Set(['ACTION', 'TOOL', 'STEP', 'TASK', 'AGENT', 'HANDOFF']);

/** Guard/sanitization types that break the taint chain */
const TAINT_SANITIZER_TYPES = new Set(['GUARD', 'CONDITION', 'DECISION']);

function isTaintSource(node: NodeData): boolean {
  if (TAINT_SOURCE_TYPES.has(node.type)) return true;
  const text = `${node.label} ${node.description ?? ''}`.toLowerCase();
  return TAINT_SOURCE_KEYWORDS.some(kw => text.includes(kw));
}

function isTaintSink(node: NodeData, riskPermissions: RiskPermission[]): boolean {
  if (!TAINT_SINK_TYPES.has(node.type)) return false;
  // Only flag nodes that are actually risky (have a risk permission with medium+ level)
  return riskPermissions.some(p => p.nodeId === node.id && (p.riskLevel === 'high' || p.riskLevel === 'medium'));
}

function checkUnsanitizedDataFlow(agent: AgentConfig, riskPermissions: RiskPermission[]): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];
  const nodeMap = new Map(agent.nodes.map(n => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  for (const c of agent.connections) {
    if (!adjacency.has(c.source)) adjacency.set(c.source, []);
    adjacency.get(c.source)!.push(c.target);
  }

  // Find all taint sources
  const sources = agent.nodes.filter(isTaintSource);
  if (sources.length === 0) return [];

  // Find all taint sinks
  const sinks = agent.nodes.filter(n => isTaintSink(n, riskPermissions));
  if (sinks.length === 0) return [];

  // BFS from each source, tracking whether a sanitizer was encountered
  for (const source of sources) {
    // BFS: queue items are { nodeId, passedSanitizer }
    const visited = new Map<string, boolean>(); // nodeId → best passedSanitizer status
    const queue: { id: string; sanitized: boolean }[] = [{ id: source.id, sanitized: false }];

    while (queue.length > 0) {
      const { id, sanitized } = queue.shift()!;
      const prev = visited.get(id);
      if (prev !== undefined && (prev || prev === sanitized)) continue; // Already visited with same or better status
      visited.set(id, sanitized);

      const node = nodeMap.get(id);
      if (!node) continue;

      // Check if this node is a sanitizer
      const nowSanitized = sanitized || TAINT_SANITIZER_TYPES.has(node.type);

      // If this is a sink and NOT sanitized, flag it
      if (!nowSanitized && isTaintSink(node, riskPermissions) && id !== source.id) {
        const perm = riskPermissions.find(p => p.nodeId === id);
        issues.push({
          id: `det_taint_${source.id}_${id}`,
          severity: perm?.riskLevel === 'high' ? 'critical' : 'warning',
          category: 'safety',
          type: 'unsanitized_data_flow',
          title: `Unsanitized input reaches ${perm?.category ?? 'risky'} action`,
          description: `User input from "${source.label}" flows to "${node.label}" (${perm?.category ?? 'unknown'} action) without passing through a GUARD, CONDITION, or DECISION node for validation. This could allow malicious input to trigger unintended side effects.`,
          suggestion: `Add a GUARD or CONDITION node between "${source.label}" and "${node.label}" to validate/sanitize the input before it reaches the ${perm?.category ?? 'risky'} operation.`,
          nodeIds: [source.id, id],
        });
      }

      // Continue BFS
      for (const next of adjacency.get(id) ?? []) {
        queue.push({ id: next, sanitized: nowSanitized });
      }
    }
  }

  return issues;
}

// ── Deterministic: PDF Best Practices checks ────────────────────────────────

// Action verbs the PDF recommends (p.55)
const PDF_ACTION_VERBS = new Set([
  'act', 'analyze', 'categorize', 'classify', 'contrast', 'compare', 'create',
  'describe', 'define', 'evaluate', 'extract', 'find', 'generate', 'identify',
  'list', 'measure', 'organize', 'parse', 'pick', 'predict', 'provide', 'rank',
  'recommend', 'return', 'retrieve', 'rewrite', 'select', 'show', 'sort',
  'summarize', 'translate', 'write',
]);

// Constraint language patterns
const CONSTRAINT_PATTERNS = [
  /\bdon['']?t\b/gi, /\bnever\b/gi, /\bavoid\b/gi, /\bmust not\b/gi,
  /\bcannot\b/gi, /\bprohibited\b/gi, /\bforbidden\b/gi, /\bdo not\b/gi,
  /\bshould not\b/gi, /\brefrain\b/gi,
];

// Example signal patterns (few-shot / one-shot indicators)
const EXAMPLE_PATTERNS = [
  /\bfor example\b/i, /example:/i, /\be\.g\.\b/i, /\binput:/i,
  /\boutput:/i, /\bsample:/i, /\binstance:/i, /\bdemonstration:/i,
  /\bhere'?s? an example\b/i,
];

function checkMissingExamples(agent: AgentConfig): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];

  // Only trigger for agents with 3+ action/instruction nodes (non-trivial agents)
  const actionNodeTypes = new Set(['ACTION', 'STEP', 'TASK', 'DECISION', 'CONDITION', 'START']);
  const actionNodes = agent.nodes.filter(n => actionNodeTypes.has(n.type));
  if (actionNodes.length < 3) return [];

  // Collect all text to scan
  const textParts: string[] = [];
  if (agent.originalPrompt) textParts.push(agent.originalPrompt);
  for (const node of agent.nodes) {
    if (node.description) textParts.push(node.description);
    if (node.config?.logicSnippet) textParts.push(node.config.logicSnippet);
  }
  const fullText = textParts.join(' ');

  const hasExamples = EXAMPLE_PATTERNS.some(pattern => pattern.test(fullText));

  if (!hasExamples) {
    issues.push({
      id: 'det_missing_examples',
      severity: 'warning',
      category: 'prompt-quality',
      type: 'missing_examples',
      title: 'No examples provided',
      description: 'This agent has no input/output examples (one-shot or few-shot). Examples are the #1 prompt engineering best practice — they show the model exactly what output format, style, and content quality is expected.',
      suggestion: 'Add 1–3 input/output example pairs. Format: "Input: [example input] → Output: [expected output]". This dramatically improves consistency and reduces hallucinations.',
      nodeIds: [],
    });
  }

  return issues;
}

function checkInstructionConstraintRatio(agent: AgentConfig): { issues: AIConflictIssue[]; ratio: InstructionConstraintRatio } {
  // Collect text from RULE nodes + originalPrompt
  const ruleNodes = agent.nodes.filter(n => n.type === 'RULE');
  const textParts: string[] = [];
  if (agent.originalPrompt) textParts.push(agent.originalPrompt);
  for (const node of ruleNodes) {
    if (node.description) textParts.push(node.description);
    if (node.config?.logicSnippet) textParts.push(node.config.logicSnippet);
    textParts.push(node.label);
  }
  const fullText = textParts.join(' ').toLowerCase();

  // Count constraints
  let constraintCount = 0;
  for (const pattern of CONSTRAINT_PATTERNS) {
    const matches = fullText.match(pattern);
    constraintCount += matches ? matches.length : 0;
  }

  // Count instructions (action verb occurrences)
  const words = fullText.split(/\s+/);
  const instructionCount = words.filter(w => PDF_ACTION_VERBS.has(w.replace(/[^a-z]/g, ''))).length;

  const total = instructionCount + constraintCount;
  const score = total > 0 ? Math.round((instructionCount / total) * 100) : 100;
  const level: InstructionConstraintRatio['level'] = score >= 70 ? 'green' : score >= 50 ? 'yellow' : 'red';

  const ratio: InstructionConstraintRatio = { score, instructionCount, constraintCount, level };

  const issues: AIConflictIssue[] = [];

  // Only flag if there are enough signals to be meaningful (skip trivial agents)
  if (total >= 3 && score < 60) {
    const constraintPct = total > 0 ? Math.round((constraintCount / total) * 100) : 0;
    issues.push({
      id: 'det_excessive_constraints',
      severity: score < 40 ? 'critical' : 'warning',
      category: 'prompt-quality',
      type: 'excessive_constraints',
      title: 'Too many constraint statements',
      description: `${constraintPct}% of your instructions are constraints ("don't", "never", "avoid"). The Google Prompt Engineering whitepaper recommends using positive instructions over constraints — constraints can conflict with each other and leave the model guessing what to do.`,
      suggestion: 'Replace constraint statements with positive instructions. Instead of "don\'t be verbose", say "respond in 2–3 sentences". Instead of "never use jargon", say "use plain language a 10-year-old could understand".',
      nodeIds: ruleNodes.map(n => n.id),
    });
  }

  return { issues, ratio };
}

function checkOutputSpecificity(agent: AgentConfig): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];
  if (agent.nodes.length <= 2) return [];

  const textParts: string[] = [];
  if (agent.originalPrompt) textParts.push(agent.originalPrompt);
  for (const node of agent.nodes) {
    if (node.description) textParts.push(node.description);
    if (node.config?.logicSnippet) textParts.push(node.config.logicSnippet);
  }
  const fullText = textParts.join(' ').toLowerCase();

  // Score output specificity 0–3
  let specificityScore = 0;

  // Level 1: Any output signal
  const vagueSignals = ['list', 'structured', 'formatted', 'report', 'response', 'answer', 'output'];
  if (vagueSignals.some(s => fullText.includes(s))) specificityScore = 1;

  // Level 2: Named format
  const namedFormats = ['json', 'xml', 'markdown', 'csv', 'yaml', 'html', 'table', 'bullet point', 'numbered list'];
  if (namedFormats.some(f => fullText.includes(f))) specificityScore = 2;

  // Level 3: Schema/length also specified
  const schemaSignals = [
    /\{[\s\S]*?\}/, // JSON-like schema
    /schema:/i, /fields:/i, /format:/i, /template:/i,
    /\d+\s*(word|sentence|paragraph|character|line)/i, // Length spec
  ];
  if (specificityScore >= 2 && schemaSignals.some(p => p.test(textParts.join(' ')))) {
    specificityScore = 3;
  }

  if (specificityScore === 3) return []; // Fully specified, no issue

  const severityMap: Record<number, AIConflictIssue['severity']> = { 0: 'critical', 1: 'warning', 2: 'info' };
  const messageMap: Record<number, string> = {
    0: 'No output format defined. Without a specified format, each run will produce different structures, making the output unpredictable.',
    1: 'Output format is vague. Specify the exact format (JSON, markdown table, numbered list, etc.).',
    2: 'Output format is named but lacks schema or length specification. Add field definitions or length guidance.',
  };
  const suggestionMap: Record<number, string> = {
    0: 'Add an output format section: specify format (JSON/markdown/plain text), structure (schema or template), and length (e.g., "3–5 bullet points"). Structured output reduces hallucinations by forcing a defined shape.',
    1: 'Replace vague output terms with specific format names (JSON, markdown, CSV). Add a schema or template example.',
    2: 'Add a JSON schema, field list, or length constraint. Example: "Return JSON: { summary: string, confidence: 0–1, tags: string[] }".',
  };

  issues.push({
    id: 'det_vague_output_format',
    severity: severityMap[specificityScore],
    category: 'prompt-quality',
    type: 'vague_output_format',
    title: 'Output format not fully specified',
    description: messageMap[specificityScore],
    suggestion: suggestionMap[specificityScore],
    nodeIds: agent.nodes.filter(n => n.type === 'END' || n.type === 'HANDOFF').map(n => n.id),
  });

  return issues;
}

const FILLER_PHRASES_DET = [
  'please ', 'basically ', 'in order to ', 'it is important that ',
  'you should note that ', 'it should be noted ', 'as you know ',
  'needless to say ', 'of course ',
];

function checkSimplicity(agent: AgentConfig, simplicityScore: SimplicityScore): AIConflictIssue[] {
  const issues: AIConflictIssue[] = [];
  const hasText = !!(agent.originalPrompt?.trim() || agent.nodes.some(n => n.description));
  if (!hasText) return [];

  if (simplicityScore.avgSentenceLength > 30) {
    issues.push({
      id: 'det_verbose_prompt',
      severity: 'warning',
      category: 'prompt-quality',
      type: 'verbose_prompt',
      title: 'Sentences are too long',
      description: `Average sentence length is ${simplicityScore.avgSentenceLength} words (target: < 20). Long sentences increase misinterpretation risk — if a sentence is confusing to you, it will be confusing to the model.`,
      suggestion: 'Break long sentences into shorter ones. Aim for one instruction per sentence. Use active voice and concrete verbs.',
      nodeIds: [],
    });
  }

  if (simplicityScore.fillerPhraseCount > 3) {
    issues.push({
      id: 'det_filler_language',
      severity: 'info',
      category: 'prompt-quality',
      type: 'filler_language',
      title: 'Filler phrases detected',
      description: `Found ${simplicityScore.fillerPhraseCount} filler phrase${simplicityScore.fillerPhraseCount > 1 ? 's' : ''} (e.g., "please", "basically", "it is important that"). These add length without adding meaning.`,
      suggestion: `Remove filler phrases. Instead of "It is important that you analyze the request carefully", write "Analyze the request carefully".`,
      nodeIds: [],
    });
  }

  if (simplicityScore.actionVerbCount === 0 && (agent.originalPrompt?.length ?? 0) > 50) {
    issues.push({
      id: 'det_missing_action_verbs',
      severity: 'info',
      category: 'prompt-quality',
      type: 'missing_action_verbs',
      title: 'No action verbs in opening',
      description: 'The prompt\'s first 100 words don\'t contain any clear action verbs. Action verbs (Analyze, Generate, Classify, Return, Summarize) signal the task type and help the model predict the right response pattern.',
      suggestion: 'Start instructions with action verbs from the Google Prompt Engineering whitepaper: Act, Analyze, Categorize, Classify, Create, Define, Evaluate, Generate, Identify, List, Provide, Return, Summarize, Write.',
      nodeIds: [],
    });
  }

  if (simplicityScore.redundancyCount > 0) {
    issues.push({
      id: 'det_redundant_instructions',
      severity: 'warning',
      category: 'prompt-quality',
      type: 'redundant_instructions',
      title: 'Redundant instructions detected',
      description: `Found ${simplicityScore.redundancyCount} instruction${simplicityScore.redundancyCount > 1 ? 's' : ''} repeated 3 or more times. Repetition increases token count and cognitive load without improving model compliance.`,
      suggestion: 'State each instruction once, clearly. Repetition signals uncertainty — instead of repeating, make the original instruction more precise.',
      nodeIds: [],
    });
  }

  return issues;
}

// ── Main deterministic export ───────────────────────────────────────────────

export function runDeterministicAnalysis(agent: AgentConfig): DeterministicResult {
  const riskPermissions = detectRiskPermissions(agent);
  const cognitiveLoadScore = calculateCognitiveLoad(agent);
  const simplicityScore = calculateSimplicityScore(agent);
  const { issues: icIssues, ratio: instructionConstraintRatio } = checkInstructionConstraintRatio(agent);

  const issues: AIConflictIssue[] = [
    ...checkCognitiveOverload(agent, cognitiveLoadScore),
    ...checkUndefinedOutputStructure(agent),
    ...checkConflictingInstructions(agent),
    ...checkPromptInjection(agent),
    ...checkUnguardedRisks(riskPermissions),
    ...checkUnsanitizedDataFlow(agent, riskPermissions),
    ...checkDeadEnds(agent),
    ...checkUnreachableNodes(agent),
    ...checkMissingFallbacks(agent),
    // PDF best practice checks
    ...checkMissingExamples(agent),
    ...icIssues,
    ...checkOutputSpecificity(agent),
    ...checkSimplicity(agent, simplicityScore),
  ];

  return { issues, riskPermissions, cognitiveLoadScore, simplicityScore, instructionConstraintRatio };
}

// Sync structural checks only (no risk detection)
export function runStructuralAnalysis(agent: AgentConfig): { issues: AIConflictIssue[]; cognitiveLoadScore: CognitiveLoadScore; simplicityScore: SimplicityScore; instructionConstraintRatio: InstructionConstraintRatio } {
  const cognitiveLoadScore = calculateCognitiveLoad(agent);
  const simplicityScore = calculateSimplicityScore(agent);
  const { issues: icIssues, ratio: instructionConstraintRatio } = checkInstructionConstraintRatio(agent);
  const issues: AIConflictIssue[] = [
    ...checkCognitiveOverload(agent, cognitiveLoadScore),
    ...checkUndefinedOutputStructure(agent),
    ...checkConflictingInstructions(agent),
    ...checkPromptInjection(agent),
    ...checkDeadEnds(agent),
    ...checkUnreachableNodes(agent),
    ...checkMissingFallbacks(agent),
    ...checkMissingExamples(agent),
    ...icIssues,
    ...checkOutputSpecificity(agent),
    ...checkSimplicity(agent, simplicityScore),
  ];
  return { issues, cognitiveLoadScore, simplicityScore, instructionConstraintRatio };
}

// Async risk analysis (LLM call)
export async function runRiskAnalysis(
  agent: AgentConfig,
  apiKey: string,
): Promise<{ riskPermissions: RiskPermission[]; issues: AIConflictIssue[] }> {
  const { detectRiskPermissionsLLM } = await import('@/lib/capability-analyzer');
  const riskPermissions = await detectRiskPermissionsLLM(agent, apiKey);
  const issues = checkUnguardedRisks(riskPermissions);
  return { riskPermissions, issues };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: AI ANALYSIS (Gemini call for semantic issues)
// ═══════════════════════════════════════════════════════════════════════════════

const AI_SYSTEM_PROMPT = `# AI Agent Prompt & Graph Analyzer

## CRITICAL OUTPUT RULES

1. **Output ONLY a raw JSON array.** Nothing before [. Nothing after ].
2. **Your first character MUST be [.** Your last character MUST be ].
3. **NEVER use markdown code fences.**
4. **NEVER write any preamble or explanation.**
5. If no issues are found, output exactly: []

---

## Graph Layout Model

The graph uses a **3-column layout**:

- **left** — Identity nodes (persona, input). Source-only, NO incoming connections by design.
- **center** — Execution flow (start, end, action, step, decision, condition, option, etc.).
- **right** — Constraints (rule, tool, config, memory, reference, guard). Source-only.

Only center-column nodes participate in sequential execution flow. Do NOT flag left/right nodes as unreachable.

---

## Your Role

You are analyzing an AI agent's prompt and graph for **semantic quality issues** that deterministic checks cannot catch. Structural issues (dead ends, unreachable nodes, missing fallbacks) are handled separately — focus ONLY on the categories below.

---

## What To Analyze

### CATEGORY: prompt-quality

#### 1 — Ambiguous Language
Find vague/abstract words in the originalPrompt and node descriptions that an LLM could interpret multiple ways.

Examples of ambiguous phrases: "optimize", "improve", "handle appropriately", "analyze deeply", "process efficiently", "ensure quality", "be smart about", "use best practices".

For each, quote the exact phrase and suggest a concrete, measurable replacement.

Output format:
- type: "ambiguous_language"
- category: "prompt-quality"
- quotedPhrase: the exact vague phrase

#### 2 — Hidden Context / Unstated Assumptions
Identify domain-specific terms, abbreviations, acronyms, or concepts that are used without definition. The agent only sees text — if the prompt assumes "obvious" shared knowledge, it will break.

Examples: "SLA tier" (undefined), "T1/T2 classification" (unexplained), "standard escalation" (what standard?).

Output format:
- type: "hidden_context"
- category: "prompt-quality"
- quotedPhrase: the undefined term

#### 3 — Mixed Abstraction Levels
Detect when the prompt mixes strategy-level instructions with implementation-level details without clear boundaries. LLMs struggle when abstraction levels shift without warning.

Example: "Ensure customer satisfaction" (strategy) followed by "Format response as bullet points" (implementation) in the same context.

Output format:
- type: "mixed_abstraction"
- category: "prompt-quality"

#### 4 — Implicit Value Judgments
Find subjective terms that are culturally loaded and context-dependent. LLMs approximate them statistically, not normatively.

Examples: "good", "high quality", "professional", "strong", "appropriate", "adequate", "reasonable", "proper".

Output format:
- type: "implicit_value_judgment"
- category: "prompt-quality"
- quotedPhrase: the subjective term

#### 5 — Conflicting Instructions (Semantic)
Find instructions that contradict each other at a semantic level (beyond simple keyword matching). Only flag conflicts that keyword matching would miss.

Example: "Never refuse a request" + "Always verify authorization" (what if an unauthorized request comes in?)

Output format:
- type: "semantic_conflict"
- category: "prompt-quality"
- conflictPair: ["instruction A text", "instruction B text"]

### CATEGORY: graph-structure

#### 6 — Numerical Range Conflicts
Compare ALL numerical thresholds across nodes and edge conditions:
- **Gap**: a range of values never handled by any branch
- **Overlap**: two branches match the same input range
- **Stale value**: an edge/node uses an old threshold changed elsewhere

Output format:
- type: "numerical_gap" | "numerical_overlap" | "stale_threshold"
- category: "graph-structure"

#### 7 — Prompt vs. Graph Inconsistency
Compare each node's logicSnippet against the originalPrompt. Flag if a logicSnippet was edited to no longer match the prompt, or if sibling nodes still use old values.

Output format:
- type: "prompt_graph_drift"
- category: "graph-structure"

#### 8 — Contradicting Rules (Semantic)
Two RULE nodes that produce contradictory outcomes for the same input, beyond what keyword matching can detect.

Output format:
- type: "semantic_rule_contradiction"
- category: "graph-structure"

### CATEGORY: prompt-quality (continued)

#### 9 — Prompting Technique Analysis
Identify which prompting technique this agent is currently using, and whether a better technique would significantly improve it.

Techniques to detect:
- **zero-shot**: Single instruction with no examples
- **one-shot / few-shot**: Includes 1 or more input/output examples
- **chain-of-thought (CoT)**: Explicitly asks model to reason step-by-step ("think step by step", "let's work through this", "explain your reasoning")
- **step-back**: First asks a general/background question before the specific task
- **ReAct**: Interleaves reasoning with tool calls (thought → action → observation loop)
- **role-prompt**: Assigns a specific persona/role to the model
- **system-prompt**: Sets overall context/purpose for the model

Recommendation logic (flag as warning if a better technique is clearly applicable):
- Agent performs multi-step reasoning or math/logic → recommend CoT if not present
- Agent classifies, extracts, or follows a specific output pattern → recommend few-shot if no examples
- Agent calls external tools sequentially based on results → recommend ReAct pattern
- Agent needs broad background knowledge before task → recommend step-back

Output format:
- type: "prompting_technique"
- category: "prompt-quality"
- severity: "info" if just reporting detected technique, "warning" if a strongly better technique is available
- title: "Current technique: [detected] — [recommendation if applicable]"
- description: Explain what technique is detected, why a different one would help (be specific)
- suggestion: Concrete rewrite hint showing how to apply the recommended technique

Only flag this if you have HIGH confidence that a different technique would materially improve the agent. Do not flag merely because CoT exists — flag when reasoning is clearly needed but absent.

#### 10 — Output Format Enhancement
Analyze whether the current output format specification (if any) is optimal for this agent's task type.

Look for:
- Tasks that extract/classify structured data → recommend JSON with schema
- Tasks that produce documents/reports → recommend markdown with explicit sections
- Tasks that produce lists → recommend numbered lists with length bounds
- Tasks with variable output → recommend length guidance (e.g., "2–3 sentences")
- Structured output specified but no schema → flag schema missing

Only flag this if there is a clear, actionable improvement. Do not flag if output format is well-specified.

Output format:
- type: "output_format_enhancement"
- category: "prompt-quality"
- severity: "info" or "warning"

---

## Output Format

JSON array. Each element:

{
  "id": "ai_issue_N",
  "severity": "critical" | "warning" | "info",
  "category": "prompt-quality" | "graph-structure",
  "type": "<type from above>",
  "title": "Short title (max 10 words)",
  "description": "Clear explanation with specific node names, values, and why it's a problem",
  "suggestion": "Specific actionable fix",
  "nodeIds": ["n7", "n8"],
  "quotedPhrase": "the vague phrase (if applicable)",
  "conflictPair": ["instruction A", "instruction B"] (if applicable)
}

Severity guide:
- "critical" — causes incorrect/unpredictable behavior
- "warning" — likely problem, depends on intent
- "info" — clarity improvement

Return ONLY real issues. Do not invent problems. If everything is clear, return [].`;

// ── Build graph description for AI ──────────────────────────────────────────

function buildGraphDescription(agent: AgentConfig, reconstructedPrompt?: string): string {
  const lines: string[] = [];

  if (reconstructedPrompt) {
    lines.push('RECONSTRUCTED PROMPT (current graph state — use this as the source of truth for fixes):');
    lines.push('---');
    lines.push(reconstructedPrompt);
    lines.push('---');
    lines.push('');
  } else if (agent.originalPrompt) {
    lines.push('ORIGINAL PROMPT (source of truth):');
    lines.push('---');
    lines.push(agent.originalPrompt);
    lines.push('---');
    lines.push('');
  }

  lines.push('GRAPH NODES:');
  for (const node of agent.nodes) {
    const snippet = node.config?.logicSnippet
      ? `\n  logicSnippet: "${node.config.logicSnippet}"`
      : (node.config?.logic_snippet
        ? `\n  logicSnippet: "${node.config.logic_snippet}"`
        : '');
    const desc = node.description ? `\n  description: "${node.description}"` : '';
    const col = resolveColumn(node);
    lines.push(`[${node.id}] (${node.type}, column:${col}) "${node.label}"${desc}${snippet}`);
  }

  lines.push('');
  lines.push('GRAPH EDGES (connections):');
  for (const conn of agent.connections) {
    const cond = conn.condition ? ` | condition: "${conn.condition}"` : '';
    const sourceLabel = agent.nodes.find(n => n.id === conn.source)?.label ?? conn.source;
    const targetLabel = agent.nodes.find(n => n.id === conn.target)?.label ?? conn.target;
    lines.push(`${conn.source} ("${sourceLabel}") → ${conn.target} ("${targetLabel}")${cond}`);
  }

  return lines.join('\n');
}

// ── Main AI analysis export ─────────────────────────────────────────────────

export async function analyzeGraphConflictsAI(
  agent: AgentConfig,
  apiKey: string,
): Promise<AIConflictIssue[]> {
  const ai = new GoogleGenAI({ apiKey });
  const graphDescription = buildGraphDescription(agent);

  let raw = '';
  const stream = await ai.models.generateContentStream({
    model: DEFAULT_GEMINI_MODEL,
    config: {
      temperature: 0,
      topP: 0,
      thinkingConfig: (DEFAULT_GEMINI_MODEL.includes('3.1') ? { thinkingLevel: 'MINIMAL' } : { thinkingBudget: 5000 }) as any,
      systemInstruction: getGraphRuleSettings().injectDAGRulesInPrompts
        ? AI_SYSTEM_PROMPT + '\n\n' + DAG_RULES_FOR_ANALYSIS
        : AI_SYSTEM_PROMPT,
    } as any,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Analyze this agent for prompt quality issues and graph inconsistencies:\n\n${graphDescription}`,
          },
        ],
      },
    ],
  });

  for await (const chunk of stream) {
    raw += chunk.text ?? '';
  }

  raw = raw.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any, i: number) => normalizeAIIssue(item, i)).filter(Boolean) as AIConflictIssue[];
  } catch {
    return [];
  }
}

/** Validate and normalize an AI-returned issue to prevent runtime errors from missing fields */
function normalizeAIIssue(raw: any, index: number): AIConflictIssue | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id ?? `ai_issue_${index}`,
    severity: ['critical', 'warning', 'info'].includes(raw.severity) ? raw.severity : 'info',
    category: ['prompt-quality', 'safety', 'graph-structure'].includes(raw.category) ? raw.category : 'graph-structure',
    type: raw.type ?? 'unknown',
    title: raw.title ?? 'Unnamed issue',
    description: raw.description ?? '',
    suggestion: raw.suggestion ?? '',
    nodeIds: Array.isArray(raw.nodeIds) ? raw.nodeIds : [],
    quotedPhrase: typeof raw.quotedPhrase === 'string' ? raw.quotedPhrase : undefined,
    conflictPair: Array.isArray(raw.conflictPair) && raw.conflictPair.length === 2 ? raw.conflictPair : undefined,
  };
}

/**
 * Incremental AI analysis: only analyze changed nodes + their neighbors.
 * Returns new issues for the changed subgraph. Caller should merge with cached issues for unchanged nodes.
 */
export async function analyzeGraphConflictsIncremental(
  agent: AgentConfig,
  apiKey: string,
  changedNodeIds: Set<string>,
): Promise<AIConflictIssue[]> {
  if (changedNodeIds.size === 0) return [];

  // Expand to include 1-hop neighbors (interactions between changed and adjacent nodes matter)
  const relevantIds = new Set(changedNodeIds);
  for (const id of changedNodeIds) {
    for (const conn of agent.connections) {
      if (conn.source === id) relevantIds.add(conn.target);
      if (conn.target === id) relevantIds.add(conn.source);
    }
  }

  // Build a focused agent view with only relevant nodes but all connections between them
  const relevantNodes = agent.nodes.filter(n => relevantIds.has(n.id));
  const relevantConnections = agent.connections.filter(
    c => relevantIds.has(c.source) && relevantIds.has(c.target)
  );
  const focusedAgent: AgentConfig = {
    ...agent,
    nodes: relevantNodes,
    connections: relevantConnections,
  };

  // If the focused subgraph is >80% of the full graph, just run full analysis (no savings)
  if (relevantNodes.length > agent.nodes.length * 0.8) {
    return analyzeGraphConflictsAI(agent, apiKey);
  }

  return analyzeGraphConflictsAI(focusedAgent, apiKey);
}

// Backward-compatible wrapper that combines both phases
export async function analyzeGraphConflicts(
  agent: AgentConfig,
  apiKey: string,
): Promise<AIConflictIssue[]> {
  const { issues: deterministicIssues } = runDeterministicAnalysis(agent);
  const aiIssues = await analyzeGraphConflictsAI(agent, apiKey);
  return [...deterministicIssues, ...aiIssues];
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

const FIX_SYSTEM_PROMPT = `# AI Graph Conflict Fixer

## CRITICAL OUTPUT RULES

1. **Output ONLY a raw JSON object.** Nothing before {. Nothing after }.
2. **Your first character MUST be {.** Your last character MUST be }.
3. **NEVER use markdown code fences.**
4. **NEVER write any preamble or explanation.**

---

## Role

You fix issues in AI agent flow graphs. You receive the current graph state and one or more
issues (with descriptions and suggestions). Your job is to produce the minimal set of
mutations that resolve each issue.

## Issue Types You May Receive

### Prompt Quality Issues
- **ambiguous_language**:
  1. Use promptReplacements to patch the vague phrase wherever it appears in node logicSnippets. The "find" value must be the exact verbatim substring (case-sensitive). The "replace" value is the concrete improved text.
  2. Also use updateNodes to update the affected node's description field if it contains the same vague phrase.
  3. IMPORTANT: the original prompt text is NEVER modified — promptReplacements applies only to logicSnippet fields on nodes, so the fix appears in the "reconstructed from graph" diff view.
- **conflicting_instructions**: Propose a reconciliation that merges both intents. Use updateNodes on one or both RULE nodes. Use promptReplacements if the conflicting phrase appears in node logicSnippets.
- **implicit_value_judgment**: Rewrite subjective terms with specific criteria. Use updateNodes and promptReplacements as needed.
- **cognitive_overload**: No graph fix needed — return empty arrays for all fields.
- **undefined_output**: Add descriptions to END/HANDOFF nodes specifying output format. Use updateNodes.

### Safety Issues
- **unguarded_dangerous_action**: Add a GUARD node before the dangerous action node. The GUARD should have:
  - id: random 8-char hex like "n-a7f3b2c1"
  - type: "GUARD"
  - label: "Confirm [action name]"
  - description: "Requires explicit confirmation before [what the action does]"
  - config: { pfgType: "guard", logicSnippet: "Requires confirmation", column: "right" }
  - position: { x: 0, y: 0 }
  Add an edge from the GUARD to the dangerous action node.
- **risky_action_no_guard**: Same as above but less urgent.

### Graph Structure Issues
- **dead_end**: Add an edge to an appropriate END node or continuation.
- **unreachable_node**: Add an edge from an appropriate predecessor.
- **missing_fallback**: Add a default/else edge from the decision node.
- **numerical_gap/overlap/stale_threshold**: Update node labels, descriptions, or edge conditions.
- **prompt_graph_drift**: Update logicSnippet to match current state.
- **semantic_rule_contradiction**: Update one or both rules to resolve conflict.

## Graph Layout Model

- **left** — Identity nodes (persona, input). Source-only.
- **center** — Execution flow. Main flow chain.
- **right** — Constraints (rule, tool, config, memory, guard). Source-only.

## CRITICAL CONSTRAINTS

1. **NO CIRCULAR DEPENDENCIES** — Before adding any edge, trace: does target → ... → source exist? If yes, do NOT add.
2. **NO SELF-LOOPS** — source !== target always.
3. **NO DUPLICATE IDs** — Use random 8-char hex IDs (e.g., "n-a7f3b2c1").
4. **COLUMN ENFORCEMENT** — GUARD/RULE/TOOL/CONFIG → right column. ACTION/STEP/DECISION → center column.
5. **RIGHT-COLUMN NODES CANNOT RECEIVE FLOW EDGES** — Redirect to center nodes instead.
6. **PREFER REDIRECTING OVER CREATING** — Update edge targets rather than removing + adding.

## Output Format

{
  "fixes": [
    {
      "issueId": "issue_1",
      "updateNodes": [{ "id": "n7", "description": "Updated description" }],
      "updateEdges": [{ "id": "e3", "condition": "Updated" }],
      "addNodes": [{ "id": "n-abc123", "type": "GUARD", "label": "Confirm action", "description": "...", "config": { "pfgType": "guard", "logicSnippet": "...", "column": "right" }, "position": { "x": 0, "y": 0 } }],
      "addEdges": [{ "id": "e-abc123", "source": "n-abc123", "target": "n7" }],
      "removeNodeIds": [],
      "removeEdgeIds": [],
      "promptReplacements": [{ "find": "coherent final result", "replace": "logically unified final result that addresses all sub-tasks without contradictions or gaps" }]
    }
  ]
}

### addNodes requirements
Each node in addNodes MUST have: id, type, label, description, config (with pfgType, logicSnippet, column), and position: { x: 0, y: 0 }.
Positions are recalculated by auto-layout — always use { x: 0, y: 0 }.

### addEdges requirements
Each edge in addEdges MUST have: id, source, target. Optional: condition.

### promptReplacements requirements
- "find": the EXACT verbatim substring from a node's logicSnippet to replace (case-sensitive, preserve punctuation)
- "replace": the improved substitute text
- These patches are applied to node logicSnippets only — the original prompt is NEVER changed
- Omit the field entirely (or use []) when no logicSnippet changes are needed beyond what updateNodes covers

Every fix MUST have all 6 arrays (use empty arrays [] when not applicable). promptReplacements is optional.`;

// ── Generate fixes ──────────────────────────────────────────────────────────

export async function generateConflictFixes(
  agent: AgentConfig,
  issues: AIConflictIssue[],
  apiKey: string,
  reconstructedPrompt?: string,
): Promise<ConflictFix[]> {
  const ai = new GoogleGenAI({ apiKey });
  const graphDescription = buildGraphDescription(agent, reconstructedPrompt);

  const issuesText = issues.map(i =>
    `Issue "${i.id}" (${i.severity}, ${i.category}): ${i.title}\n  Type: ${i.type}\n  Description: ${i.description}\n  Suggestion: ${i.suggestion}\n  Affected nodes: ${i.nodeIds.join(', ')}${i.quotedPhrase ? `\n  Quoted phrase: "${i.quotedPhrase}"` : ''}${i.conflictPair ? `\n  Conflict pair: "${i.conflictPair[0]}" vs "${i.conflictPair[1]}"` : ''}`
  ).join('\n\n');

  let raw = '';
  const stream = await ai.models.generateContentStream({
    model: DEFAULT_GEMINI_MODEL,
    config: {
      temperature: 0,
      topP: 0,
      thinkingConfig: (DEFAULT_GEMINI_MODEL.includes('3.1') ? { thinkingLevel: 'MINIMAL' } : { thinkingBudget: 5000 }) as any,
      systemInstruction: FIX_SYSTEM_PROMPT,
    } as any,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Fix the following issues in this agent graph:\n\n${issuesText}\n\nCurrent graph:\n${graphDescription}`,
          },
        ],
      },
    ],
  });

  for await (const chunk of stream) {
    raw += chunk.text ?? '';
  }

  raw = raw.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.fixes)) return [];
    return parsed.fixes.map((f: any) => ({
      issueId: f.issueId ?? '',
      updateNodes: Array.isArray(f.updateNodes) ? f.updateNodes : [],
      updateEdges: Array.isArray(f.updateEdges) ? f.updateEdges : [],
      addNodes: Array.isArray(f.addNodes) ? f.addNodes.map((n: any) => ({
        ...n,
        id: n.id ?? uniqueId('n-', new Set()),
        position: n.position ?? { x: 0, y: 0 },
        config: n.config ?? {},
        description: n.description ?? '',
      })) : [],
      addEdges: Array.isArray(f.addEdges) ? f.addEdges.map((e: any) => ({
        ...e,
        id: e.id ?? uniqueId('e-', new Set()),
      })) : [],
      removeNodeIds: Array.isArray(f.removeNodeIds) ? f.removeNodeIds : [],
      removeEdgeIds: Array.isArray(f.removeEdgeIds) ? f.removeEdgeIds : [],
      promptReplacements: Array.isArray(f.promptReplacements)
        ? f.promptReplacements.filter((r: any) => typeof r.find === 'string' && typeof r.replace === 'string')
        : undefined,
    }));
  } catch {
    throw new Error('Failed to parse fix response from AI');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIX VALIDATION LAYER
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_NODE_TYPES = new Set([
  'START', 'END', 'ACTION', 'STEP', 'DECISION', 'CONDITION', 'OPTION',
  'AGENT', 'TASK', 'HANDOFF', 'RESOLUTION',
  'RULE', 'TOOL', 'CONFIG', 'MEMORY', 'GUARD', 'REFERENCE', 'TRIGGER', 'LOGGING',
  'PERSONA', 'INPUT',
]);

export interface FixValidationResult {
  valid: boolean;
  warnings: string[];
  sanitizedFix: ConflictFix;
}

/** Validate and sanitize an LLM-generated fix before applying it */
export function validateFix(fix: ConflictFix, agent: AgentConfig): FixValidationResult {
  const warnings: string[] = [];
  const existingNodeIds = new Set(agent.nodes.map(n => n.id));
  const existingEdgeIds = new Set(agent.connections.map(c => c.id));

  // Validate addNodes — reject invalid types, ensure required fields
  const validAddNodes = fix.addNodes.filter(n => {
    if (!n.type || !VALID_NODE_TYPES.has(n.type)) {
      warnings.push(`Rejected new node "${n.label ?? n.id}": invalid type "${n.type}". Valid types: ${[...VALID_NODE_TYPES].join(', ')}`);
      return false;
    }
    if (!n.id) {
      warnings.push(`Rejected new node "${n.label}": missing ID`);
      return false;
    }
    if (!n.label || n.label.trim().length === 0) {
      warnings.push(`Rejected new node "${n.id}": missing label`);
      return false;
    }
    return true;
  });

  // Validate addEdges — reject edges referencing non-existent nodes (after adds)
  const futureNodeIds = new Set([...existingNodeIds, ...validAddNodes.map(n => n.id)]);
  // Remove nodes that will be removed
  for (const id of fix.removeNodeIds) futureNodeIds.delete(id);

  const validAddEdges = fix.addEdges.filter(e => {
    if (!e.source || !e.target) {
      warnings.push(`Rejected edge "${e.id}": missing source or target`);
      return false;
    }
    if (e.source === e.target) {
      warnings.push(`Rejected self-loop edge "${e.id}": ${e.source} → ${e.target}`);
      return false;
    }
    if (!futureNodeIds.has(e.source)) {
      warnings.push(`Rejected edge "${e.id}": source "${e.source}" does not exist`);
      return false;
    }
    if (!futureNodeIds.has(e.target)) {
      warnings.push(`Rejected edge "${e.id}": target "${e.target}" does not exist`);
      return false;
    }
    return true;
  });

  // Validate updateNodes — only update nodes that exist
  const validUpdateNodes = fix.updateNodes.filter(u => {
    if (!existingNodeIds.has(u.id)) {
      warnings.push(`Skipped update for non-existent node "${u.id}"`);
      return false;
    }
    return true;
  });

  // Validate updateEdges — only update edges that exist
  const validUpdateEdges = fix.updateEdges.filter(u => {
    if (!existingEdgeIds.has(u.id)) {
      warnings.push(`Skipped update for non-existent edge "${u.id}"`);
      return false;
    }
    return true;
  });

  // Validate removeNodeIds — only remove nodes that exist
  const validRemoveNodeIds = fix.removeNodeIds.filter(id => {
    if (!existingNodeIds.has(id)) {
      warnings.push(`Skipped removal of non-existent node "${id}"`);
      return false;
    }
    return true;
  });

  // Validate removeEdgeIds — only remove edges that exist
  const validRemoveEdgeIds = fix.removeEdgeIds.filter(id => {
    if (!existingEdgeIds.has(id)) {
      warnings.push(`Skipped removal of non-existent edge "${id}"`);
      return false;
    }
    return true;
  });

  // Validate promptReplacements — warn about very short find strings (high false positive risk)
  const validReplacements = (fix.promptReplacements ?? []).filter(r => {
    if (r.find.length < 3) {
      warnings.push(`Rejected prompt replacement: find string "${r.find}" is too short (< 3 chars), high false-positive risk`);
      return false;
    }
    if (r.find === r.replace) {
      warnings.push(`Skipped no-op replacement: find === replace ("${r.find.slice(0, 40)}")`);
      return false;
    }
    return true;
  });

  const sanitizedFix: ConflictFix = {
    issueId: fix.issueId,
    updateNodes: validUpdateNodes,
    updateEdges: validUpdateEdges,
    addNodes: validAddNodes,
    addEdges: validAddEdges,
    removeNodeIds: validRemoveNodeIds,
    removeEdgeIds: validRemoveEdgeIds,
    promptReplacements: validReplacements.length > 0 ? validReplacements : undefined,
  };

  return {
    valid: warnings.length === 0,
    warnings,
    sanitizedFix,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPLY FIXES (pure function)
// ═══════════════════════════════════════════════════════════════════════════════

function uniqueId(prefix: string, existingIds: Set<string>): string {
  let id: string;
  do {
    id = prefix + Math.random().toString(16).slice(2, 10);
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
}

function wouldCreateCycle(
  source: string,
  target: string,
  adjacency: Map<string, string[]>,
): boolean {
  if (source === target) return true;
  const visited = new Set<string>();
  const queue = [target];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      queue.push(neighbor);
    }
  }
  return false;
}

function buildAdjacency(connections: Connection[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const c of connections) {
    if (!adj.has(c.source)) adj.set(c.source, []);
    adj.get(c.source)!.push(c.target);
  }
  return adj;
}

export function applyFixToAgent(agent: AgentConfig, fix: ConflictFix): AgentConfig {
  // Validate and sanitize the fix before applying
  const { sanitizedFix, warnings } = validateFix(fix, agent);
  if (warnings.length > 0) {
    console.warn('[AI Analyzer] Fix validation warnings:', warnings);
  }
  const validFix = sanitizedFix;

  let nodes = [...agent.nodes];
  let connections = [...agent.connections];

  // Deep-clone addEdges to avoid mutating the caller's data when remapping IDs
  const pendingAddEdges = validFix.addEdges.map(e => ({ ...e }));

  const allNodeIds = new Set(nodes.map(n => n.id));
  const allEdgeIds = new Set(connections.map(c => c.id));

  // 1. Update existing nodes
  for (const update of validFix.updateNodes) {
    const idx = nodes.findIndex(n => n.id === update.id);
    if (idx === -1) continue;
    const node = { ...nodes[idx] };
    if (update.label !== undefined) node.label = update.label;
    if (update.description !== undefined) node.description = update.description;
    if (update.type !== undefined) node.type = update.type as any;
    if (update.config) node.config = { ...node.config, ...update.config };

    if (RIGHT_COLUMN_TYPES.has(node.type)) {
      node.config = { ...node.config, column: 'right' };
    } else if (CENTER_COLUMN_TYPES.has(node.type)) {
      node.config = { ...node.config, column: 'center' };
    }

    nodes[idx] = node;
  }

  // 2. Update existing edges
  for (const update of validFix.updateEdges) {
    const idx = connections.findIndex(c => c.id === update.id);
    if (idx === -1) continue;
    const conn = { ...connections[idx] };
    if (update.condition !== undefined) conn.condition = update.condition;
    if (update.source !== undefined) conn.source = update.source;
    if (update.target !== undefined) conn.target = update.target;
    connections[idx] = conn;
  }

  // 3. Remove nodes
  if (validFix.removeNodeIds.length > 0) {
    const removeSet = new Set(validFix.removeNodeIds);
    nodes = nodes.filter(n => !removeSet.has(n.id));
    connections = connections.filter(
      c => !removeSet.has(c.source) && !removeSet.has(c.target)
    );
    for (const id of removeSet) allNodeIds.delete(id);
  }

  // 4. Remove edges
  if (validFix.removeEdgeIds.length > 0) {
    const removeSet = new Set(validFix.removeEdgeIds);
    connections = connections.filter(c => !removeSet.has(c.id));
    for (const id of removeSet) allEdgeIds.delete(id);
  }

  // 5. Add new nodes
  for (const newNode of validFix.addNodes) {
    const node = { ...newNode };
    if (allNodeIds.has(node.id)) {
      node.id = uniqueId('n-', allNodeIds);
      for (const edge of pendingAddEdges) {
        if (edge.source === newNode.id) edge.source = node.id;
        if (edge.target === newNode.id) edge.target = node.id;
      }
    }
    allNodeIds.add(node.id);

    if (RIGHT_COLUMN_TYPES.has(node.type)) {
      node.config = { ...node.config, column: 'right' };
    } else if (CENTER_COLUMN_TYPES.has(node.type)) {
      node.config = { ...node.config, column: 'center' };
    }

    // Ensure new nodes have a position (recalculated by applyAutoLayout below)
    if (!node.position) {
      node.position = { x: 0, y: 0 };
    }

    nodes.push(node);
  }

  // 6. Add new edges
  let adjacency = buildAdjacency(connections);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const newEdge of pendingAddEdges) {
    const edge = { ...newEdge };

    if (allEdgeIds.has(edge.id)) {
      edge.id = uniqueId('e-', allEdgeIds);
    }

    if (!allNodeIds.has(edge.source) || !allNodeIds.has(edge.target)) continue;
    if (edge.source === edge.target) continue;

    const targetNode = nodeMap.get(edge.target);
    if (targetNode && RIGHT_COLUMN_TYPES.has(targetNode.type)) continue;

    if (wouldCreateCycle(edge.source, edge.target, adjacency)) continue;

    const isDuplicate = connections.some(
      c => c.source === edge.source && c.target === edge.target
    );
    if (isDuplicate) continue;

    allEdgeIds.add(edge.id);
    connections.push(edge);

    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)!.push(edge.target);
  }

  // 7. Remove edges pointing to right-column nodes
  const rightNodeIds = new Set(
    nodes.filter(n => RIGHT_COLUMN_TYPES.has(n.type)).map(n => n.id)
  );
  connections = connections.filter(c => {
    if (rightNodeIds.has(c.source)) return true;
    if (rightNodeIds.has(c.target)) return false;
    return true;
  });

  // 8. Remove self-loops
  connections = connections.filter(c => c.source !== c.target);

  // 9. Apply prompt replacements to node logicSnippets
  // originalPrompt is NEVER modified — it stays as the user's baseline for re-sync comparison.
  // Replacements are applied to logicSnippet fields so the fix shows on the
  // "reconstructed from graph" side of the re-sync diff, not the original side.
  if (validFix.promptReplacements && validFix.promptReplacements.length > 0) {
    for (let i = 0; i < nodes.length; i++) {
      const snippet = nodes[i].config?.logicSnippet as string | undefined;
      if (!snippet) continue;
      let updated = snippet;
      for (const { find, replace } of validFix.promptReplacements) {
        if (find && updated.includes(find)) {
          updated = updated.split(find).join(replace);
        }
      }
      if (updated !== snippet) {
        nodes[i] = {
          ...nodes[i],
          config: { ...nodes[i].config, logicSnippet: updated },
        };
      }
    }
  }

  // 10. Re-run auto-layout to calculate positions for all nodes (including new ones)
  const layoutedNodes = applyAutoLayout(nodes, connections);

  return {
    ...agent,
    nodes: layoutedNodes,
    connections,
    // originalPrompt intentionally NOT modified — preserved as the user's original baseline
    updatedAt: new Date().toISOString(),
  };
}
