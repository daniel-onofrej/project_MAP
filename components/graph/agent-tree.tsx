'use client';

import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { getNodeLineMapping } from '@/lib/text-to-graph';
import {
  Plus,
  FolderOpen,
  FileJson,
  Trash2,
  Download,
  Upload,
  Search,
  FileText,
  Network,
  FlaskConical,
  Lock,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  Users,
  ChevronRight,
  ChevronDown,
  Bot,
  Crown,
} from 'lucide-react';
import type { AgentConfig } from '@/lib/types';
import type { GenerationJob } from '../dialogs/ai-generator-dialog';
import type { MultiAgentJob } from '../dialogs/multi-agent-wizard';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface AgentTreeProps {
  agents: AgentConfig[];
  selectedAgentId?: string;
  onSelectAgent: (agentId: string) => void;
  onCreateAgent: () => void;
  onDeleteAgent: (agentId: string) => void;
  onExportAgent: (agentId: string) => void;
  onImportAgent: () => void;
  isTextMode: boolean;
  onToggleTextMode: () => void;
  textContent: string;
  onTextChange: (text: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
  selectedNodeId?: string;
  demoAgent?: AgentConfig;
  demoAgents?: AgentConfig[];
  generationJob?: GenerationJob | null;
  onDismissGenerationJob?: () => void;
  multiAgentJob?: MultiAgentJob | null;
  onDismissMultiAgentJob?: () => void;
}

export function AgentTree({
  agents,
  selectedAgentId,
  onSelectAgent,
  onCreateAgent,
  onDeleteAgent,
  onExportAgent,
  onImportAgent,
  isTextMode,
  onToggleTextMode,
  textContent,
  onTextChange,
  onNodeHover,
  selectedNodeId,
  demoAgent,
  demoAgents,
  generationJob,
  onDismissGenerationJob,
  multiAgentJob,
  onDismissMultiAgentJob,
}: AgentTreeProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());

  const toggleFamily = (masterId: string) => {
    setCollapsedFamilies(prev => {
      const next = new Set(prev);
      if (next.has(masterId)) next.delete(masterId);
      else next.add(masterId);
      return next;
    });
  };

  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (agent.agentRole || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group agents into families and standalone
  const { families, standalone } = (() => {
    const masterIds = new Set(
      filteredAgents.filter(a => a.childAgentIds?.length).map(a => a.id)
    );
    const childParentMap = new Map(
      filteredAgents.filter(a => a.parentAgentId).map(a => [a.id, a.parentAgentId!])
    );

    const familyMap = new Map<string, { master: AgentConfig; children: AgentConfig[] }>();
    const standaloneList: AgentConfig[] = [];

    for (const agent of filteredAgents) {
      if (masterIds.has(agent.id)) {
        if (!familyMap.has(agent.id)) {
          familyMap.set(agent.id, { master: agent, children: [] });
        } else {
          familyMap.get(agent.id)!.master = agent;
        }
      } else if (childParentMap.has(agent.id)) {
        const parentId = childParentMap.get(agent.id)!;
        if (!familyMap.has(parentId)) {
          // Parent not in filtered list but child is — show as standalone
          standaloneList.push(agent);
        } else {
          familyMap.get(parentId)!.children.push(agent);
        }
      } else {
        standaloneList.push(agent);
      }
    }

    return {
      families: Array.from(familyMap.values()),
      standalone: standaloneList,
    };
  })();

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-sidebar border-r border-sidebar-border" style={{ minWidth: 220 }}>
      <div className="p-4 border-b border-sidebar-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sidebar-foreground flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Agents
          </h2>
          <div className="flex gap-1">
            <Button
              variant={isTextMode ? "default" : "ghost"}
              className={cn(
                "h-7 gap-1.5 px-2 transition-all border border-orange-500/50 rounded-lg",
                isTextMode ? "bg-orange-600 hover:bg-orange-700 text-white shadow-sm border-orange-400" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              )}
              onClick={onToggleTextMode}
              title={isTextMode ? "Switch to Graph Mode" : "View AI System Prompt"}
            >
              {isTextMode ? <Network className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              <span className="text-[10px] font-bold uppercase tracking-tight">
                {isTextMode ? "Show Graph" : "Show Prompt"}
              </span>
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onImportAgent}>
              <Upload className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 px-2 bg-orange-600 hover:bg-orange-700 text-white border-0 shadow-sm"
              onClick={onCreateAgent}
            >
              <Plus className="h-3 w-3 stroke-[3px]" />
              <span className="text-[10px] font-bold uppercase tracking-tight">New</span>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-sidebar-accent border-sidebar-border"
          />
        </div>
      </div>

      {/* Progress section */}
      {(generationJob || multiAgentJob) && (
        <div className="shrink-0 max-h-[40%] flex flex-col">
          <ScrollArea className="flex-1">
            {/* Background generation notification */}
            {generationJob && (
              <div className={cn(
                'mx-3 mt-2 mb-1 rounded-md px-3 py-2 text-xs flex items-start gap-2',
                generationJob.status === 'running' && 'bg-primary/10 text-primary',
                generationJob.status === 'done' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                generationJob.status === 'error' && 'bg-destructive/10 text-destructive',
              )}>
                <div className="flex-shrink-0 mt-0.5">
                  {generationJob.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {generationJob.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {generationJob.status === 'error' && <XCircle className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  {generationJob.status === 'running' && (
                    <>
                      <p className="font-medium leading-snug">Generating graph…</p>
                      {generationJob.phaseLabel && (
                        <p className="text-[10px] text-primary opacity-90 mt-0.5 font-mono">
                          {generationJob.phaseLabel}
                        </p>
                      )}
                      {generationJob.charCount != null && generationJob.charCount > 0 && (
                        <p className="text-[10px] opacity-70 mt-0.5 font-mono">
                          {generationJob.charCount.toLocaleString()} chars received
                        </p>
                      )}
                      {generationJob.tokenCount?.totalTokens != null && generationJob.tokenCount.totalTokens > 0 && (
                        <p className="text-[10px] opacity-70 mt-0.5 font-mono">
                          {generationJob.tokenCount.totalTokens.toLocaleString()} tokens
                          {(generationJob.tokenCount.promptTokens || generationJob.tokenCount.responseTokens) && (
                            <> ({generationJob.tokenCount.promptTokens?.toLocaleString() ?? '?'} prompt in + {generationJob.tokenCount.responseTokens?.toLocaleString() ?? '?'} out)</>
                          )}
                        </p>
                      )}
                    </>
                  )}
                  {generationJob.status === 'done' && (
                    <>
                      <p className="font-medium leading-snug">Graph ready</p>
                      {generationJob.tokenCount?.totalTokens != null && generationJob.tokenCount.totalTokens > 0 && (
                        <p className="text-[10px] opacity-70 mt-0.5 font-mono">
                          {generationJob.tokenCount.totalTokens.toLocaleString()} tokens used
                          {generationJob.tokenCount.thoughtsTokens ? ` (${generationJob.tokenCount.thoughtsTokens.toLocaleString()} thinking)` : ''}
                        </p>
                      )}
                    </>
                  )}
                  {generationJob.status === 'error' && (
                    <p className="font-medium leading-snug">Generation failed</p>
                  )}
                  {generationJob.status !== 'running' && (
                    <p className="truncate text-[10px] opacity-70 mt-0.5">{generationJob.error ?? generationJob.prompt}</p>
                  )}
                </div>
                {generationJob.status === 'running' && generationJob.abort && (
                  <button
                    onClick={generationJob.abort}
                    className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity text-destructive"
                    aria-label="Stop generation"
                    title="Stop generation"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                )}
                {generationJob.status !== 'running' && (
                  <button
                    onClick={onDismissGenerationJob}
                    className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            {/* Multi-agent generation progress panel */}
            {multiAgentJob && (
              <div className="mx-3 mt-2 mb-1 rounded-md border border-border bg-muted/30 text-xs overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {multiAgentJob.status === 'running' ? 'Generating multi-agent system…' :
                        multiAgentJob.status === 'done' ? 'Multi-agent system ready' :
                          'Generation failed'}
                    </span>
                  </div>
                  {multiAgentJob.status !== 'running' && (
                    <button
                      onClick={onDismissMultiAgentJob}
                      className="opacity-60 hover:opacity-100 transition-opacity"
                      aria-label="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="p-2 space-y-1">
                  {multiAgentJob.agents.map((ap, i) => (
                    <div key={ap.role} className="flex items-center gap-2 px-2 py-1 rounded">
                      {ap.status === 'done' && <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-500" />}
                      {ap.status === 'generating' && <Loader2 className="h-3 w-3 flex-shrink-0 text-blue-500 animate-spin" />}
                      {ap.status === 'error' && <XCircle className="h-3 w-3 flex-shrink-0 text-destructive" />}
                      {ap.status === 'pending' && (
                        <span className="h-3 w-3 flex-shrink-0 rounded-full border border-muted-foreground inline-block" />
                      )}
                      {i === 0
                        ? <Crown className="h-2.5 w-2.5 flex-shrink-0 text-orange-500" />
                        : <Bot className="h-2.5 w-2.5 flex-shrink-0 text-blue-400" />
                      }
                      <span className={cn(
                        'truncate flex-1',
                        ap.status === 'done' && 'text-green-700 dark:text-green-400',
                        ap.status === 'generating' && 'text-blue-700 dark:text-blue-400 font-medium',
                        ap.status === 'error' && 'text-destructive',
                        ap.status === 'pending' && 'text-muted-foreground',
                      )}>
                        {ap.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {isTextMode ? (
          <TextEditor
            content={textContent}
            onChange={onTextChange}
            selectedNodeId={selectedNodeId}
            onNodeHover={onNodeHover}
          />
        ) : (
          <div className="p-2 space-y-1">
            {/* Nova Refund Arbiter example restored per user request */}
            {demoAgent && (
              <>
                <div className="flex items-center gap-2 px-2 py-1">
                  <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Example</span>
                </div>
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                    selectedAgentId === demoAgent.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                  )}
                  onClick={() => onSelectAgent(demoAgent.id)}
                >
                  <FileJson className="h-4 w-4 flex-shrink-0 text-orange-400" />
                  <span className="flex-1 min-w-0 truncate text-xs">{demoAgent.name}</span>
                  <div title="Read-only demo" className="flex-shrink-0">
                    <Lock className="h-3 w-3 text-muted-foreground" />
                  </div>
                </div>
              </>
            )}
            {/* Master Orchestrator demo family remains hidden */}
            <div className="my-1 border-t border-sidebar-border" />

            {/* Multi-agent families */}
            {families.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-2 py-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Multi-Agent Systems</span>
                </div>
                {families.map(({ master, children }) => {
                  const isCollapsed = collapsedFamilies.has(master.id);
                  return (
                    <div key={master.id}>
                      {/* Master row */}
                      <div
                        className={cn(
                          'group flex items-center gap-1.5 min-w-0 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                          selectedAgentId === master.id
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                        )}
                        onClick={() => onSelectAgent(master.id)}
                      >
                        <button
                          className="flex-shrink-0 p-0.5 hover:bg-sidebar-accent rounded"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFamily(master.id);
                          }}
                        >
                          {isCollapsed
                            ? <ChevronRight className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />
                          }
                        </button>
                        <Crown className="h-3.5 w-3.5 flex-shrink-0 text-orange-500" />
                        <span className="flex-1 min-w-0 truncate text-xs font-medium">
                          {master.agentRole || master.name}
                        </span>
                        <div className="flex-shrink-0 flex items-center gap-1">
                          {master.sourceFormat && (
                            <span className={cn(
                              "px-1 rounded-[2px] text-[9px] font-bold uppercase",
                              master.sourceFormat === 'yaml' ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                                master.sourceFormat === 'json-compact' ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                                  "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            )}>
                              {master.sourceFormat === 'json-compact' ? 'COMPACT' : master.sourceFormat}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {children.length} sub
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(master.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Children rows */}
                      {!isCollapsed && children.map(child => (
                        <div
                          key={child.id}
                          className={cn(
                            'group flex items-center gap-2 min-w-0 rounded-md pl-7 pr-2 py-1 text-sm cursor-pointer transition-colors',
                            selectedAgentId === child.id
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                          )}
                          onClick={() => onSelectAgent(child.id)}
                        >
                          <div className="w-px h-4 bg-border -ml-1.5 flex-shrink-0" />
                          <Bot className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
                          <span className="flex-1 min-w-0 truncate text-xs">
                            {child.agentRole || child.name}
                          </span>
                          <div className="flex-shrink-0 flex items-center gap-1">
                            {child.sourceFormat && (
                              <span className={cn(
                                "px-1 rounded-[2px] text-[9px] font-bold uppercase",
                                child.sourceFormat === 'yaml' ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                                  child.sourceFormat === 'json-compact' ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                                    "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              )}>
                                {child.sourceFormat === 'json-compact' ? 'COMPACT' : child.sourceFormat}
                              </span>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive hover:text-destructive transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(child.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {standalone.length > 0 && (
                  <div className="my-1 border-t border-sidebar-border" />
                )}
              </>
            )}

            {/* Standalone agents */}
            {(standalone.length > 0 || families.length === 0) && (
              <div className="flex items-center gap-2 px-2 py-1">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Agents</span>
              </div>
            )}
            {standalone.length === 0 && families.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                {searchQuery ? 'No agents found' : 'No agents yet. Create one to get started.'}
              </div>
            ) : (
              standalone.map((agent, idx) => (
                <div
                  key={`${agent.id}-${idx}`}
                  className={cn(
                    'group flex items-center gap-2 min-w-0 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors',
                    selectedAgentId === agent.id
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                  )}
                  onClick={() => onSelectAgent(agent.id)}
                >
                  <FileJson className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-xs">{agent.agentRole || agent.name}</span>
                  <div className="flex-shrink-0 flex items-center gap-1">
                    {agent.sourceFormat && (
                      <span className={cn(
                        "px-1 rounded-[2px] text-[9px] font-bold uppercase",
                        agent.sourceFormat === 'yaml' ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" :
                          agent.sourceFormat === 'json-compact' ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                            "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      )}>
                        {agent.sourceFormat === 'json-compact' ? 'COMPACT' : agent.sourceFormat}
                      </span>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmId(agent.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this agent? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) {
                  onDeleteAgent(deleteConfirmId);
                  setDeleteConfirmId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface TextEditorProps {
  content: string;
  onChange: (text: string) => void;
  selectedNodeId?: string;
  onNodeHover?: (nodeId: string | null) => void;
}

function TextEditor({ content, onChange, selectedNodeId, onNodeHover }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedNodeId) {
      const mappings = getNodeLineMapping(content);
      const mapping = mappings.find(m => m.nodeId === selectedNodeId);

      if (mapping && textareaRef.current) {
        const textarea = textareaRef.current;
        const lines = content.split('\n');
        const charPosition = lines.slice(0, mapping.startLine).join('\n').length + (mapping.startLine > 0 ? 1 : 0);

        textarea.focus();
        textarea.setSelectionRange(charPosition, charPosition);
        textarea.scrollTop = (mapping.startLine * 20);
      }
    }
  }, [selectedNodeId, content]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!textareaRef.current || !onNodeHover) return;

    const textarea = textareaRef.current;
    const rect = textarea.getBoundingClientRect();
    const y = e.clientY - rect.top + textarea.scrollTop;
    const lineHeight = 20;
    const lineNumber = Math.floor(y / lineHeight);

    const mappings = getNodeLineMapping(content);
    const hoveredMapping = mappings.find(
      m => lineNumber >= m.startLine && lineNumber <= m.endLine
    );

    const newHoveredId = hoveredMapping?.nodeId || null;
    if (newHoveredId !== hoveredNodeId) {
      setHoveredNodeId(newHoveredId);
      onNodeHover(newHoveredId);
    }
  };

  const handleMouseLeave = () => {
    if (onNodeHover) {
      onNodeHover(null);
      setHoveredNodeId(null);
    }
  };

  const renderHighlightedText = () => {
    const mappings = getNodeLineMapping(content);
    const lines = content.split('\n');

    return lines.map((line, index) => {
      const mapping = mappings.find(
        m => index >= m.startLine && index <= m.endLine
      );

      const isHovered = mapping && mapping.nodeId === hoveredNodeId;
      const isSelected = mapping && mapping.nodeId === selectedNodeId;

      return (
        <div
          key={index}
          className={cn(
            'px-3 transition-colors',
            isHovered && 'bg-yellow-500/20',
            isSelected && 'bg-primary/10'
          )}
          style={{ lineHeight: '20px', minHeight: '20px' }}
        >
          {line || ' '}
        </div>
      );
    });
  };

  return (
    <div className="p-4 relative">
      <div
        className="relative w-full h-[calc(100vh-200px)] border border-sidebar-border rounded-md overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={highlightRef}
          className="absolute inset-0 pointer-events-none text-xs font-mono text-transparent overflow-hidden"
        >
          {renderHighlightedText()}
        </div>
        <textarea
          ref={textareaRef}
          className="absolute inset-0 w-full h-full p-3 text-xs font-mono bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-primary rounded-md z-10"
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Edit your agent in text format...&#10;&#10;Format:&#10;### [node-id] TYPE: Label&#10;Description&#10;⚠️ DANGEROUS: reason (optional)"
          style={{ lineHeight: '20px', color: 'inherit' }}
        />
      </div>
    </div>
  );
}
