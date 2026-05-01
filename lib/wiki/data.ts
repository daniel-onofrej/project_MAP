// Shared data constants consumed by both the wiki (server + client components)
// and app/introduction/page.tsx. Lives here so wiki client components don't
// have to import from a Next.js page module (which carries `metadata` and
// triggers the "metadata export from client component" build error).

export const NODE_COLORS: Record<string, string> = {
  AGENT: '#C15F3C',
  RULE: '#2E7D32',
  TASK: '#1E88E5',
  HANDOFF: '#7B1FA2',
  TOOL: '#D4AF37',
  MEMORY: '#0288D1',
  GUARD: '#C62828',
  TRIGGER: '#43A047',
  CONDITION: '#F57C00',
  RESOLUTION: '#5E35B1',
  START: '#2E7D32',
  PERSONA: '#1976D2',
  CONFIG: '#607D8B',
  DECISION: '#E65100',
  OPTION: '#EF6C00',
  STEP: '#00ACC1',
  REFERENCE: '#7E57C2',
  ACTION: '#D81B60',
  END: '#D32F2F',
  INPUT: '#0097A7',
  LOGGING: '#00897B',
  GROUP: '#455A64',
}

export const NODE_ICONS: Record<string, string> = {
  AGENT: '🤖', RULE: '📋', TASK: '✓', HANDOFF: '↔', TOOL: '🔧',
  MEMORY: '💾', GUARD: '🛡', TRIGGER: '⚡', CONDITION: '🔀', RESOLUTION: '🎯',
  START: '🚀', PERSONA: '👤', CONFIG: '⚙️', DECISION: '❓', OPTION: '⌥',
  STEP: '👣', REFERENCE: '📚', ACTION: '🎬', END: '✅', INPUT: '📥',
  LOGGING: '🗃️', GROUP: '📂',
}

export const NODE_DESCRIPTIONS: Record<string, string> = {
  AGENT: 'Autonomous LLM agent', RULE: 'Business logic gate', TASK: 'Unit of work',
  HANDOFF: 'Agent-to-agent pass', TOOL: 'External API call', MEMORY: 'State persistence',
  GUARD: 'Safety filter', TRIGGER: 'Event activation', CONDITION: 'Branch condition',
  RESOLUTION: 'Outcome handler', START: 'Flow entry point', PERSONA: 'Agent identity',
  CONFIG: 'Runtime settings', DECISION: 'Routing decision', OPTION: 'Choice branch',
  STEP: 'Sequential action', REFERENCE: 'External pointer', ACTION: 'Execute action',
  END: 'Flow termination', INPUT: 'User / data input', LOGGING: 'Observability output',
  GROUP: 'Container for grouped nodes',
}

export const AI_PROVIDERS = [
  { name: 'Gemini 3 Flash', dot: '#22c55e', note: 'Default' },
  { name: 'OpenAI', dot: '#3b82f6', note: 'GPT-5.x, Codex, o3' },
  { name: 'Anthropic', dot: '#f97316', note: 'Opus, Sonnet, Haiku' },
  { name: 'Custom Endpoint', dot: '#6b7280', note: 'Azure AI Foundry, Ollama, any OpenAI-compatible API' },
]

export const TEMPLATES = [
  { icon: '🎧', name: 'Customer Support', desc: 'Intent classification, routing, and escalation for support workflows.', nodes: ['AGENT', 'TASK', 'RULE', 'HANDOFF'], nodeCount: 5 },
  { icon: '✅', name: 'Approval Workflow', desc: 'Request validation, auto-approval, manager review, and notifications.', nodes: ['DECISION', 'GUARD', 'STEP', 'ACTION'], nodeCount: 5 },
  { icon: '🛡️', name: 'Content Moderation', desc: 'Profanity filter, spam detection, sentiment analysis, and publication gate.', nodes: ['GUARD', 'RULE', 'CONDITION', 'ACTION'], nodeCount: 5 },
  { icon: '⚙️', name: 'Data Pipeline', desc: 'Extract, validate schema, transform, and store to memory.', nodes: ['TASK', 'TOOL', 'MEMORY', 'STEP'], nodeCount: 5 },
  { icon: '🔗', name: 'Multi-Agent', desc: 'Master orchestrator delegates to specialist sub-agents, each with its own graph — click through to drill into any sub-agent.', nodes: ['AGENT', 'HANDOFF', 'TRIGGER', 'RESOLUTION'], nodeCount: 5 },
]
