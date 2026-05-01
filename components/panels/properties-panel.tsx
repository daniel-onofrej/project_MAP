'use client';

import { useState, useEffect, useMemo } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Separator } from '../ui/separator';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Settings, AlertCircle, CheckCircle2, AlertTriangle, Info, Sparkles, Activity, FileText, Pencil, Brain, Shield } from 'lucide-react';
import type { NodeData, NodeType, ConflictRule, AgentConfig } from '@/lib/types';
import { NODE_ICONS } from '@/lib/types';
import { calculateComplexity } from '@/lib/complexity-metrics';
import { ComplexityMetricsPanel } from './complexity-metrics-panel';
import { AnalyzerPanelContent } from '../dialogs/ai-conflict-dialog';
import { detectRiskPermissions, RISK_CATEGORY_LABELS, RISK_CATEGORY_ICONS } from '@/lib/capability-analyzer';
import type { RiskCategory } from '@/lib/types';

interface PropertiesPanelProps {
  agent?: AgentConfig;
  selectedNode?: NodeData;
  onUpdateNode: (node: NodeData) => void;
  onUpdateAgent?: (agent: AgentConfig) => void;
  conflicts: ConflictRule[];
  onNodeHover?: (nodeId: string | null) => void;
  onNodeSelect?: (nodeId: string) => void;
  onAnalyzeCapabilities?: () => void;
  apiKey?: string;
  onApplyFix?: (updatedAgent: AgentConfig) => void;
}

export function PropertiesPanel({
  agent,
  selectedNode,
  onUpdateNode,
  onUpdateAgent,
  conflicts,
  onNodeHover,
  onNodeSelect,
  onAnalyzeCapabilities,
  apiKey,
  onApplyFix,
}: PropertiesPanelProps) {
  const [panelView, setPanelView] = useState<'properties' | 'analyzer'>('properties');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [nodeType, setNodeType] = useState<NodeType>('AGENT');
  const [isDangerous, setIsDangerous] = useState(false);
  const [dangerReason, setDangerReason] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [editableSnippet, setEditableSnippet] = useState('');
  const [capFilter, setCapFilter] = useState<string>('all');
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const CATEGORY_COLORS: Record<string, string> = {
    'api-integration':  'text-blue-400',
    'data-storage':     'text-cyan-400',
    'logging-audit':    'text-teal-400',
    'communication':    'text-indigo-400',
    'financial':        'text-amber-400',
    'system-infra':     'text-red-400',
    'auth-permissions': 'text-purple-400',
    'ai-llm':           'text-orange-400',
  };

  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.label);
      setDescription(selectedNode.description || '');
      setNodeType(selectedNode.type);
      setIsDangerous(selectedNode.isDangerous || false);
      setDangerReason(selectedNode.dangerReason || '');
      setEditableSnippet((selectedNode.config?.logicSnippet as string) || '');
    }
  }, [selectedNode]);

  useEffect(() => {
    if (agent) {
      setAgentName(agent.name);
      setAgentDescription(agent.description || '');
    }
  }, [agent]);

  const handleSave = () => {
    if (selectedNode) {
      onUpdateNode({
        ...selectedNode,
        label,
        description,
        type: nodeType,
        isDangerous,
        dangerReason: isDangerous ? dangerReason : undefined,
      });
    }
  };

  // Find what changed between old and new snippet, apply the same diff to a target string.
  // Returns null if the changed fragment isn't found in the target.
  const applySnippetDiff = (oldSnippet: string, newSnippet: string, target: string): string | null => {
    if (!oldSnippet || oldSnippet === newSnippet) return target;
    let prefixLen = 0;
    const minLen = Math.min(oldSnippet.length, newSnippet.length);
    while (prefixLen < minLen && oldSnippet[prefixLen] === newSnippet[prefixLen]) prefixLen++;
    let suffixLen = 0;
    while (
      suffixLen < oldSnippet.length - prefixLen &&
      suffixLen < newSnippet.length - prefixLen &&
      oldSnippet[oldSnippet.length - 1 - suffixLen] === newSnippet[newSnippet.length - 1 - suffixLen]
    ) suffixLen++;
    const oldFrag = oldSnippet.slice(prefixLen, suffixLen > 0 ? -suffixLen : undefined);
    const newFrag = newSnippet.slice(prefixLen, suffixLen > 0 ? -suffixLen : undefined);
    if (!oldFrag || !target.includes(oldFrag)) return null;
    return target.replace(oldFrag, newFrag);
  };

  const handleRewriteNode = () => {
    if (!selectedNode || !editableSnippet.trim()) return;
    const oldSnippet = (selectedNode.config?.logicSnippet as string) || '';

    // Apply the same textual diff to label and description
    const newLabel = applySnippetDiff(oldSnippet, editableSnippet, selectedNode.label) ?? selectedNode.label;
    const newDescription = applySnippetDiff(oldSnippet, editableSnippet, selectedNode.description || '') ?? editableSnippet;

    const updatedNode: typeof selectedNode = {
      ...selectedNode,
      label: newLabel,
      description: newDescription,
      config: { ...selectedNode.config, logicSnippet: editableSnippet },
    };

    if (agent && onUpdateAgent) {
      // Combine node update + originalPrompt update in one call to avoid stale overwrites
      const updatedNodes = agent.nodes.map(n => n.id === updatedNode.id ? updatedNode : n);

      // Find numeric values that changed in the snippet (e.g. 30 → 40)
      const oldNums = [...oldSnippet.matchAll(/\d+/g)].map(m => m[0]);
      const newNums = [...editableSnippet.matchAll(/\d+/g)].map(m => m[0]);
      const numericChanges: [string, string][] = [];
      for (let i = 0; i < Math.min(oldNums.length, newNums.length); i++) {
        if (oldNums[i] !== newNums[i]) numericChanges.push([oldNums[i], newNums[i]]);
      }

      // Update conditions on edges connected to this node
      const updatedConnections = agent.connections.map(conn => {
        const isConnected = conn.source === selectedNode.id || conn.target === selectedNode.id;
        if (!isConnected || !conn.condition || numericChanges.length === 0) return conn;
        let newCondition = conn.condition;
        for (const [from, to] of numericChanges) {
          newCondition = newCondition.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
        }
        return newCondition !== conn.condition ? { ...conn, condition: newCondition } : conn;
      });

      const basePrompt = agent.editedPrompt ?? agent.originalPrompt ?? '';
      const updatedPrompt = basePrompt && oldSnippet
        ? basePrompt.replace(oldSnippet, editableSnippet)
        : basePrompt;
      onUpdateAgent({
        ...agent,
        nodes: updatedNodes,
        connections: updatedConnections,
        originalPrompt: agent.originalPrompt,
        editedPrompt: updatedPrompt,
      });
    } else {
      onUpdateNode(updatedNode);
    }
  };

  const handleSaveAgent = () => {
    if (agent && onUpdateAgent) {
      onUpdateAgent({
        ...agent,
        name: agentName,
        description: agentDescription,
      });
    }
  };

  const nodeConflicts = conflicts.filter(c =>
    c.nodeIds.includes(selectedNode?.id || '')
  );

  const riskPermissions = useMemo(() => agent ? detectRiskPermissions(agent) : [], [agent]);

  const metrics = useMemo(() => agent ? calculateComplexity(agent) : null, [agent]);

  const promptContext = useMemo(() => {
    const snippet = selectedNode?.config?.logicSnippet as string | undefined;
    const prompt = agent?.originalPrompt;
    if (!snippet || !prompt) return null;
    const idx = prompt.indexOf(snippet);
    if (idx === -1) return { before: '', match: snippet, after: '', hadTrimStart: false, hadTrimEnd: false };
    const contextChars = 180;
    const beforeStart = Math.max(0, idx - contextChars);
    const afterEnd = Math.min(prompt.length, idx + snippet.length + contextChars);
    return {
      before: prompt.slice(beforeStart, idx),
      match: snippet,
      after: prompt.slice(idx + snippet.length, afterEnd),
      hadTrimStart: beforeStart > 0,
      hadTrimEnd: afterEnd < prompt.length,
    };
  }, [selectedNode?.config?.logicSnippet, agent?.originalPrompt]);

  // Shared header with toggle strip — rendered for both node-selected and agent view
  const panelHeader = (
    <div className="flex-shrink-0 p-3 border-b border-sidebar-border space-y-2">
      {/* Toggle strip */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 border border-border">
        <button
          onClick={() => setPanelView('properties')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1 px-2 rounded-md transition-all ${panelView === 'properties'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <Settings className="h-3 w-3" />
          Properties
        </button>
        <button
          onClick={() => setPanelView('analyzer')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1 px-2 rounded-md transition-all ${panelView === 'analyzer'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <Brain className="h-3 w-3" />
          AI Analyzer
        </button>
      </div>
    </div>
  );

  if (!selectedNode) {
    return (
      <div className="flex flex-col h-full bg-sidebar border-l border-sidebar-border">
        {panelHeader}

        {/* Analyzer view */}
        {panelView === 'analyzer' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <AnalyzerPanelContent
              active={panelView === 'analyzer'}
              agent={agent ?? null}
              apiKey={apiKey}
              onNodeHighlight={onNodeHover}
              onShowNodeSource={(nodeId) => {
                onNodeSelect?.(nodeId);
                setPanelView('properties');
              }}
              onApplyFix={onApplyFix}
              compact
            />
          </div>
        )}

        {/* Properties view */}
        {panelView === 'properties' && (
          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div className="p-4 space-y-4">
              {agent && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="agent-name" className="text-xs">Agent Name</Label>
                    <Input
                      id="agent-name"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="Agent name"
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agent-description" className="text-xs">Description</Label>
                    <Textarea
                      id="agent-description"
                      value={agentDescription}
                      onChange={(e) => setAgentDescription(e.target.value)}
                      placeholder="Agent description"
                      className="min-h-[80px] text-xs resize-none"
                    />
                  </div>

                  <Button onClick={handleSaveAgent} className="w-full" size="sm">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                    Save Agent Properties
                  </Button>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5" />
                      Graph Complexity
                    </Label>
                    {metrics && (
                      <ComplexityMetricsPanel
                        agent={agent}
                        metrics={metrics}
                      />
                    )}
                  </div>

                  <Separator />

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold">Actions & Permissions</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{riskPermissions.length} actions</Badge>
                    </div>

                    {(() => {
                      if (riskPermissions.length === 0) {
                        return (
                          <div className="text-center py-4 bg-muted/30 rounded-lg border border-dashed border-border">
                            <p className="text-[10px] text-muted-foreground italic">No risky actions detected in this agent.</p>
                          </div>
                        );
                      }

                      const grouped = riskPermissions.reduce<Record<string, typeof riskPermissions>>((acc, p) => {
                        if (!acc[p.category]) acc[p.category] = [];
                        acc[p.category].push(p);
                        return acc;
                      }, {});

                      const categories = Object.keys(grouped) as RiskCategory[];

                      return (
                        <div className="space-y-1">
                          {categories.map(cat => {
                            const items = grouped[cat];
                            const isOpen = openCategories.has(cat);
                            const icon = RISK_CATEGORY_ICONS[cat] ?? '•';
                            const label = RISK_CATEGORY_LABELS[cat] ?? cat;
                            const color = CATEGORY_COLORS[cat] ?? 'text-muted-foreground';

                            return (
                              <div key={cat} className="border border-border/40 rounded-md overflow-hidden">
                                <button
                                  onClick={() => toggleCategory(cat)}
                                  className="w-full flex items-center gap-2 px-2.5 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                                >
                                  <span className="text-sm">{icon}</span>
                                  <span className={`text-xs font-medium flex-1 ${color}`}>{label}</span>
                                  <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                                    {items.length}
                                  </span>
                                  <span className={`text-muted-foreground text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                                    ▾
                                  </span>
                                </button>

                                {isOpen && (
                                  <div className="divide-y divide-border/30">
                                    {items.map(p => {
                                      const dotColor = p.riskLevel === 'high' ? 'bg-destructive'
                                        : p.riskLevel === 'medium' ? 'bg-amber-500'
                                        : 'bg-green-500';
                                      const guardLabel = p.guardBypassed
                                        ? 'Bypassed'
                                        : p.hasGuard ? 'Guarded' : 'Unguarded';
                                      const guardColor = p.guardBypassed
                                        ? 'text-destructive'
                                        : p.hasGuard ? 'text-green-500' : 'text-muted-foreground';

                                      return (
                                        <button
                                          key={p.id}
                                          onClick={() => {
                                            onNodeHover?.(p.nodeId);
                                            onNodeSelect?.(p.nodeId);
                                          }}
                                          className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/20 transition-colors text-left"
                                        >
                                          <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                                          <span className="text-[11px] flex-1 truncate">{p.name}</span>
                                          <span className={`text-[10px] shrink-0 font-medium ${guardColor}`}>
                                            {guardLabel}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {(() => {
                    const pm = agent?.permissionsManifest;
                    const perNodeRisk = pm?.perNodeRisk;
                    const injectionVectors = pm?.injectionVectors ?? [];
                    const piiFlows = pm?.piiFlows ?? [];
                    const sideSummary = pm?.sideEffectSummary;
                    const auditNotes = pm?.auditNotes ?? [];
                    const hasAny =
                      (perNodeRisk && Object.keys(perNodeRisk).length > 0) ||
                      injectionVectors.length > 0 ||
                      piiFlows.length > 0 ||
                      (sideSummary && (sideSummary.external > 0 || sideSummary.local > 0 || sideSummary.unknown > 0)) ||
                      auditNotes.length > 0;
                    if (!hasAny) return null;

                    const risks = Object.entries(perNodeRisk ?? {}) as [string, 'low' | 'medium' | 'high' | 'critical'][];
                    const critical = risks.filter(([, r]) => r === 'critical');
                    const high = risks.filter(([, r]) => r === 'high');
                    const medium = risks.filter(([, r]) => r === 'medium');

                    const tierColor = (r: string) =>
                      r === 'critical' ? 'bg-red-500 text-white'
                      : r === 'high' ? 'bg-red-400 text-white'
                      : r === 'medium' ? 'bg-amber-500 text-white'
                      : 'bg-muted text-muted-foreground';

                    const nodeLabelFor = (id: string) =>
                      agent?.nodes?.find((n) => n.id === id)?.label ?? id;

                    return (
                      <>
                        <Separator />
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-destructive" />
                            <span className="text-xs font-semibold">V9 Security findings</span>
                            {(critical.length > 0 || high.length > 0) && (
                              <Badge variant="destructive" className="text-[10px] ml-auto">
                                {critical.length + high.length} high+
                              </Badge>
                            )}
                          </div>

                          {sideSummary && (
                            <div className="flex gap-2 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-muted/60">local {sideSummary.local}</span>
                              <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">external {sideSummary.external}</span>
                              {sideSummary.unknown > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-muted/40">unknown {sideSummary.unknown}</span>
                              )}
                            </div>
                          )}

                          {risks.length > 0 && (
                            <div className="space-y-1">
                              {[...critical, ...high, ...medium].map(([nodeId, tier]) => (
                                <button
                                  key={nodeId}
                                  onClick={() => {
                                    onNodeHover?.(nodeId);
                                    onNodeSelect?.(nodeId);
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/30 text-left"
                                >
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tierColor(tier)}`}>
                                    {tier.toUpperCase()}
                                  </span>
                                  <span className="text-[11px] flex-1 truncate">{nodeLabelFor(nodeId)}</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {injectionVectors.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-medium text-amber-400">Injection vectors ({injectionVectors.length})</span>
                              {injectionVectors.map((id) => (
                                <button
                                  key={id}
                                  onClick={() => {
                                    onNodeHover?.(id);
                                    onNodeSelect?.(id);
                                  }}
                                  className="w-full text-left text-[11px] px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 truncate"
                                >
                                  ⚠ {nodeLabelFor(id)}
                                </button>
                              ))}
                            </div>
                          )}

                          {piiFlows.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-medium text-red-400">PII flows ({piiFlows.length})</span>
                              {piiFlows.map((f, i) => (
                                <div key={i} className="text-[11px] px-2 py-1 rounded bg-red-500/10 truncate">
                                  🔓 <span className="font-mono">{f.data}</span>: {nodeLabelFor(f.from)} → {nodeLabelFor(f.to)}
                                </div>
                              ))}
                            </div>
                          )}

                          {auditNotes.length > 0 && (
                            <div className="space-y-0.5 pt-1 border-t border-border/40">
                              {auditNotes.map((note, i) => (
                                <p key={i} className="text-[10px] text-muted-foreground italic">{note}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  <Separator />

                  <div className="text-center py-8">
                    <div className="text-xs text-muted-foreground">
                      Select a node to edit its properties
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-sidebar border-l border-sidebar-border">
      {panelHeader}

      {/* Analyzer view (node selected) */}
      {panelView === 'analyzer' && (
        <div className="flex-1 min-h-0 flex flex-col">
          <AnalyzerPanelContent
            active={panelView === 'analyzer'}
            agent={agent ?? null}
            apiKey={apiKey}
            onNodeHighlight={onNodeHover}
            onShowNodeSource={(nodeId) => {
              onNodeSelect?.(nodeId);
              setPanelView('properties');
            }}
            onApplyFix={onApplyFix}
            focusNodeId={selectedNode?.id}
            compact
          />
        </div>
      )}

      {/* Properties view (node selected) */}
      {panelView === 'properties' && (
        <ScrollArea className="flex-1 min-h-0 overflow-hidden">
          <div className="p-4 space-y-4">
            {nodeConflicts.length > 0 && (
              <div className="space-y-2">
                {nodeConflicts.map((conflict, idx) => {
                  const isInfo = conflict.type === 'info';
                  const isWarning = conflict.type === 'warning';
                  const Icon = isInfo ? Info : isWarning ? AlertTriangle : AlertCircle;
                  const colorClass = isInfo ? 'text-blue-500' : isWarning ? 'text-amber-500' : 'text-destructive';
                  const bgClass = isInfo
                    ? 'bg-blue-500/10 border-blue-500/20'
                    : isWarning
                      ? 'bg-amber-500/10 border-amber-500/20'
                      : 'bg-destructive/10 border-destructive/20';
                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-2 p-2 rounded-md ${bgClass}`}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                      <p className={`text-xs ${colorClass}`}>{conflict.message}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Prompt Issues View — DAG violations mapped to prompt lines */}
            {(() => {
              const dagConflicts = conflicts.filter(c => c.ruleCategory === 'dag');
              if (dagConflicts.length === 0) return null;

              return (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Prompt Issues</Label>
                  {dagConflicts.map((conflict, i) => (
                    <div key={i} className="rounded-md border p-2 text-xs">
                      <div className="flex items-center gap-1">
                        <span className={conflict.type === 'error' ? 'text-red-500' : conflict.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'}>
                          {conflict.type === 'error' ? '●' : conflict.type === 'warning' ? '▲' : 'ℹ'}
                        </span>
                        <span>{conflict.message}</span>
                      </div>
                      {conflict.promptLines && conflict.promptLines.length > 0 && (
                        <div className="mt-1 text-muted-foreground">
                          Prompt lines: {conflict.promptLines.map(pl =>
                            pl.start === pl.end ? `${pl.start}` : `${pl.start}-${pl.end}`
                          ).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label htmlFor="node-type" className="text-xs">Node Type</Label>
              <Select value={nodeType} onValueChange={(value) => setNodeType(value as NodeType)}>
                <SelectTrigger id="node-type" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['AGENT', 'RULE', 'TASK', 'HANDOFF', 'TOOL', 'MEMORY', 'GUARD', 'TRIGGER', 'CONDITION', 'RESOLUTION', 'START', 'PERSONA', 'CONFIG', 'DECISION', 'OPTION', 'STEP', 'REFERENCE', 'ACTION', 'END', 'INPUT', 'LOGGING'] as NodeType[]).map(
                    (type) => (
                      <SelectItem key={type} value={type} className="text-xs">
                        <span className="flex items-center gap-2">
                          <span>{NODE_ICONS[type]}</span>
                          {type}
                        </span>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="node-label" className="text-xs">Label</Label>
              <Input
                id="node-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Node label"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="node-description" className="text-xs">Description</Label>
              <Textarea
                id="node-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Node description"
                className="min-h-[80px] text-xs resize-none"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="dangerous-flag" className="text-xs">Dangerous Operation</Label>
                <Switch
                  id="dangerous-flag"
                  checked={isDangerous}
                  onCheckedChange={setIsDangerous}
                />
              </div>
              {isDangerous && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="danger-reason" className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Danger Reason
                  </Label>
                  <Textarea
                    id="danger-reason"
                    value={dangerReason}
                    onChange={(e) => setDangerReason(e.target.value)}
                    placeholder="Explain why this operation is dangerous..."
                    className="min-h-[60px] text-xs resize-none border-destructive/50"
                  />
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs">Configuration</Label>
              <div className="p-3 rounded-md bg-muted/50 border border-border">
                <p className="text-[10px] text-muted-foreground">
                  Advanced configuration options will appear here based on node type
                </p>
              </div>
            </div>

            <Button onClick={handleSave} className="w-full" size="sm">
              <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
              Save Changes
            </Button>

            {promptContext && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs font-semibold flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-amber-500" />
                    Source Text
                  </Label>
                  {(selectedNode?.config?.sourceSection || selectedNode?.config?.sourceFormat) && (
                    <div className="flex gap-1.5 flex-wrap">
                      {selectedNode.config?.sourceSection && (
                        <Badge variant="outline" className="text-[10px]">
                          {selectedNode.config.sourceSection as string}
                        </Badge>
                      )}
                      {selectedNode.config?.sourceFormat && (
                        <Badge variant="secondary" className="text-[10px]">
                          {selectedNode.config.sourceFormat as string}
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-muted/30 p-2 text-[11px] font-mono leading-relaxed overflow-x-hidden">
                    {promptContext.hadTrimStart && (
                      <span className="text-muted-foreground/50">…</span>
                    )}
                    <span className="text-muted-foreground/60 whitespace-pre-wrap">{promptContext.before}</span>
                    <mark className="bg-amber-200 dark:bg-amber-900 text-foreground rounded-sm whitespace-pre-wrap not-italic">
                      {promptContext.match}
                    </mark>
                    <span className="text-muted-foreground/60 whitespace-pre-wrap">{promptContext.after}</span>
                    {promptContext.hadTrimEnd && (
                      <span className="text-muted-foreground/50">…</span>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="editable-snippet" className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                      <Pencil className="h-3 w-3" />
                      Edit source text
                    </Label>
                    <Textarea
                      id="editable-snippet"
                      value={editableSnippet}
                      onChange={(e) => setEditableSnippet(e.target.value)}
                      className="text-[11px] font-mono min-h-[72px] resize-y"
                    />
                    <Button
                      onClick={handleRewriteNode}
                      size="sm"
                      variant="outline"
                      className="w-full border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 text-xs"
                      disabled={editableSnippet === (selectedNode?.config?.logicSnippet as string)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2 text-amber-500" />
                      Rewrite Node &amp; Update Prompt
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
