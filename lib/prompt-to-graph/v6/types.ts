// Prompt-to-Graph V6 — Types
// V6 additions: sk=skill, lp=loop, wp=warning TypeCodes; LoopEdge; PromptType

import type { AgentConfig } from '../../types';

export type TypeCode =
  | 'st' | 'e' | 'i' | 'd' | 'a' | 't' | 'ru' | 's' | 'o'
  | 'ag' | 'ref' | 'cf' | 'tr' | 'c' | 'ta' | 'p' | 'm' | 'h'
  | 'lg' | 'g' | 'r' | 'gr' | 'sk' | 'lp' | 'wp';

export interface Paragraph {
  ref: string;
  index: number;
  text: string;
  section: string;
}

export interface Ledger {
  prompt: string;
  paragraphs: Paragraph[];
  refs: string[];
  format: 'p' | 'h' | 'y';
}

export type EdgeTuple = [number, number, string?];

export interface LoopEdge {
  /** The edge key "src->tgt" that is a back-edge to an lp=loop node */
  key: string;
  /** Source node id */
  src: number;
  /** Target lp=loop node id */
  tgt: number;
}

export interface GraphPlan {
  meta: {
    agent_id: string;
    persona: string;
    tone: string;
    version: string;
    description: string;
  };
  nodes: PlanNode[];
  edges: EdgeTuple[];
}

export interface PlanNode {
  id: number;
  type: TypeCode;
  label: string;
  refs: string[];
  tool?: string;
  outcome?: string;
  scope?: 'g' | 's';
  governs?: number[];
  desc?: string;
  /** If set, this node is a visual clone of another node (by id). Used to
   *  keep each branch readable top-to-bottom without edge crossings. */
  duplicateOf?: number;
}

export interface TokenUsage {
  promptTokens: number;
  responseTokens: number;
  thoughtsTokens?: number;
  totalTokens: number;
}

export type PromptType = 'business-flow' | 'skill-workflow' | 'agent-spec' | 'loop-pattern';

export interface V6Options {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onPhaseChange?: (phase: number, name: string, status: 'started' | 'done') => void;
  existingPositions?: Map<string, { x: number; y: number }>;
  skipLayout?: boolean;
}

export interface V6Result {
  agentConfig: AgentConfig;
  plan: GraphPlan;
  ledger: Ledger;
  compactJson: string;
  promptType: PromptType;
}
