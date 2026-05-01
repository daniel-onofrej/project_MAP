// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V6 — Public API
//
// Usage:
//   import { promptToGraphV6, graphToPromptV6 } from '@/lib/prompt-to-graph/v6';
//
//   // Forward: prompt → graph (5-stage pipeline)
//   const config = await promptToGraphV6(prompt, { apiKey, model });
//
//   // Reverse: graph → prompt
//   const reconstructed = graphToPromptV6(config);
//
// V6 improvements over V5:
//   - Stage -1: frontmatter stripping + code block condensing
//   - Stage 0.5: prompt type classification (business-flow | skill-workflow | agent-spec | loop-pattern)
//   - 4 specialized system prompts (one per category)
//   - 3 new node types: sk=skill, lp=loop, wp=warning
//   - Loop-aware cycle removal (back-edges to lp=loop preserved)
//   - Stage 3.5: PermissionsManifest analysis
//   - promptCategory + permissionsManifest on AgentConfig
// ─────────────────────────────────────────────────────────────────────────────

// Forward pipeline
export { promptToGraphV6, promptToGraphV6Detailed, V6_MODEL } from './generate';

// Reverse pipeline (bidirectional)
export {
  graphToPrompt as graphToPromptV6,
  compactToGraphPlan,
  agentConfigToGraphPlan,
  agentConfigToLedger,
} from './reconstruct';

// Parsing
export { buildLedger, formatLedger, resolveRefs } from './parse';

// Pre-processing (Stage -1)
export { parseFrontmatter, condenseCodeBlocks } from './preprocess';

// Classification (Stage 0.5)
export { classifyPromptType } from './classify';

// Permissions analysis (Stage 3.5)
export { analyzePermissions } from './analyze-permissions';

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
  V6Options,
  V6Result,
  PromptType,
  LoopEdge,
} from './types';
