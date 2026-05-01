import type { AgentConfig } from './types';

export interface HistoryState {
  past: AgentConfig[];
  present: AgentConfig;
  future: AgentConfig[];
}

export function createHistory(agent: AgentConfig): HistoryState {
  return {
    past: [],
    present: agent,
    future: [],
  };
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}

export function undo(history: HistoryState): HistoryState {
  if (!canUndo(history)) return history;
  
  const previous = history.past[history.past.length - 1];
  const newPast = history.past.slice(0, history.past.length - 1);
  
  return {
    past: newPast,
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: HistoryState): HistoryState {
  if (!canRedo(history)) return history;
  
  const next = history.future[0];
  const newFuture = history.future.slice(1);
  
  return {
    past: [...history.past, history.present],
    present: next,
    future: newFuture,
  };
}

export function addToHistory(history: HistoryState, newState: AgentConfig): HistoryState {
  return {
    past: [...history.past, history.present],
    present: newState,
    future: [],
  };
}
