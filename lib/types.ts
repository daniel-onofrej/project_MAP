import type { RuntimePackage } from './deployments/types';

export type NodeType =
  | 'AGENT'
  | 'RULE'
  | 'TASK'
  | 'HANDOFF'
  | 'TOOL'
  | 'MEMORY'
  | 'GUARD'
  | 'TRIGGER'
  | 'CONDITION'
  | 'RESOLUTION'
  | 'START'
  | 'PERSONA'
  | 'CONFIG'
  | 'DECISION'
  | 'OPTION'
  | 'STEP'
  | 'REFERENCE'
  | 'ACTION'
  | 'END'
  | 'INPUT'
  | 'LOGGING'
  | 'GROUP'
  // V6 additions
  | 'SKILL'    // Skill composition/invocation (sk)
  | 'LOOP'     // Loop construct entry with back-edges (lp)
  | 'WARNING'; // Anti-pattern / "do NOT" documentation node (wp)

export interface NodeData {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  config: Record<string, any>;
  position: { x: number; y: number };
  isDangerous?: boolean;
  dangerReason?: string;
  lineIndex?: number;
  rawLine?: string;
}

export interface Connection {
  id: string;
  source: string;
  target: string;
  type?: 'default' | 'handoff' | 'escalation' | 'callback';
  condition?: string;
  /** V9: data-flow / trust-boundary classification (optional, additive). */
  kind?: 'control' | 'data' | 'condition' | 'loopback' | 'untrusted-data' | 'pii-flow';
}

export interface Annotation {
  id: string;
  nodeId?: string;
  content: string;
  position: { x: number; y: number };
  color?: string;
}

export interface AgentSettings {
  llmProvider: 'openai' | 'anthropic' | 'groq' | 'gemini' | 'custom';
  apiKey: string;
  model: string;
  temperature: number;
}

// ── Gemini Model Constants ──────────────────────────────────────────────────
export const GEMINI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
] as const;

export type GeminiModel = typeof GEMINI_MODELS[number];

export const DEFAULT_GEMINI_MODEL: GeminiModel = 'gemini-3-flash-preview';

// ── Provider Config ──────────────────────────────────────────────────────────

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'custom'

export interface ProviderConfig {
  provider: AIProvider
  model: string
  temperature?: number          // 0.0–2.0; not applicable to o1/o3 or Anthropic thinking
  maxTokens?: number            // output token limit
  // Personal API key — stored in localStorage only, never sent to server
  personalApiKey?: string
  // OpenAI o1/o3 reasoning models
  reasoningEffort?: 'low' | 'medium' | 'high'
  // Anthropic extended thinking
  extendedThinking?: boolean
  thinkingBudget?: number       // budget_tokens: 1000–32000
  // Custom OpenAI-compatible endpoint
  baseUrl?: string              // e.g. http://localhost:11434/v1
}

export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  gemini: ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
  openai: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-codex', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  custom: [],
}

export const OPENAI_REASONING_MODELS = new Set(['o1', 'o1-mini', 'o3', 'o3-mini'])

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'gemini',
  model: 'gemini-3-flash-preview',
  temperature: 0,
  maxTokens: 8192,
}

/** @deprecated Use RiskPermission from capability-analyzer.ts instead */
export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  nodeId: string;
  category: 'data' | 'integration' | 'logic' | 'communication';
}

// ── Unified Analyzer Types ──────────────────────────────────────────────────

export type AnalysisCategory = 'prompt-quality' | 'safety' | 'graph-structure';

export type RiskCategory =
  | 'api-integration'
  | 'data-storage'
  | 'logging-audit'
  | 'communication'
  | 'financial'
  | 'system-infra'
  | 'auth-permissions'
  | 'ai-llm';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskPermission {
  id: string;
  name: string;
  description: string;
  nodeId: string;
  category: RiskCategory;
  riskLevel: RiskLevel;
  hasGuard: boolean;
  guardNodeId?: string;
  reason?: string;
  isWrite?: boolean;
  guardBypassed?: boolean;
}

export interface CognitiveLoadScore {
  score: number;
  level: 'green' | 'yellow' | 'red';
  ruleCount: number;
  conditionDepth: number;
  constraintDensity: number;
}

export interface SimplicityScore {
  score: number;
  level: 'green' | 'yellow' | 'red';
  avgSentenceLength: number;
  fillerPhraseCount: number;
  actionVerbCount: number;
  redundancyCount: number;
}

export interface InstructionConstraintRatio {
  score: number;
  instructionCount: number;
  constraintCount: number;
  level: 'green' | 'yellow' | 'red';
}

export type HubCategory =
  | 'customer-service'
  | 'data-processing'
  | 'approval-workflow'
  | 'content-moderation'
  | 'orchestration';

export interface HubMeta {
  forkCount: number;
  tags: string[];
  category: HubCategory;
  forkedFrom?: string;
  publishedAt?: string;
}

export interface AgentInterfaceContract {
  expectedInput?: string[];
  expectedOutput?: string[];
}

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  originalPrompt?: string;
  editedPrompt?: string;
  nodes: NodeData[];
  connections: Connection[];
  annotations?: Annotation[];
  version: string;
  createdAt: string;
  updatedAt: string;
  settings?: AgentSettings;
  edgeType?: 'default' | 'smoothstep' | 'straight';
  isPublic?: boolean;
  rating?: number;
  ratingCount?: number;
  author?: string;
  capabilities?: AgentCapability[];
  /** ID of the master agent (set on subagents only) */
  parentAgentId?: string;
  /** Ordered child subagent IDs (set on master agents only) */
  childAgentIds?: string[];
  /** Role label in a multi-agent system (e.g. "ROUTER", "PRICE_CHECK") */
  agentRole?: string;
  hubMeta?: HubMeta;
  sourceFormat?: 'json' | 'yaml' | 'json-compact';
  /** Raw LLM output text before decoding — useful for debugging compact formats */
  rawLlmOutput?: string;
  /** Current version ID from version control */
  currentVersionId?: string;
  /** Which generation pipeline created this graph */
  generatedWith?: 'v4' | 'v6';
  /** V6: detected prompt category */
  promptCategory?: 'business-flow' | 'skill-workflow' | 'agent-spec' | 'loop-pattern';
  /** V6: permissions manifest emitted by analyze-permissions stage */
  permissionsManifest?: PermissionsManifest;
  /** Group/workspace this agent belongs to (null = personal) */
  groupId?: string | null;
  /** Graph-owned runtime assets inherited by OpenShell deployments */
  runtimePackage?: RuntimePackage;
}

export interface MultiAgentDetection {
  isMasterAgent: boolean;
  masterRole: string;
  subAgentRoles: string[];
  masterPromptFragment: string;
  subAgentPromptHints: string[];
}

export interface ConflictRule {
  id?: string;
  type: 'error' | 'warning' | 'info';
  message: string;
  nodeIds: string[];
  promptLines?: { start: number; end: number }[];
  ruleCategory?: 'dag' | 'graph' | 'structural';
}

export interface GraphRuleSettings {
  postParseValidation: boolean;
  strictChatEditMode: boolean;
  preFlightRunnerCheck: boolean;
  injectDAGRulesInPrompts: boolean;
  autoWireDisconnected: boolean;
  enhancedEdgePrompt: boolean;
  structuredOutcomeChains: boolean;
  outputFormat: 'json' | 'yaml' | 'json-compact';
  chatEditFormat: 'json' | 'yaml' | 'json-compact';
}

export const DEFAULT_GRAPH_RULE_SETTINGS: GraphRuleSettings = {
  postParseValidation: true,
  strictChatEditMode: false,
  preFlightRunnerCheck: false,
  injectDAGRulesInPrompts: false,
  autoWireDisconnected: true,
  enhancedEdgePrompt: true,
  structuredOutcomeChains: true,
  outputFormat: 'json-compact',
  chatEditFormat: 'json-compact',
};

export type GenerationMode = 'full-ai-v4' | 'full-ai-v6' | 'full-ai-v7';

// ── V6 Permissions Manifest ─────────────────────────────────────────────────

export type AccessCategory =
  | 'file-read'
  | 'file-write'
  | 'network'
  | 'shell'
  | 'git'
  | 'external-api'
  | 'unknown';

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export interface PiiFlow {
  from: string;
  to: string;
  data: string;
}

export interface PermissionsManifest {
  /** All t=tool node tool-field values */
  toolsRequired: string[];
  /** All sk=skill node skillRef values (may include 'unknown') */
  skillsInvoked: string[];
  /** Derived access categories */
  accessCategories: AccessCategory[];
  /** e.g. "--allowedTools Read,Write,Bash" */
  allowedToolsFlag: string;
  /** sk=skill nodes whose scope could not be resolved */
  unknownScopeWarnings: string[];
  /** Overall risk level */
  riskLevel: 'low' | 'medium' | 'high';
  // ── V9 additive fields (optional, populated by the V9 audit pass) ─────────
  /** Per-node risk tiers, keyed by node id. V9 only. */
  perNodeRisk?: Record<string, RiskTier>;
  /** Paragraphs / nodes considered untrusted-input entry points. V9 only. */
  injectionVectors?: string[];
  /** PII flows: src → dst with the sensitive data field. V9 only. */
  piiFlows?: PiiFlow[];
  /** Counts of node side-effect classes. V9 only. */
  sideEffectSummary?: { local: number; external: number; unknown: number };
  /** Natural-language notes produced by the heavy-tier LLM audit pass. V9 only. */
  auditNotes?: string[];
}

export const NODE_COLORS: Record<NodeType, string> = {
  AGENT: '#C15F3C', // Crail (Rust/Peach) — Claude accent
  RULE: '#2E7D32', // Deep green
  TASK: '#1E88E5', // Deep blue
  HANDOFF: '#7B1FA2', // Deep purple
  TOOL: '#D4AF37', // Gold 
  MEMORY: '#0288D1', // Cyan-blue
  GUARD: '#C62828', // Material Red 800
  TRIGGER: '#43A047', // Green 600
  CONDITION: '#F57C00', // Orange 700
  RESOLUTION: '#5E35B1', // Deep purple
  START: '#2E7D32',
  PERSONA: '#1976D2',
  CONFIG: '#607D8B', // Blue-gray
  DECISION: '#E65100',
  OPTION: '#EF6C00',
  STEP: '#00ACC1',
  REFERENCE: '#7E57C2',
  ACTION: '#D81B60',
  END: '#D32F2F',
  INPUT: '#0097A7',
  LOGGING: '#00897B',
  GROUP: '#455A64',
  // V6
  SKILL: '#0D47A1',   // Deep blue — distinct from AGENT (rust)
  LOOP: '#F57F17',    // Amber — matches loop-pattern category theme
  WARNING: '#B71C1C', // Dark red — clearly a danger/do-not-do node
};

export const NODE_ICONS: Record<NodeType, string> = {
  AGENT: '🤖',
  RULE: '📋',
  TASK: '✓',
  HANDOFF: '↔',
  TOOL: '🔧',
  MEMORY: '💾',
  GUARD: '🛡',
  TRIGGER: '⚡',
  CONDITION: '🔀',
  RESOLUTION: '🎯',
  START: '🚀',
  PERSONA: '👤',
  CONFIG: '⚙️',
  DECISION: '❓',
  OPTION: '⌥',
  STEP: '👣',
  REFERENCE: '📚',
  ACTION: '🎬',
  END: '✅',
  INPUT: '📥',
  LOGGING: '🗃️',
  GROUP: '📂',
  // V6
  SKILL: '🧩',
  LOOP: '🔁',
  WARNING: '⚠️',
};

// ── Agent Execution Runtime ─────────────────────────────────────────────────

export type RealExecutionStatus =
  | 'running'
  | 'complete'
  | 'error'
  | 'handoff'
  | 'blocked'
  | 'passthrough';

export interface RealExecutionStep {
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  input: string;
  output: string;
  status: RealExecutionStatus;
  timestamp: number;
  tokenCount: number;
  streamingText?: string; // live tokens during execution (UI uses this)
}

// ── Simulation Studio ───────────────────────────────────────────────────────

export type SimulationStepStatus =
  | 'running'
  | 'complete'
  | 'error'
  | 'blocked'
  | 'skipped'
  | 'warning'
  | 'passthrough'
  | 'handoff';

export type SimulationErrorCause =
  | 'missing_connection'
  | 'guard_blocked'
  | 'invalid_input'
  | 'no_matching_path'
  | 'llm_error'
  | 'timeout'
  | 'dead_end'
  | 'unreachable';

export interface DataChange {
  field: string;
  before: string | null;
  after: string | null;
  changeType: 'added' | 'removed' | 'modified';
}

export interface ConditionResult {
  condition: string;
  result: boolean;
  evaluatedValue?: string;
}

export interface SimulationErrorDetail {
  message: string;
  cause: SimulationErrorCause;
  suggestion?: string;
}

export interface SimulationStep {
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;

  // Data flow
  input: string;
  output: string;
  dataTransformations: DataChange[];

  // Condition tracking
  conditionsEvaluated?: ConditionResult[];
  pathTaken?: string;
  alternativePaths?: string[];

  // Error context
  status: SimulationStepStatus;
  errorDetail?: SimulationErrorDetail;

  // Metadata
  timestamp: number;
  tokenCount: number;
  streamingText?: string;
}

export interface PreFlightIssue {
  severity: 'error' | 'warning';
  message: string;
  nodeIds: string[];
  suggestion?: string;
}

export interface SimulationResult {
  steps: SimulationStep[];
  preFlightIssues: PreFlightIssue[];
  status: 'completed' | 'failed' | 'stopped';
  totalSteps: number;
  errorCount: number;
  warningCount: number;
}

// ── Prompt Pattern Library ───────────────────────────────────────────────────

export type PatternCategory =
  | 'reasoning'
  | 'validation'
  | 'error-handling'
  | 'routing'
  | 'memory'
  | 'integration';

export type PatternDomain =
  | 'finance'
  | 'customer-service'
  | 'data-processing'
  | 'sales'
  | 'healthcare'
  | 'hr'
  | 'legal'
  | 'ecommerce'
  | 'devops'
  | 'marketing';

export type PatternComplexity = 'simple' | 'intermediate' | 'advanced';

export const PATTERN_DOMAINS: { id: PatternDomain; label: string; color: string }[] = [
  { id: 'finance',          label: 'Finance',          color: 'blue' },
  { id: 'customer-service', label: 'Customer Service', color: 'green' },
  { id: 'data-processing',  label: 'Data Processing',  color: 'purple' },
  { id: 'sales',            label: 'Sales / CRM',      color: 'orange' },
  { id: 'healthcare',       label: 'Healthcare',       color: 'red' },
  { id: 'hr',               label: 'HR',               color: 'pink' },
  { id: 'legal',            label: 'Legal',            color: 'slate' },
  { id: 'ecommerce',        label: 'E-commerce',       color: 'yellow' },
  { id: 'devops',           label: 'DevOps',           color: 'cyan' },
  { id: 'marketing',        label: 'Marketing',        color: 'rose' },
];

export interface PromptPattern {
  id: string;
  name: string;
  description: string;
  category: PatternCategory;
  icon: string;
  tags: string[];
  nodes: NodeData[];
  connections: Connection[];
  entryNodeId: string;
  exitNodeIds: string[];
  // Extended fields
  domain?: PatternDomain;
  complexity?: PatternComplexity;
  promptFragment?: string;
  isBuiltIn?: boolean;
  isPublic?: boolean;
  ownerId?: string;
  groupId?: string;
  usageCount?: number;
  createdAt?: string;
}
