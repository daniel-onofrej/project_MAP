import type { AgentConfig } from '../../types';
import type { GraphPlan, TokenUsage } from '../v6/types';
export type { GraphPlan, TokenUsage } from '../v6/types';

export type DNARole =
  | 'persona'
  | 'goal'
  | 'rule'
  | 'behavior'
  | 'input-param'
  | 'output-format'
  | 'decision'
  | 'style-option'
  | 'example'
  | 'constraint';

export interface DNAItem {
  id: string;
  text: string;
  section: string;
  role: DNARole;
  is_conditional: boolean;
  is_pick_one: boolean;
  is_absolute: boolean;
  applies_to?: string[];
}

export type GraphStyle = 'A' | 'C';

export interface V7Options {
  apiKey: string;
  model?: string;
  graphStyle?: GraphStyle;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
  onUsage?: (usage: TokenUsage) => void;
  onPhaseChange?: (phase: number, name: string, status: 'started' | 'done') => void;
  existingPositions?: Map<string, { x: number; y: number }>;
  skipLayout?: boolean;
}

export interface V7Result {
  agentConfig: AgentConfig;
  dnaItems: DNAItem[];
  plan: GraphPlan;
  compactJson: string;
  graphStyle: GraphStyle;
}
