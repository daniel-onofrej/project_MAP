'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, RefreshCw, Plus, Minus, Sparkles, FileText, GitCompare } from 'lucide-react';
import type { AgentConfig } from '@/lib/types';
import { diffLines, computeDiffStats, type DiffRow, type InlineSpan } from '@/lib/diff-utils';
import { type AgentVersion } from '@/lib/storage/version-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

// ─────────────────────────────────────────────────────────────────────────────
// Inline span renderer for word-level diff highlights
// ─────────────────────────────────────────────────────────────────────────────

function InlineHighlight({ spans, side }: { spans: InlineSpan[]; side: 'left' | 'right' }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.type === 'same') {
          return <span key={i}>{span.text}</span>;
        }
        // Highlight changed words
        const cls = side === 'left'
          ? 'bg-red-300/40 dark:bg-red-500/30 text-red-800 dark:text-red-300 rounded-sm px-px'
          : 'bg-green-300/40 dark:bg-green-500/30 text-green-800 dark:text-green-300 rounded-sm px-px';
        return <span key={i} className={cls}>{span.text}</span>;
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PromptSource =
  | { type: 'original' }
  | { type: 'version'; id: string }
  | { type: 'current' };

function sourceKey(s: PromptSource): string {
  if (s.type === 'version') return `version:${s.id}`;
  return s.type;
}

export interface ReSyncResult {
  originalPrompt: string;
  reconstructedPrompt: string;
  similarity: number;
}

interface ReSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAgent: AgentConfig | null;
  apiKey?: string;
  /** Pass the already-computed result to skip the Gemini call on open */
  preloadedResult?: ReSyncResult | null;
  /** Called when a fresh result is computed (so parent can update its cache) */
  onResultComputed?: (result: ReSyncResult) => void;
  onRegenerate: (agent: AgentConfig) => void;
  versions?: AgentVersion[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReSyncDialog({
  open,
  onOpenChange,
  currentAgent,
  apiKey,
  preloadedResult,
  onResultComputed,
  onRegenerate,
  versions,
}: ReSyncDialogProps) {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReSyncResult | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [cleanView, setCleanView] = useState(false);

  const [leftSource, setLeftSource] = useState<PromptSource>({ type: 'original' });
  const [rightSource, setRightSource] = useState<PromptSource>({ type: 'current' });
  const [leftText, setLeftText] = useState<string>('');
  const [rightText, setRightText] = useState<string>('');
  const [leftLoading, setLeftLoading] = useState(false);
  const [rightLoading, setRightLoading] = useState(false);

  const leftRef  = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const runSync = useCallback(async (force = false) => {
    if (!currentAgent) { setError('No agent loaded'); setStatus('error'); return; }

    setStatus('syncing');
    setError(null);

    try {
      const { reSyncGraphToPrompt } = await import('@/lib/graph/graph-to-prompt');
      const data = await reSyncGraphToPrompt(currentAgent);
      setResult(data);
      setStatus('done');
      onResultComputed?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-sync failed');
      setStatus('error');
    }
  }, [currentAgent, onResultComputed]);

  const resolveSource = useCallback(async (source: PromptSource): Promise<string> => {
    if (source.type === 'original') {
      return currentAgent?.originalPrompt ?? '';
    }
    if (source.type === 'current') {
      if (!currentAgent) return '';
      const { reSyncGraphToPrompt } = await import('@/lib/graph/graph-to-prompt');
      const data = await reSyncGraphToPrompt(currentAgent);
      return data.reconstructedPrompt;
    }
    const version = versions?.find(v => v.id === source.id);
    if (!version) return '';
    if (version.snapshot.originalPrompt) return version.snapshot.originalPrompt;
    const { reSyncGraphToPrompt } = await import('@/lib/graph/graph-to-prompt');
    const data = await reSyncGraphToPrompt(version.snapshot);
    return data.reconstructedPrompt;
  }, [currentAgent, versions]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLeftLoading(true);
    resolveSource(leftSource)
      .then(t => { if (!cancelled) { setLeftText(t); setLeftLoading(false); } })
      .catch(() => { if (!cancelled) setLeftLoading(false); });
    return () => { cancelled = true; };
  }, [open, leftSource, resolveSource]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRightLoading(true);
    resolveSource(rightSource)
      .then(t => { if (!cancelled) { setRightText(t); setRightLoading(false); } })
      .catch(() => { if (!cancelled) setRightLoading(false); });
    return () => { cancelled = true; };
  }, [open, rightSource, resolveSource]);

  // On open: if preloaded result exists use it; otherwise run Gemini
  useEffect(() => {
    if (!open) {
      setStatus('idle');
      setError(null);
      return;
    }
    if (preloadedResult) {
      setResult(preloadedResult);
      setStatus('done');
    } else {
      runSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Synchronized scrolling
  const handleLeftScroll = useCallback(() => {
    if (syncingRef.current || !rightRef.current || !leftRef.current) return;
    syncingRef.current = true;
    rightRef.current.scrollTop = leftRef.current.scrollTop;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  const handleRightScroll = useCallback(() => {
    if (syncingRef.current || !leftRef.current || !rightRef.current) return;
    syncingRef.current = true;
    leftRef.current.scrollTop = rightRef.current.scrollTop;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  const diffRows = useMemo<DiffRow[]>(() => {
    if (!leftText && !rightText) return [];
    return diffLines(leftText, rightText);
  }, [leftText, rightText]);

  const stats = useMemo(() => computeDiffStats(diffRows), [diffRows]);

  const similarity = useMemo(() => {
    if (!leftText && !rightText) return 1;
    const leftLines = leftText.split('\n').length;
    const rightLines = rightText.split('\n').length;
    const total = Math.max(leftLines, rightLines, 1);
    const changed = stats.added + stats.removed - stats.modified;
    return Math.max(0, 1 - changed / (total * 2));
  }, [leftText, rightText, stats]);

  const handleRegenerate = async () => {
    if (!rightText || !currentAgent || !apiKey) return;
    setIsRegenerating(true);
    try {
      const { promptToGraphV4, buildPositionMap } = await import('@/lib/prompt-to-graph/v4');
      const existingPositions = buildPositionMap(currentAgent);
      const newAgent = await promptToGraphV4(rightText, { apiKey, existingPositions });
      newAgent.id = currentAgent.id;
      newAgent.originalPrompt = currentAgent.originalPrompt ?? newAgent.originalPrompt;
      newAgent.editedPrompt = rightText;
      newAgent.generatedWith = 'v4';
      onRegenerate(newAgent);

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setIsRegenerating(false);
    }
  };

  const similarityColor = (s: number) => {
    if (s >= 0.75) return 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800';
    if (s >= 0.45) return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800';
    return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[88vw] w-[88vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <RefreshCw className="h-4 w-4 text-primary" />
              Prompt Re-sync
            </DialogTitle>

            <div className="flex items-center gap-3">
              {leftText && rightText && (
                <>
                  <button
                    onClick={() => setCleanView(v => !v)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title={cleanView ? 'Switch to diff view' : 'Switch to clean view'}
                  >
                    {cleanView ? (
                      <><GitCompare className="h-3 w-3" />Diff</>
                    ) : (
                      <><FileText className="h-3 w-3" />Clean</>
                    )}
                  </button>
                  <Badge variant="outline" className={`text-xs font-mono ${similarityColor(similarity)}`}>
                    {Math.round(similarity * 100)}% match
                  </Badge>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {stats.modified > 0 && (
                      <span className="flex items-center gap-0.5 text-yellow-600 dark:text-yellow-400">
                        ~{stats.modified} modified
                      </span>
                    )}
                    {stats.added - stats.modified > 0 && (
                      <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400">
                        <Plus className="h-3 w-3" />{stats.added - stats.modified} added
                      </span>
                    )}
                    {stats.removed - stats.modified > 0 && (
                      <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
                        <Minus className="h-3 w-3" />{stats.removed - stats.modified} removed
                      </span>
                    )}
                    {stats.added === 0 && stats.removed === 0 && (
                      <span className="text-green-600 dark:text-green-400">No changes detected</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-1 min-h-0 divide-x divide-border">
              {/* Left — original */}
              <div className="flex flex-col flex-1 min-w-0">
                <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0 flex items-center gap-2">
                  <Select
                    value={sourceKey(leftSource)}
                    onValueChange={val => {
                      if (val === 'original') setLeftSource({ type: 'original' });
                      else if (val === 'current') setLeftSource({ type: 'current' });
                      else setLeftSource({ type: 'version', id: val.replace('version:', '') });
                    }}
                  >
                    <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 w-auto font-semibold uppercase tracking-wide text-muted-foreground focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original" className="text-xs">Original Prompt</SelectItem>
                      {(versions ?? []).map(v => (
                        <SelectItem key={v.id} value={`version:${v.id}`} className="text-xs">
                          v{v.versionLabel} — {v.message.slice(0, 30)}
                        </SelectItem>
                      ))}
                      <SelectItem value="current" className="text-xs">Current Graph (live)</SelectItem>
                    </SelectContent>
                  </Select>
                  {leftLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <div
                  ref={leftRef}
                  onScroll={handleLeftScroll}
                  className="flex-1 overflow-y-auto overflow-x-auto font-mono text-xs leading-relaxed"
                >
                  {cleanView ? (
                    <table className="w-full border-collapse">
                      <tbody>
                        {leftText.split('\n').map((line, idx) => (
                          <tr key={idx}>
                            <td className="w-10 px-2 py-0.5 text-right text-muted-foreground/50 select-none border-r border-border/50 shrink-0">{idx + 1}</td>
                            <td className="px-3 py-0.5 whitespace-pre-wrap break-all text-foreground">{line}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full border-collapse">
                      <tbody>
                        {diffRows.map((row, idx) => {
                          if (row.type === 'added') {
                            return (
                              <tr key={idx} className="bg-green-500/5">
                                <td className="w-10 px-2 py-0.5 text-right text-muted-foreground/40 select-none border-r border-border/50 shrink-0">&nbsp;</td>
                                <td className="px-3 py-0.5 text-transparent select-none whitespace-pre-wrap break-all">{row.right}</td>
                              </tr>
                            );
                          }
                          const lineNum = diffRows.slice(0, idx + 1).filter(r => r.type !== 'added').length;
                          if (row.type === 'modified') {
                            return (
                              <tr key={idx} className="bg-red-500/5">
                                <td className="w-10 px-2 py-0.5 text-right text-muted-foreground/50 select-none border-r border-border/50 shrink-0">{lineNum}</td>
                                <td className="px-3 py-0.5 whitespace-pre-wrap break-all">
                                  <InlineHighlight spans={row.leftSpans} side="left" />
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={idx} className={row.type === 'removed' ? 'bg-red-500/10' : ''}>
                              <td className="w-10 px-2 py-0.5 text-right text-muted-foreground/50 select-none border-r border-border/50 shrink-0">{lineNum}</td>
                              <td className={`px-3 py-0.5 whitespace-pre-wrap break-all ${row.type === 'removed' ? 'text-red-700 dark:text-red-400' : 'text-foreground'}`}>
                                {row.left ?? ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Right — reconstructed */}
              <div className="flex flex-col flex-1 min-w-0">
                <div className="px-4 py-2 border-b border-border bg-muted/30 shrink-0 flex items-center gap-2">
                  <Select
                    value={sourceKey(rightSource)}
                    onValueChange={val => {
                      if (val === 'original') setRightSource({ type: 'original' });
                      else if (val === 'current') setRightSource({ type: 'current' });
                      else setRightSource({ type: 'version', id: val.replace('version:', '') });
                    }}
                  >
                    <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 w-auto font-semibold uppercase tracking-wide text-muted-foreground focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original" className="text-xs">Original Prompt</SelectItem>
                      {(versions ?? []).map(v => (
                        <SelectItem key={v.id} value={`version:${v.id}`} className="text-xs">
                          v{v.versionLabel} — {v.message.slice(0, 30)}
                        </SelectItem>
                      ))}
                      <SelectItem value="current" className="text-xs">Current Graph (live)</SelectItem>
                    </SelectContent>
                  </Select>
                  {rightLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <div
                  ref={rightRef}
                  onScroll={handleRightScroll}
                  className="flex-1 overflow-y-auto overflow-x-auto font-mono text-xs leading-relaxed"
                >
                  {cleanView ? (
                    <table className="w-full border-collapse">
                      <tbody>
                        {rightText.split('\n').map((line, idx) => (
                          <tr key={idx}>
                            <td className="w-10 px-2 py-0.5 text-right text-muted-foreground/50 select-none border-r border-border/50 shrink-0">{idx + 1}</td>
                            <td className="px-3 py-0.5 whitespace-pre-wrap break-all text-foreground">{line}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full border-collapse">
                      <tbody>
                        {diffRows.map((row, idx) => {
                          if (row.type === 'removed') {
                            return (
                              <tr key={idx} className="bg-red-500/5">
                                <td className="w-10 px-2 py-0.5 text-right text-muted-foreground/40 select-none border-r border-border/50 shrink-0">&nbsp;</td>
                                <td className="px-3 py-0.5 text-transparent select-none whitespace-pre-wrap break-all">{row.left}</td>
                              </tr>
                            );
                          }
                          const lineNum = diffRows.slice(0, idx + 1).filter(r => r.type !== 'removed').length;
                          if (row.type === 'modified') {
                            return (
                              <tr key={idx} className="bg-green-500/5">
                                <td className="w-10 px-2 py-0.5 text-right text-muted-foreground/50 select-none border-r border-border/50 shrink-0">{lineNum}</td>
                                <td className="px-3 py-0.5 whitespace-pre-wrap break-all">
                                  <InlineHighlight spans={row.rightSpans} side="right" />
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={idx} className={row.type === 'added' ? 'bg-green-500/10' : ''}>
                              <td className="w-10 px-2 py-0.5 text-right text-muted-foreground/50 select-none border-r border-border/50 shrink-0">{lineNum}</td>
                              <td className={`px-3 py-0.5 whitespace-pre-wrap break-all ${row.type === 'added' ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>
                                {row.right ?? ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border shrink-0 flex items-center justify-between bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {stats.added === 0 && stats.removed === 0 && leftText && rightText
              ? 'The selected sources are identical.'
              : leftText && rightText
              ? 'Differences between selected sources.'
              : 'Select sources to compare.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              setLeftSource(s => ({ ...s }));
              setRightSource(s => ({ ...s }));
            }} disabled={leftLoading || rightLoading}>
              <RefreshCw className="h-3 w-3 mr-1.5" />
              Re-run
            </Button>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {(stats.added > 0 || stats.removed > 0) && leftText && rightText && (
              <Button size="sm" onClick={handleRegenerate} disabled={isRegenerating}>
                {isRegenerating ? (
                  <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Regenerating…</>
                ) : (
                  <><Sparkles className="h-3 w-3 mr-1.5" />Regenerate Graph</>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
