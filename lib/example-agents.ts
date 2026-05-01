import type { AgentConfig } from './types';
import { normalizeAgentConfig } from './storage/storage';

// ─── Senior Cloud Architect — Final 1:1 Mapping with Premium Prompt ──────────
// This version strictly includes all segments for the "Premium Skill Prompt"
// view, including the metadata header and knowledge footer.

const RAW_EXAMPLES: any[] = [];

export const EXAMPLE_AGENTS: AgentConfig[] = RAW_EXAMPLES.map(normalizeAgentConfig);
