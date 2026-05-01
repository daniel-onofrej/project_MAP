// ─────────────────────────────────────────────────────────────────────────────
// Prompt-to-Graph V4 — Types
//
// Minimal, clean types for a 1-call bidirectional pipeline.
// Each node stores verbatim source text for perfect round-trip.
// ─────────────────────────────────────────────────────────────────────────────
import type { AgentConfig } from '../../types';

// ── Compact type codes (same as v3 for canvas compatibility) ──────────────────
export type TypeCode =
  | 'st' | 'e' | 'i' | 'd' | 'a' | 't' | 'ru' | 's' | 'o'
  | 'ag' | 'ref' | 'cf' | 'tr' | 'c' | 'ta' | 'p' | 'm' | 'h'
  | 'lg' | 'g' | 'r' | 'gr';

// ── Source paragraph (from deterministic parse) ───────────────────────────────
export interface Paragraph {
  /** §N reference, e.g. "§3" */
  ref: string;
  /** 0-based index */
  index: number;
  /** Verbatim text of this paragraph */
  text: string;
  /** Section heading this paragraph belongs to */
  section: string;
}

// ── Paragraph ledger (Stage 0 output) ─────────────────────────────────────────
export interface Ledger {
  /** Original prompt text (normalized) */
  prompt: string;
  /** All paragraphs in order */
  paragraphs: Paragraph[];
  /** §N refs of non-blank paragraphs */
  refs: string[];
  /** Detected format: 'h'=heading-structured, 'p'=plain, 'y'=yaml */
  format: 'p' | 'h' | 'y';
}

// ── Edge tuple [source, target, label?] ───────────────────────────────────────
export type EdgeTuple = [number, number, string?];

// ── LLM output shape (single call) ───────────────────────────────────────────
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
  /** 1-based stable index */
  id: number;
  type: TypeCode;
  label: string;
  /** §N refs that this node represents */
  refs: string[];
  /** Tool name if type is 't' or 'lg' */
  tool?: string;
  /** Business outcome label */
  outcome?: string;
  /** 'g'=global, 's'=scoped — for annotation nodes */
  scope?: 'g' | 's';
  /** Node ids this annotation governs */
  governs?: number[];
}

// ── Pipeline options ──────────────────────────────────────────────────────────
export interface TokenUsage {
  promptTokens: number;
  responseTokens: number;
  thoughtsTokens?: number;
  totalTokens: number;
}

export interface V4Options {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onPhaseChange?: (phase: number, name: string, status: 'started' | 'done') => void;
  existingPositions?: Map<string, { x: number; y: number }>;
  skipLayout?: boolean;
}

// ── Full run result ───────────────────────────────────────────────────────────
export interface V4Result {
  agentConfig: AgentConfig;
  plan: GraphPlan;
  ledger: Ledger;
  compactJson: string;
}
