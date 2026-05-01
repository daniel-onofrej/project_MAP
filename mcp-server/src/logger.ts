import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { LogEntry, SessionInfo, ToolStats } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOGS_DIR = join(__dirname, '..', 'data', 'logs');
const LOG_FILE = join(LOGS_DIR, 'activity.jsonl');

if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

// Active sessions tracked in memory
const activeSessions = new Map<string, SessionInfo>();

export function logToolCall(entry: Omit<LogEntry, 'type' | 'id' | 'timestamp'>): string {
  const id = uuidv4();
  const logEntry: LogEntry = {
    type: 'tool_call',
    id,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf-8');

  // Update session tool call count
  if (entry.sessionId && activeSessions.has(entry.sessionId)) {
    activeSessions.get(entry.sessionId)!.toolCalls++;
  }

  return id;
}

export function logSessionStart(sessionId: string, clientName?: string): void {
  const session: SessionInfo = {
    id: sessionId,
    clientName,
    connectedAt: new Date().toISOString(),
    toolCalls: 0,
  };
  activeSessions.set(sessionId, session);

  const logEntry: LogEntry = {
    type: 'session_start',
    id: uuidv4(),
    sessionId,
    timestamp: session.connectedAt,
  };
  appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf-8');
}

export function logSessionEnd(sessionId: string): void {
  activeSessions.delete(sessionId);
  const logEntry: LogEntry = {
    type: 'session_end',
    id: uuidv4(),
    sessionId,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf-8');
}

export function getActiveSessions(): SessionInfo[] {
  return Array.from(activeSessions.values());
}

export function getHistory(limit = 50, offset = 0, toolFilter?: string): { calls: LogEntry[]; total: number } {
  if (!existsSync(LOG_FILE)) return { calls: [], total: 0 };
  const lines = readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
  let entries: LogEntry[] = lines
    .map(l => JSON.parse(l))
    .filter(e => e.type === 'tool_call');

  if (toolFilter) {
    entries = entries.filter(e => e.tool === toolFilter);
  }

  const total = entries.length;
  // Newest first
  entries.reverse();
  const calls = entries.slice(offset, offset + limit);
  return { calls, total };
}

export function getStats(): ToolStats {
  if (!existsSync(LOG_FILE)) {
    return { totalCalls: 0, byTool: {}, avgDuration: 0, errorRate: 0 };
  }
  const lines = readFileSync(LOG_FILE, 'utf-8').split('\n').filter(Boolean);
  const entries: LogEntry[] = lines.map(l => JSON.parse(l)).filter(e => e.type === 'tool_call');

  const byTool: Record<string, number> = {};
  let totalDuration = 0;
  let durationCount = 0;
  let errorCount = 0;

  for (const e of entries) {
    if (e.tool) byTool[e.tool] = (byTool[e.tool] || 0) + 1;
    if (e.duration) { totalDuration += e.duration; durationCount++; }
    if (e.status === 'error') errorCount++;
  }

  return {
    totalCalls: entries.length,
    byTool,
    avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    errorRate: entries.length > 0 ? errorCount / entries.length : 0,
  };
}
