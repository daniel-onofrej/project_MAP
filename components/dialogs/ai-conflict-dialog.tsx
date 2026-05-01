'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Play,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Wrench,
  Sparkles,
  Shield,
  FileText,
  GitBranch,
  Brain,
} from 'lucide-react';
import type { AgentConfig, AnalysisCategory, RiskPermission, CognitiveLoadScore, SimplicityScore, InstructionConstraintRatio } from '@/lib/types';
import {
  runDeterministicAnalysis,
  runStructuralAnalysis,
  runRiskAnalysis,
  analyzeGraphConflictsAI,
  analyzeGraphConflictsIncremental,
  generateConflictFixes,
  applyFixToAgent,
  type AIConflictIssue,
  type ConflictFix,
  type DeterministicResult,
} from '@/lib/ai/ai-conflict-analyzer';
import { RISK_CATEGORY_LABELS } from '@/lib/capability-analyzer';

// ── Elapsed timer for streaming feedback ─────────────────────────────────────

function ElapsedTimer({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    startRef.current = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, [running]);

  if (!running || elapsed < 500) return null;
  const secs = (elapsed / 1000).toFixed(1);
  return <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{secs}s</span>;
}

// ── Analysis cache ──────────────────────────────────────────────────────────

export const ANALYSIS_CACHE_KEY = 'Verto_analysisCache';

interface AnalysisCache {
  agentFingerprint: string;
  deterministic: DeterministicResult;
  aiIssues?: AIConflictIssue[];
  llmRiskPermissions?: RiskPermission[];
  llmRiskIssues?: AIConflictIssue[];
  /** Per-node fingerprints for granular invalidation */
  nodeFingerprints?: Record<string, string>;
}

/** Fingerprint a single node (label + description + snippet content) */
function nodeFingerprint(n: { id: string; label: string; type: string; description?: string; config?: Record<string, any> }): string {
  const snippet = n.config?.logicSnippet ?? n.config?.logic_snippet ?? '';
  return `${n.id}:${n.type}:${n.label}:${n.description ?? ''}:${snippet}`;
}

/** Fast fingerprint based on node/connection count + IDs + content */
export function agentFingerprint(agent: AgentConfig): string {
  const nodeIds = agent.nodes.map(n => n.id).sort().join(',');
  const connIds = agent.connections.map(c => c.id).sort().join(',');
  const promptLen = (agent.originalPrompt ?? '').length;
  const contentHash = agent.nodes.map(n => nodeFingerprint(n)).sort().join('|');
  return `${agent.id}|${agent.nodes.length}|${agent.connections.length}|${promptLen}|${nodeIds}|${connIds}|${contentHash}`;
}

/** Get set of node IDs that changed since last cache */
export function getChangedNodeIds(agent: AgentConfig, cached: AnalysisCache): Set<string> {
  const changed = new Set<string>();
  if (!cached.nodeFingerprints) return new Set(agent.nodes.map(n => n.id)); // No per-node data, everything changed
  const currentFps = new Map(agent.nodes.map(n => [n.id, nodeFingerprint(n)]));
  // Check modified/new nodes
  for (const [id, fp] of currentFps) {
    if (cached.nodeFingerprints[id] !== fp) changed.add(id);
  }
  // Check deleted nodes (their issues should be removed)
  for (const id of Object.keys(cached.nodeFingerprints)) {
    if (!currentFps.has(id)) changed.add(id);
  }
  return changed;
}

/** Get neighbor node IDs (1-hop connected) */
function getNeighborIds(nodeId: string, connections: { source: string; target: string }[]): Set<string> {
  const neighbors = new Set<string>();
  for (const c of connections) {
    if (c.source === nodeId) neighbors.add(c.target);
    if (c.target === nodeId) neighbors.add(c.source);
  }
  return neighbors;
}

/** Filter AI issues: keep issues for unchanged nodes, discard issues for changed nodes + neighbors */
export function filterCachedAiIssues(
  cachedIssues: AIConflictIssue[],
  changedNodeIds: Set<string>,
  connections: { source: string; target: string }[],
): AIConflictIssue[] {
  // Expand changed set to include neighbors (issues referencing neighbors may be stale)
  const invalidatedIds = new Set(changedNodeIds);
  for (const id of changedNodeIds) {
    for (const neighbor of getNeighborIds(id, connections)) {
      invalidatedIds.add(neighbor);
    }
  }
  return cachedIssues.filter(issue => {
    if (issue.nodeIds.length === 0) return false; // Global issues — re-run needed
    return !issue.nodeIds.some(id => invalidatedIds.has(id));
  });
}

export function loadCache(agent: AgentConfig): AnalysisCache | null {
  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_KEY);
    if (!raw) return null;
    const cache: AnalysisCache = JSON.parse(raw);
    if (cache.agentFingerprint === agentFingerprint(agent)) return cache;
    return null;
  } catch { return null; }
}

/** Load cache even if fingerprint doesn't match (for partial reuse) */
export function loadStaleCache(agent: AgentConfig): AnalysisCache | null {
  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_KEY);
    if (!raw) return null;
    const cache: AnalysisCache = JSON.parse(raw);
    // Must be same agent ID at minimum
    if (!cache.agentFingerprint.startsWith(agent.id + '|')) return null;
    return cache;
  } catch { return null; }
}

export function saveCache(
  agent: AgentConfig,
  det: DeterministicResult,
  aiIssues?: AIConflictIssue[],
  llmRiskPermissions?: RiskPermission[],
  llmRiskIssues?: AIConflictIssue[],
) {
  try {
    const nodeFps: Record<string, string> = {};
    for (const n of agent.nodes) {
      nodeFps[n.id] = nodeFingerprint(n);
    }
    const cache: AnalysisCache = {
      agentFingerprint: agentFingerprint(agent),
      deterministic: det,
      aiIssues,
      llmRiskPermissions,
      llmRiskIssues,
      nodeFingerprints: nodeFps,
    };
    localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota exceeded — silently skip */ }
}

// ── Shared constants ────────────────────────────────────────────────────────

export const SEVERITY_CONFIG = {
  critical: {
    Icon: AlertCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/20',
    badgeClass: 'bg-destructive/10 text-destructive border-destructive/30',
  },
  warning: {
    Icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/20',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300/30',
  },
  info: {
    Icon: Info,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 border-blue-500/20',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-300/30',
  },
} as const;

export const TAB_CONFIG: Record<AnalysisCategory, { label: string; Icon: typeof AlertTriangle }> = {
  'prompt-quality': { label: 'Prompt Quality', Icon: FileText },
  'safety': { label: 'Safety & Permissions', Icon: Shield },
  'graph-structure': { label: 'Structure', Icon: GitBranch },
};

const LOAD_COLORS = {
  green: 'bg-green-500',
  yellow: 'bg-amber-500',
  red: 'bg-destructive',
} as const;

// ── AnalyzerPanelContent — the shared core UI ───────────────────────────────

export interface AnalyzerPanelContentProps {
  /** Whether the panel is "active" — deterministic analysis runs when this becomes true */
  active: boolean;
  agent: AgentConfig | null;
  apiKey?: string;
  onNodeHighlight?: (nodeId: string | null) => void;
  /** Called to select a node AND switch panel to properties view (shows source text highlight) */
  onShowNodeSource?: (nodeId: string) => void;
  onIssuesChange?: (issues: AIConflictIssue[]) => void;
  onApplyFix?: (updatedAgent: AgentConfig) => void;
  focusNodeId?: string | null;
  /** compact=true reduces padding for sidebar use */
  compact?: boolean;
}

export function AnalyzerPanelContent({
  active,
  agent,
  apiKey,
  onNodeHighlight,
  onShowNodeSource,
  onIssuesChange,
  onApplyFix,
  focusNodeId,
  compact = false,
}: AnalyzerPanelContentProps) {
  // Deterministic results (instant)
  const [detIssues, setDetIssues] = useState<AIConflictIssue[]>([]);
  const [riskPermissions, setRiskPermissions] = useState<RiskPermission[]>([]);
  const [cognitiveLoad, setCognitiveLoad] = useState<CognitiveLoadScore | null>(null);
  const [simplicityScore, setSimplicityScore] = useState<SimplicityScore | null>(null);
  const [instructionConstraintRatio, setInstructionConstraintRatio] = useState<InstructionConstraintRatio | null>(null);
  const [detRan, setDetRan] = useState(false);
  const lastAnalyzedFingerprintRef = useRef<string | null>(null);
  const skipFingerprintRef = useRef<string | null>(null);

  // LLM risk results (async)
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskRan, setRiskRan] = useState(false);
  const [riskIssues, setRiskIssues] = useState<AIConflictIssue[]>([]);

  // AI results (async)
  const [aiIssues, setAiIssues] = useState<AIConflictIssue[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRan, setAiRan] = useState(false);

  // Fix state
  const [fixingIssueId, setFixingIssueId] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<AnalysisCategory>('prompt-quality');

  // Severity filter state
  const [hiddenSeverities, setHiddenSeverities] = useState<Set<'critical' | 'warning' | 'info'>>(new Set());

  const allIssues = useMemo(() => [...detIssues, ...riskIssues, ...aiIssues], [detIssues, riskIssues, aiIssues]);

  const issuesByTab = useMemo(() => {
    const map: Record<AnalysisCategory, AIConflictIssue[]> = {
      'prompt-quality': [],
      'safety': [],
      'graph-structure': [],
    };
    for (const issue of allIssues) {
      const cat = issue.category ?? 'graph-structure';
      if (map[cat]) map[cat].push(issue);
    }
    return map;
  }, [allIssues]);

  const applyDeterministic = useCallback((result: DeterministicResult) => {
    setDetIssues(result.issues);
    setRiskPermissions(result.riskPermissions);
    setCognitiveLoad(result.cognitiveLoadScore);
    if (result.simplicityScore) setSimplicityScore(result.simplicityScore);
    if (result.instructionConstraintRatio) setInstructionConstraintRatio(result.instructionConstraintRatio);
    setDetRan(true);
    onIssuesChange?.(result.issues);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run structural analysis instantly + LLM risk async when panel becomes active or agent changes
  useEffect(() => {
    if (active && agent) {
      const fp = agentFingerprint(agent);
      if (skipFingerprintRef.current === fp) {
        skipFingerprintRef.current = null;
        lastAnalyzedFingerprintRef.current = fp;
        return;
      }
      if (!detRan || lastAnalyzedFingerprintRef.current !== fp) {
        lastAnalyzedFingerprintRef.current = fp;
        const cached = loadCache(agent);
        if (cached) {
          applyDeterministic(cached.deterministic);
          if (cached.llmRiskPermissions && cached.llmRiskIssues) {
            setRiskPermissions(cached.llmRiskPermissions);
            setRiskIssues(cached.llmRiskIssues);
            setRiskRan(true);
          }
          if (cached.aiIssues) {
            setAiIssues(cached.aiIssues);
            setAiRan(true);
            onIssuesChange?.([...cached.deterministic.issues, ...(cached.llmRiskIssues ?? []), ...cached.aiIssues]);
          } else {
            setAiIssues([]);
            setAiRan(false);
          }
        } else {
          // Instant structural checks (no risk — those go async)
          const structural = runStructuralAnalysis(agent);
          const detResult: DeterministicResult = {
            issues: structural.issues,
            riskPermissions: [],
            cognitiveLoadScore: structural.cognitiveLoadScore,
            simplicityScore: structural.simplicityScore,
            instructionConstraintRatio: structural.instructionConstraintRatio,
          };
          applyDeterministic(detResult);
          saveCache(agent, detResult);

          // Try to salvage AI issues from stale cache for unchanged nodes
          const stale = loadStaleCache(agent);
          if (stale?.aiIssues && stale.aiIssues.length > 0) {
            const changedIds = getChangedNodeIds(agent, stale);
            const reusable = filterCachedAiIssues(stale.aiIssues, changedIds, agent.connections);
            if (reusable.length > 0) {
              setAiIssues(reusable);
              setAiRan(true); // Partial — user can re-run for full
            } else {
              setAiIssues([]);
              setAiRan(false);
            }
          } else {
            setAiIssues([]);
            setAiRan(false);
          }

          setRiskIssues([]);
          setRiskRan(false);

          // Async LLM risk detection
          if (apiKey) {
            setRiskLoading(true);
            runRiskAnalysis(agent, apiKey)
              .then(({ riskPermissions: perms, issues: rIssues }) => {
                setRiskPermissions(perms);
                setRiskIssues(rIssues);
                setRiskRan(true);
                saveCache(agent, {
                  issues: structural.issues,
                  riskPermissions: perms,
                  cognitiveLoadScore: structural.cognitiveLoadScore,
                  simplicityScore: structural.simplicityScore,
                  instructionConstraintRatio: structural.instructionConstraintRatio,
                }, undefined, perms, rIssues);
                onIssuesChange?.([...structural.issues, ...rIssues]);
              })
              .catch(() => { /* LLM risk failed silently — keyword fallback already ran */ })
              .finally(() => setRiskLoading(false));
          }
        }
        setError(null);
      }
    }
    // Don't reset state on deactivation — keep results in memory so
    // re-opening the panel is instant. Cache + fingerprint handle staleness.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, agent]);

  const runAIAnalysis = async () => {
    if (!agent) return;
    if (!apiKey) {
      setError('No API key configured. Open Settings and add your Gemini API key.');
      return;
    }
    setAiLoading(true);
    setError(null);
    try {
      // Try incremental analysis: only re-analyze changed nodes
      const stale = loadStaleCache(agent);
      let results: AIConflictIssue[];

      if (stale?.aiIssues && stale.aiIssues.length > 0 && stale.nodeFingerprints) {
        const changedIds = getChangedNodeIds(agent, stale);
        if (changedIds.size > 0 && changedIds.size < agent.nodes.length * 0.8) {
          // Incremental: analyze only changed subgraph, merge with cached
          const cachedValid = filterCachedAiIssues(stale.aiIssues, changedIds, agent.connections);
          const freshIssues = await analyzeGraphConflictsIncremental(agent, apiKey, changedIds);
          results = [...cachedValid, ...freshIssues];
        } else {
          // Too many changes or no changes — full analysis
          results = await analyzeGraphConflictsAI(agent, apiKey);
        }
      } else {
        // No stale cache — full analysis
        results = await analyzeGraphConflictsAI(agent, apiKey);
      }

      setAiIssues(results);
      setAiRan(true);
      onIssuesChange?.([...detIssues, ...riskIssues, ...results]);
      const detResult: DeterministicResult = {
        issues: detIssues,
        riskPermissions,
        cognitiveLoadScore: cognitiveLoad!,
        simplicityScore: simplicityScore ?? { score: 100, level: 'green', avgSentenceLength: 0, fillerPhraseCount: 0, actionVerbCount: 0, redundancyCount: 0 },
        instructionConstraintRatio: instructionConstraintRatio ?? { score: 100, instructionCount: 0, constraintCount: 0, level: 'green' },
      };
      saveCache(agent, detResult, results, riskPermissions, riskIssues);
    } catch (err: any) {
      setError(err?.message || 'AI analysis failed. Check your API key and try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const applyFix = async (targetIssues: AIConflictIssue[]) => {
    if (!agent || !apiKey || targetIssues.length === 0) return;
    const isAll = targetIssues.length > 1;
    if (isAll) setFixingAll(true);
    else setFixingIssueId(targetIssues[0].id);
    setError(null);
    try {
      let reconstructedPrompt: string | undefined;
      try {
        const { reSyncGraphToPrompt } = await import('@/lib/graph/graph-to-prompt');
        const result = await reSyncGraphToPrompt(agent);
        reconstructedPrompt = result.reconstructedPrompt;
      } catch { /* fall back to originalPrompt if reconstruction fails */ }
      const fixes = await generateConflictFixes(agent, targetIssues, apiKey, reconstructedPrompt);
      const fixedIds = new Set<string>();
      let updated = agent;
      let changed = false;
      for (const fix of fixes) {
        const hasChanges =
          fix.updateNodes.length > 0 || fix.updateEdges.length > 0 ||
          fix.addNodes.length > 0 || fix.addEdges.length > 0 ||
          fix.removeNodeIds.length > 0 || fix.removeEdgeIds.length > 0 ||
          (fix.promptReplacements && fix.promptReplacements.length > 0);
        if (hasChanges) {
          updated = applyFixToAgent(updated, fix);
          changed = true;
        }
        if (fix.issueId) fixedIds.add(fix.issueId);
      }
      for (const issue of targetIssues) fixedIds.add(issue.id);
      if (changed) {
        try { localStorage.removeItem(ANALYSIS_CACHE_KEY); } catch { /* ignore */ }
        skipFingerprintRef.current = agentFingerprint(updated);
        onApplyFix?.(updated);
      }
      const remainingDet = detIssues.filter(i => !fixedIds.has(i.id));
      const remainingAi = aiIssues.filter(i => !fixedIds.has(i.id));
      setDetIssues(remainingDet);
      setAiIssues(remainingAi);
      onIssuesChange?.([...remainingDet, ...remainingAi]);
      if (!changed && fixes.length > 0) {
        setError('These issues require manual prompt editing — no automatic graph changes available.');
      } else if (fixes.length === 0) {
        setError('AI could not generate fixes for these issues. Try fixing them manually.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to apply fix');
    } finally {
      setFixingIssueId(null);
      setFixingAll(false);
    }
  };

  const issueRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!focusNodeId || allIssues.length === 0) return;
    const firstAffected = allIssues.find(i => i.nodeIds?.includes(focusNodeId));
    if (firstAffected) {
      setActiveTab(firstAffected.category ?? 'graph-structure');
      setTimeout(() => {
        issueRefs.current[firstAffected.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [focusNodeId, allIssues]);

  // Auto-run AI when a focusNodeId is set
  useEffect(() => {
    if (active && focusNodeId && !aiRan && !aiLoading) {
      runAIAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, focusNodeId]);

  const currentTabIssues = issuesByTab[activeTab] ?? [];
  const filteredTabIssues = currentTabIssues.filter(i => !hiddenSeverities.has(i.severity));
  const px = compact ? 'px-3' : 'px-6';

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const issue of currentTabIssues) {
      counts[issue.severity]++;
    }
    return counts;
  }, [currentTabIssues]);

  const toggleSeverity = (sev: 'critical' | 'warning' | 'info') => {
    setHiddenSeverities(prev => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  function renderIssueList(issues: AIConflictIssue[]) {
    if (issues.length === 0) return null;
    return issues.map((issue) => {
      const cfg = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.info;
      const { Icon } = cfg;
      const isFocused = focusNodeId != null && issue.nodeIds?.includes(focusNodeId);
      return (
        <div
          key={issue.id}
          ref={(el) => { issueRefs.current[issue.id] = el; }}
          className={`rounded-lg border p-3 space-y-2.5 transition-all ${cfg.bg} ${isFocused ? 'ring-2 ring-primary ring-offset-1' : ''}`}
        >
          <div className="flex items-start gap-2">
            <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold leading-tight">{issue.title}</span>
                <Badge className={`text-[10px] border ${cfg.badgeClass}`}>{issue.severity}</Badge>
                <Badge variant="outline" className="text-[10px]">{issue.type.replace(/_/g, ' ')}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{issue.description}</p>
            </div>
          </div>

          {issue.quotedPhrase && (
            <div className="ml-6 px-2 py-1 rounded bg-muted/50 border border-border">
              <code className="text-[11px] text-foreground">&quot;{issue.quotedPhrase}&quot;</code>
            </div>
          )}

          {issue.conflictPair && (
            <div className="ml-6 flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-destructive">{issue.conflictPair[0]}</span>
              <span className="text-muted-foreground">vs</span>
              <span className="px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-destructive">{issue.conflictPair[1]}</span>
            </div>
          )}

          <Separator className="opacity-20" />

          <div className="pl-6 space-y-1.5">
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide">Suggestion</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{issue.suggestion}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Button
                size="sm" variant="outline" className="h-6 text-[10px] gap-1 opacity-50 cursor-not-allowed"
                disabled
                title="Coming soon"
              >
                <Wrench className="h-3 w-3" />
                Apply Fix
              </Button>
              {issue.conflictPair && issue.nodeIds.length === 2 && (
                <>
                  <span className="text-[10px] text-muted-foreground">or keep:</span>
                  {issue.conflictPair.map((label, idx) => (
                    <Button
                      key={idx} size="sm" variant="ghost" className="h-6 text-[10px] gap-1 opacity-50 cursor-not-allowed"
                      disabled
                      title="Coming soon"
                    >
                      Keep &quot;{label.length > 15 ? label.slice(0, 15) + '…' : label}&quot;
                    </Button>
                  ))}
                </>
              )}
            </div>
          </div>

          {issue.nodeIds && issue.nodeIds.length > 0 && (
            <div className="pl-6 flex flex-wrap gap-1">
              <span className="text-[10px] text-muted-foreground mr-1">Nodes:</span>
              {issue.nodeIds.map((nodeId) => {
                const nodeLabel = agent?.nodes.find(n => n.id === nodeId)?.label;
                const isActive = nodeId === focusNodeId;
                return (
                  <button
                    key={nodeId}
                    onClick={() => onNodeHighlight?.(nodeId)}
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${isActive ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border hover:bg-accent hover:border-primary/50'}`}
                    title={nodeLabel}
                  >
                    {nodeId}
                    {nodeLabel && <span className="text-muted-foreground ml-1 font-sans">{nodeLabel.length > 20 ? nodeLabel.slice(0, 20) + '…' : nodeLabel}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Action bar */}
      <div className={`flex-shrink-0 ${px} py-3 border-b border-border space-y-2`}>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={runAIAnalysis} disabled={aiLoading || !agent} size="sm" className="gap-1.5 h-7 text-xs">
            {aiLoading ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analyzing…</>
            ) : aiRan ? (
              <><RotateCcw className="h-3.5 w-3.5" />Re-run</>
            ) : (
              <><Play className="h-3.5 w-3.5" />Deep Analysis</>
            )}
          </Button>

          {allIssues.length > 0 && (
            <Button
              size="sm" variant="outline" className="h-7 text-[11px] gap-1.5 opacity-50 cursor-not-allowed"
              disabled
              title="Coming soon"
            >
              <Sparkles className="h-3 w-3" />
              Fix All in Tab
            </Button>
          )}

          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            {allIssues.length === 0 && detRan && (
              <Badge className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 border border-green-300/30">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {aiRan ? 'All clear' : 'No instant issues'}
              </Badge>
            )}
            {allIssues.filter(i => i.severity === 'critical').length > 0 && (
              <Badge className="text-[10px] bg-destructive/10 text-destructive border border-destructive/30">
                {allIssues.filter(i => i.severity === 'critical').length} critical
              </Badge>
            )}
            {allIssues.filter(i => i.severity === 'warning').length > 0 && (
              <Badge className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-300/30">
                {allIssues.filter(i => i.severity === 'warning').length} warnings
              </Badge>
            )}
            {allIssues.filter(i => i.severity === 'info').length > 0 && (
              <Badge className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-300/30">
                {allIssues.filter(i => i.severity === 'info').length} info
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs + scrollable content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnalysisCategory)} className="flex-1 min-h-0 flex flex-col">
        <TabsList className={`w-full justify-start rounded-none border-b border-border bg-transparent ${px} pt-1 h-auto flex-shrink-0`}>
          {(Object.entries(TAB_CONFIG) as [AnalysisCategory, typeof TAB_CONFIG[AnalysisCategory]][]).map(([key, cfg]) => {
            const count = (issuesByTab[key] ?? []).length;
            return (
              <TabsTrigger key={key} value={key} className="gap-1 text-[11px] px-2 py-1.5 rounded-md data-[state=active]:shadow-none">
                <cfg.Icon className="h-3 w-3" />
                {cfg.label}
                {count > 0 && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 ml-0.5">{count}</Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Severity filter chips */}
        {currentTabIssues.length > 0 && (
          <div className={`flex items-center gap-1.5 ${px} py-1.5 border-b border-border flex-shrink-0`}>
            <span className="text-[10px] text-muted-foreground mr-1">Filter:</span>
            {(['critical', 'warning', 'info'] as const).map(sev => {
              const count = severityCounts[sev];
              if (count === 0) return null;
              const isHidden = hiddenSeverities.has(sev);
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <button
                  key={sev}
                  onClick={() => toggleSeverity(sev)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                    isHidden ? 'opacity-40 bg-muted border-border text-muted-foreground line-through' : cfg.badgeClass
                  }`}
                >
                  {sev} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div className={`flex-1 min-h-0 overflow-y-auto ${px} py-3 space-y-3`}>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <TabsContent value="prompt-quality" className="mt-0 space-y-3">
            {cognitiveLoad && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium">Cognitive Load</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{cognitiveLoad.ruleCount} rules, {cognitiveLoad.conditionDepth} depth</span>
                    <Badge className={`text-[10px] ${
                      cognitiveLoad.level === 'red' ? 'bg-destructive/10 text-destructive border-destructive/30'
                      : cognitiveLoad.level === 'yellow' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300/30'
                      : 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-300/30'
                    } border`}>
                      {cognitiveLoad.score}/100
                    </Badge>
                  </div>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all ${LOAD_COLORS[cognitiveLoad.level]}`} style={{ width: `${cognitiveLoad.score}%` }} />
                </div>
              </div>
            )}
            {simplicityScore && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium">Simplicity</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">avg {simplicityScore.avgSentenceLength}w/sentence</span>
                    <Badge className={`text-[10px] ${
                      simplicityScore.level === 'red' ? 'bg-destructive/10 text-destructive border-destructive/30'
                      : simplicityScore.level === 'yellow' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300/30'
                      : 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-300/30'
                    } border`}>
                      {simplicityScore.score}/100
                    </Badge>
                  </div>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all ${LOAD_COLORS[simplicityScore.level]}`} style={{ width: `${simplicityScore.score}%` }} />
                </div>
              </div>
            )}
            {instructionConstraintRatio && (instructionConstraintRatio.instructionCount + instructionConstraintRatio.constraintCount) > 0 && (
              <div className="rounded-lg border p-3 space-y-1.5 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium">Instructions vs. Constraints</span>
                  </div>
                  <Badge className={`text-[10px] ${
                    instructionConstraintRatio.level === 'red' ? 'bg-destructive/10 text-destructive border-destructive/30'
                    : instructionConstraintRatio.level === 'yellow' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300/30'
                    : 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-300/30'
                  } border`}>
                    {instructionConstraintRatio.score}% instructions
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="text-green-600 dark:text-green-400 font-medium">{instructionConstraintRatio.instructionCount} instructions</span>
                  <span>/</span>
                  <span className="text-destructive font-medium">{instructionConstraintRatio.constraintCount} constraints</span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all ${LOAD_COLORS[instructionConstraintRatio.level]}`} style={{ width: `${instructionConstraintRatio.score}%` }} />
                </div>
              </div>
            )}
            {aiLoading && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/20">
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                <span className="text-[11px] text-blue-600 dark:text-blue-400">Running AI analysis for ambiguity, hidden context, and semantic conflicts…</span>
                <ElapsedTimer running={aiLoading} />
              </div>
            )}
            {!aiRan && !aiLoading && detRan && issuesByTab['prompt-quality'].length === 0 && (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">No deterministic issues found. Click &quot;Deep Analysis&quot; to check for ambiguous language, hidden context, and semantic conflicts.</p>
              </div>
            )}
            {renderIssueList(filteredTabIssues.filter(i => i.category === 'prompt-quality'))}
          </TabsContent>

          <TabsContent value="safety" className="mt-0 space-y-3">
            {riskLoading && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/20">
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                <span className="text-[11px] text-blue-600 dark:text-blue-400">Analyzing permissions…</span>
                <ElapsedTimer running={riskLoading} />
              </div>
            )}
            {riskPermissions.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2.5 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium">Actions &amp; Permissions</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{riskPermissions.length} actions</Badge>
                </div>
                <div className="space-y-1">
                  {riskPermissions.map(p => {
                    const dotColor = p.riskLevel === 'high' ? 'bg-destructive'
                      : p.riskLevel === 'medium' ? 'bg-amber-500'
                      : 'bg-blue-500';
                    const guardLabel = p.guardBypassed
                      ? 'Guard bypassed'
                      : p.hasGuard ? 'Guarded' : 'Unguarded';
                    const guardColor = p.guardBypassed
                      ? 'text-destructive'
                      : p.hasGuard ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400';
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          onNodeHighlight?.(p.nodeId);
                          // If guarded, switch to properties view and select the guard node to show its source text
                          if (p.hasGuard && p.guardNodeId) onShowNodeSource?.(p.guardNodeId);
                        }}
                        className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                      >
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`} />
                        <span className="text-[11px] font-medium flex-1 min-w-0 truncate">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{RISK_CATEGORY_LABELS[p.category]}</span>
                        <span className={`text-[10px] flex-shrink-0 ${guardColor}`}>{guardLabel}</span>
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const unguardedHigh = riskPermissions.filter(p => p.riskLevel === 'high' && !p.hasGuard).length;
                  const bypassed = riskPermissions.filter(p => p.guardBypassed).length;
                  if (unguardedHigh === 0 && bypassed === 0) return null;
                  return (
                    <div className="text-[10px] text-destructive pt-1 border-t border-border/50">
                      {unguardedHigh > 0 && <span>{unguardedHigh} unguarded high-risk action{unguardedHigh > 1 ? 's' : ''}</span>}
                      {unguardedHigh > 0 && bypassed > 0 && <span> · </span>}
                      {bypassed > 0 && <span>{bypassed} guard bypass{bypassed > 1 ? 'es' : ''} detected</span>}
                    </div>
                  );
                })()}
                {riskPermissions.some(p => p.reason) && (
                  <div className="space-y-1 pt-1 border-t border-border/50">
                    {riskPermissions.filter(p => p.reason).map(p => (
                      <div key={p.id} className="text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground">{p.name}:</span> {p.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {riskPermissions.length === 0 && detRan && !riskLoading && !apiKey && (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">Add your Gemini API key in Settings to enable LLM-powered risk analysis.</p>
              </div>
            )}
            {riskPermissions.length === 0 && detRan && !riskLoading && apiKey && (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground">No risky actions detected in this agent.</p>
              </div>
            )}
            {renderIssueList(filteredTabIssues.filter(i => i.category === 'safety'))}
          </TabsContent>

          <TabsContent value="graph-structure" className="mt-0 space-y-3">
            {aiLoading && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/20">
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                <span className="text-[11px] text-blue-600 dark:text-blue-400">Running AI analysis for numerical ranges and semantic contradictions…</span>
                <ElapsedTimer running={aiLoading} />
              </div>
            )}
            {issuesByTab['graph-structure'].length === 0 && detRan && !aiLoading && (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-500 opacity-60" />
                <p className="text-xs text-muted-foreground">No structural issues found.</p>
              </div>
            )}
            {renderIssueList(filteredTabIssues.filter(i => i.category === 'graph-structure'))}
          </TabsContent>

          {!detRan && !aiLoading && !error && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
              <Brain className="h-12 w-12 opacity-15" />
              <p className="text-sm">Preparing analysis…</p>
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}

// ── AIConflictDialog — thin dialog wrapper around AnalyzerPanelContent ──────

interface AIConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentConfig | null;
  apiKey?: string;
  onNodeHighlight?: (nodeId: string | null) => void;
  onIssuesChange?: (issues: AIConflictIssue[]) => void;
  onApplyFix?: (updatedAgent: AgentConfig) => void;
  focusNodeId?: string | null;
}

export function AIConflictDialog({
  open,
  onOpenChange,
  agent,
  apiKey,
  onNodeHighlight,
  onIssuesChange,
  onApplyFix,
  focusNodeId,
}: AIConflictDialogProps) {
  const handleClose = (v: boolean) => {
    onOpenChange(v);
    if (!v) onNodeHighlight?.(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col gap-0 overflow-hidden p-0">
        <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Brain className="h-5 w-5 text-amber-500" />
              AI Conflict Analyzer
            </DialogTitle>
            <DialogDescription className="text-xs">
              Analyzes prompt quality, safety risks, and graph structure.
              Deterministic checks run instantly — click "Deep Analysis" for AI-powered semantic analysis.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <AnalyzerPanelContent
            active={open}
            agent={agent}
            apiKey={apiKey}
            onNodeHighlight={onNodeHighlight}
            onIssuesChange={onIssuesChange}
            onApplyFix={onApplyFix}
            focusNodeId={focusNodeId}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
