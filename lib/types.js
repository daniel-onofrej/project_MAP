// ── Gemini Model Constants ──────────────────────────────────────────────────
export const GEMINI_MODELS = [
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
];
export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
export const PROVIDER_MODELS = {
    gemini: ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini', 'o3', 'o3-mini'],
    anthropic: ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20251101', 'claude-haiku-4-5-20251001'],
    groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    custom: [],
};
export const OPENAI_REASONING_MODELS = new Set(['o1', 'o1-mini', 'o3', 'o3-mini']);
export const DEFAULT_PROVIDER_CONFIG = {
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    temperature: 0,
    maxTokens: 8192,
};
export const DEFAULT_GRAPH_RULE_SETTINGS = {
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
export const NODE_COLORS = {
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
};
export const NODE_ICONS = {
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
};
//# sourceMappingURL=types.js.map