export interface LogEntry {
  type: 'tool_call' | 'session_start' | 'session_end' | 'error';
  id: string;
  tool?: string;
  sessionId?: string;
  timestamp: string;
  duration?: number;
  status?: 'success' | 'error';
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
}

export interface SessionInfo {
  id: string;
  clientName?: string;
  connectedAt: string;
  toolCalls: number;
}

export interface ToolStats {
  totalCalls: number;
  byTool: Record<string, number>;
  avgDuration: number;
  errorRate: number;
}

export interface ToolToggleConfig {
  enabledTools: string[];
}
