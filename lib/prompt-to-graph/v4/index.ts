// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V4 — Public API
//
// Usage:
//   import { promptToGraphV4, graphToPromptV4 } from '@/lib/p2gv4';
//
//   // Forward: prompt → graph
//   const config = await promptToGraphV4(prompt, { apiKey, model });
//
//   // Reverse: graph → prompt
//   const reconstructed = graphToPromptV4(config);
// ─────────────────────────────────────────────────────────────────────────────

// Forward pipeline
export { promptToGraphV4, promptToGraphV4Detailed, V4_MODEL } from './generate';

// Reverse pipeline (bidirectional)
export {
  graphToPrompt as graphToPromptV4,
  compactToGraphPlan,
  agentConfigToGraphPlan,
  agentConfigToLedger,
} from './reconstruct';

// Parsing
export { buildLedger, formatLedger, resolveRefs } from './parse';

// Multi-agent detection & generation
export {
  detectMultiAgent,
  generateMultiAgentGraphs,
} from './multi-agent';
export type { AgentGenStatus, AgentGenProgress, MultiAgentOptions } from './multi-agent';

// Utilities
export { buildPositionMap } from './utils';

// Types
export type {
  TypeCode,
  Paragraph,
  Ledger,
  EdgeTuple,
  GraphPlan,
  PlanNode,
  TokenUsage,
  V4Options,
  V4Result,
} from './types';
