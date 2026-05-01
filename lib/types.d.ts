export type NodeType = 'AGENT' | 'RULE' | 'TASK' | 'HANDOFF' | 'TOOL' | 'MEMORY' | 'GUARD' | 'TRIGGER' | 'CONDITION' | 'RESOLUTION' | 'START' | 'PERSONA' | 'CONFIG' | 'DECISION' | 'OPTION' | 'STEP' | 'REFERENCE' | 'ACTION' | 'END' | 'INPUT' | 'LOGGING' | 'GROUP';
export interface NodeData {
    id: string;
    type: NodeType;
    label: string;
    description?: string;
    config: Record<string, any>;
    position: {
        x: number;
        y: number;
    };
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
}
export interface Annotation {
    id: string;
    nodeId?: string;
    content: string;
    position: {
        x: number;
        y: number;
    };
    color?: string;
}
export interface AgentSettings {
    llmProvider: 'openai' | 'anthropic' | 'groq' | 'gemini' | 'custom';
    apiKey: string;
    model: string;
    temperature: number;
}
export declare const GEMINI_MODELS: readonly ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"];
export type GeminiModel = typeof GEMINI_MODELS[number];
export declare const DEFAULT_GEMINI_MODEL: GeminiModel;
export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'custom';
export interface ProviderConfig {
    provider: AIProvider;
    model: string;
    temperature?: number;
    maxTokens?: number;
    reasoningEffort?: 'low' | 'medium' | 'high';
    extendedThinking?: boolean;
    thinkingBudget?: number;
    baseUrl?: string;
}
export declare const PROVIDER_MODELS: Record<AIProvider, string[]>;
export declare const OPENAI_REASONING_MODELS: Set<string>;
export declare const DEFAULT_PROVIDER_CONFIG: ProviderConfig;
/** @deprecated Use RiskPermission from capability-analyzer.ts instead */
export interface AgentCapability {
    id: string;
    name: string;
    description: string;
    nodeId: string;
    category: 'data' | 'integration' | 'logic' | 'communication';
}
export type AnalysisCategory = 'prompt-quality' | 'safety' | 'graph-structure';
export type RiskCategory = 'api-integration' | 'data-storage' | 'logging-audit' | 'communication' | 'financial' | 'system-infra' | 'auth-permissions' | 'ai-llm';
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
export type HubCategory = 'customer-service' | 'data-processing' | 'approval-workflow' | 'content-moderation' | 'orchestration';
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
    generatedWith?: 'v1' | 'v4' | 'v5';
    /** Group/workspace this agent belongs to (null = personal) */
    groupId?: string | null;
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
    promptLines?: {
        start: number;
        end: number;
    }[];
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
export declare const DEFAULT_GRAPH_RULE_SETTINGS: GraphRuleSettings;
export type GenerationMode = 'full-ai' | 'full-ai-v4' | 'full-ai-v5';
export declare const NODE_COLORS: Record<NodeType, string>;
export declare const NODE_ICONS: Record<NodeType, string>;
export type RealExecutionStatus = 'running' | 'complete' | 'error' | 'handoff' | 'blocked' | 'passthrough';
export interface RealExecutionStep {
    nodeId: string;
    nodeType: NodeType;
    nodeLabel: string;
    input: string;
    output: string;
    status: RealExecutionStatus;
    timestamp: number;
    tokenCount: number;
    streamingText?: string;
}
export type SimulationStepStatus = 'running' | 'complete' | 'error' | 'blocked' | 'skipped' | 'warning' | 'passthrough' | 'handoff';
export type SimulationErrorCause = 'missing_connection' | 'guard_blocked' | 'invalid_input' | 'no_matching_path' | 'llm_error' | 'timeout' | 'dead_end' | 'unreachable';
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
    input: string;
    output: string;
    dataTransformations: DataChange[];
    conditionsEvaluated?: ConditionResult[];
    pathTaken?: string;
    alternativePaths?: string[];
    status: SimulationStepStatus;
    errorDetail?: SimulationErrorDetail;
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
export type PatternCategory = 'reasoning' | 'validation' | 'error-handling' | 'routing' | 'memory' | 'integration';
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
}
