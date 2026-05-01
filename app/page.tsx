'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Layout, Database, Plus, Search, LayoutDashboard, BookOpen, Network as NetworkIcon, Settings as SettingsIcon, FileText, Globe, Lock, MoreHorizontal, Trash2 as Trash2Icon, ExternalLink, Home as HomeIcon, Users, TrendingUp, Clock, UserCircle, Building2, Key, LogOut, ChevronRight, Mail, Shield, UserCog, Library, GitFork, ChevronDown, Sparkles, Sun, Moon, Server, X as XIcon } from 'lucide-react';
import { subgraphToPromptFragment, suggestComplexity, suggestPatternName } from '@/lib/subgraph-to-prompt';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { AgentTree } from '@/components/graph/agent-tree';
import { AgentCanvas } from '@/components/graph/agent-canvas';
import { PropertiesPanel } from '@/components/panels/properties-panel';
import { Toolbar } from '@/components/toolbar';
import { createHistory, undo, redo, addToHistory, canUndo, canRedo, type HistoryState } from '@/lib/undo-redo';
import type { AgentConfig, NodeData, NodeType, MultiAgentDetection, PromptPattern, GraphRuleSettings, PatternDomain, PatternComplexity } from '@/lib/types';
import { DEFAULT_GRAPH_RULE_SETTINGS, DEFAULT_GEMINI_MODEL, PATTERN_DOMAINS } from '@/lib/types';
import { PatternBrowserDialog } from '@/components/dialogs/pattern-browser-dialog';
import { PatternFilterSidebar, type PatternFilters } from '@/components/pattern/pattern-filter-sidebar';
import { PatternCard } from '@/components/pattern/pattern-card';
import { PatternSaveDialog } from '@/components/pattern/pattern-save-dialog';
import { PatternPreviewDialog } from '@/components/dialogs/pattern-preview-dialog';
import { PatternGenerateDialog } from '@/components/dialogs/pattern-generate-dialog';
import { KeyboardShortcutsDialog } from '@/components/dialogs/keyboard-shortcuts-dialog';
import { insertPatternIntoGraph, BUILT_IN_PATTERNS, PATTERN_CATEGORIES } from '@/lib/patterns';
import { MOCK_COMMUNITY_AGENTS, getTrendingAgents, getAllTags } from '@/lib/hub-mock';
import type { PatternCategory } from '@/lib/types';
import { useTheme } from 'next-themes';
import { runStructuralAnalysis, type AIConflictIssue } from '@/lib/ai/ai-conflict-analyzer';
import {
  saveAgent,
  getAllAgents,
  getAgent,
  deleteAgent as deleteAgentFromStorage,
  deleteAgentFamily,
  exportAgent,
  importAgent,
  getGraphRuleSettings,
  saveGraphRuleSettings,
} from '@/lib/storage/storage';
import { DEMO_AGENT, DEMO_AGENTS } from '@/lib/templates';
import { validateAgentConfig } from '@/lib/validation';
import { agentToText, textToAgent } from '@/lib/text-to-graph';
import { applyAutoLayout } from '@/lib/graph/auto-layout';
import { SettingsDialog } from '@/components/dialogs/settings-dialog';
import { TemplatesDialog } from '@/components/dialogs/templates-dialog';
import { TemplateCreatorPanel } from '@/components/graph/template-creator-panel';
import { VersionControlDialog } from '@/components/dialogs/version-control-dialog';
import { SimulationStudioDialog } from '@/components/dialogs/simulation-studio-dialog';
import { AIGeneratorDialog, type GenerationJob } from '@/components/dialogs/ai-generator-dialog';
import { ReSyncDialog } from '@/components/dialogs/resync-dialog';
import { JsonParserDialog } from '@/components/dialogs/json-parser-dialog';
import { AIConflictDialog } from '@/components/dialogs/ai-conflict-dialog';
import { ExportJsonDialog } from '@/components/dialogs/export-json-dialog';
import { McpControlPanel } from '@/components/panels/mcp-control-panel';
import { CommentsPanel } from '@/components/panels/comments-panel';
import { AgentHubDialog } from '@/components/dialogs/agent-hub-dialog';
import { HubPanel } from '@/components/panels/hub-panel';
import { McpSidebarPanel } from '@/components/panels/mcp-sidebar-panel';
import { addComment, resolveComment, type Comment } from '@/lib/collaboration';
import { saveVersion, computeNextVersionLabel, getAllVersions } from '@/lib/storage/version-control';
import { useCurrentUser } from '@/lib/auth/user-context';
import { useWorkspace } from '@/lib/workspace-context';
import { diffLines, computeDiffStats } from '@/lib/diff-utils';
import type { ReSyncResult } from '@/components/dialogs/resync-dialog';
import { detectBasicCapabilities } from '@/lib/capability-analyzer';
import { toast } from 'sonner';
import { CompilationStatus } from '@/components/graph/compilation-status';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu as PromptMenu,
  DropdownMenuContent as PromptMenuContent,
  DropdownMenuItem as PromptMenuItem,
  DropdownMenuSeparator as PromptMenuSep,
  DropdownMenuTrigger as PromptMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GraphChatPanel, type ChatMessage } from '@/components/panels/graph-chat-panel';
import { graphEditAgent } from '@/lib/ai/graph-edit-agent';
import { MultiAgentWizard, type MultiAgentJob } from '@/components/dialogs/multi-agent-wizard';
import { AgentTabBar } from '@/components/graph/agent-tab-bar';
import { PromptFilterBar } from '@/components/prompt-filter-bar';
import { PromptCard } from '@/components/prompt-card';
import { DEFAULT_FILTERS, PromptFilters, applyFilters, extractGroups, extractTags } from '@/lib/prompt-filters';

type EditorPanel = 'home' | 'editor' | 'prompts' | 'hub' | 'patterns' | 'wiki' | 'groups' | 'settings' | 'profile' | 'mcp'

export default function Home() {
  const { user: currentUserData } = useCurrentUser();
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const currentUserName = currentUserData?.name ?? 'You';
  const [editorPanel, setEditorPanel] = useState<EditorPanel>('editor');

  const handlePanelChange = useCallback((panel: EditorPanel) => {
    if (panel === 'wiki') { router.push('/wiki'); return; }
    setEditorPanel(panel);
  }, [router]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [currentAgent, setCurrentAgent] = useState<AgentConfig | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  // Wrapper that allows re-triggering pan even when clicking the same node
  const handleHighlightNode = useCallback((nodeId: string | null) => {
    if (nodeId !== null) {
      setHighlightedNodeId(null);
      requestAnimationFrame(() => setHighlightedNodeId(nodeId));
    } else {
      setHighlightedNodeId(null);
    }
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [graphRuleSettings, setGraphRuleSettings] = useState<GraphRuleSettings>(DEFAULT_GRAPH_RULE_SETTINGS);
  const [mcpPanelOpen, setMcpPanelOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [simulationStudioOpen, setSimulationStudioOpen] = useState(false);
  const [copiedNode, setCopiedNode] = useState<NodeData | null>(null);
  const historyRef = useRef<HistoryState | null>(null);
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const [reSyncDialogOpen, setReSyncDialogOpen] = useState(false);
  const [reSyncCache, setReSyncCache] = useState<ReSyncResult | null>(null);
  const [reSyncSummary, setReSyncSummary] = useState<{ similarity: number; added: number; removed: number } | null>(null);
  const [reSyncRunning, setReSyncRunning] = useState(false);
  const [reSyncDirty, setReSyncDirty] = useState(false);
  const [reSyncAutoRun, setReSyncAutoRun] = useState(false);
  const reSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reSyncAgentRef = useRef<AgentConfig | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [jsonParserOpen, setJsonParserOpen] = useState(false);
  const [conflictAnalyzerOpen, setConflictAnalyzerOpen] = useState(false);
  const [exportJsonOpen, setExportJsonOpen] = useState(false);
  const [conflictIssues, setConflictIssues] = useState<AIConflictIssue[]>([]);
  const [conflictFocusNodeId, setConflictFocusNodeId] = useState<string | null>(null);
  const [analyzerRiskCount, setAnalyzerRiskCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null);
  const [patternBrowserOpen, setPatternBrowserOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const patternInsertContextRef = useRef<{ position: { x: number; y: number }; connectToNodeId?: string } | null>(null);

  // Create Pattern mode state
  const [patternSelectionMode, setPatternSelectionMode] = useState(false);
  const [selectedPatternNodeIds, setSelectedPatternNodeIds] = useState<string[]>([]);
  const [patternPromptFragment, setPatternPromptFragment] = useState('');
  const [showPatternSave, setShowPatternSave] = useState(false);
  const [aiSuggestedPatternName, setAiSuggestedPatternName] = useState('');
  const [aiSuggestedPatternDescription, setAiSuggestedPatternDescription] = useState('');
  const [aiExtractedTemplate, setAiExtractedTemplate] = useState('');

  // Multi-agent state
  const [navigationStack, setNavigationStack] = useState<string[]>([]);
  const [multiAgentWizardOpen, setMultiAgentWizardOpen] = useState(false);
  const [multiAgentDetection, setMultiAgentDetection] = useState<MultiAgentDetection | null>(null);
  const [pendingMasterPrompt, setPendingMasterPrompt] = useState('');
  const [pendingApiKey, setPendingApiKey] = useState('');
  const [multiAgentJob, setMultiAgentJob] = useState<MultiAgentJob | null>(null);
  const [wizardKey, setWizardKey] = useState(0);

  // Confirmation dialog state
  const [deleteConfirm, setDeleteConfirm] = useState<{ agentId: string; name: string; isFamily: boolean } | null>(null);

  // Node search state
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false);
  const [nodeSearchQuery, setNodeSearchQuery] = useState('');

  // Connection label editing state
  const [editingEdge, setEditingEdge] = useState<{ id: string; condition: string } | null>(null);

  // Pending edit state (Accept/Decline diff review)
  interface PendingEdit {
    snapshot: AgentConfig;
    proposed: AgentConfig;
    stats: { addedNodes: number; addedConnections: number; removedNodes: number; removedConnections: number; updatedNodes: number };
    summary: string;
  }
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [existingNodeOpacity, setExistingNodeOpacity] = useState(0.7);

  // Compute pending diff for canvas diff visualisation
  const pendingDiff = useMemo(() => {
    if (!pendingEdit) return undefined;
    const snapshotIds = new Set(pendingEdit.snapshot.nodes.map(n => n.id));
    const proposedIds = new Set(pendingEdit.proposed.nodes.map(n => n.id));
    const addedIds = new Set([...proposedIds].filter(id => !snapshotIds.has(id)));
    const removedIds = new Set([...snapshotIds].filter(id => !proposedIds.has(id)));
    const updatedIds = new Set(
      pendingEdit.proposed.nodes
        .filter(n => {
          const old = pendingEdit.snapshot.nodes.find(o => o.id === n.id);
          if (!old) return false;
          return old.label !== n.label || old.description !== n.description;
        })
        .map(n => n.id)
    );
    return { addedIds, removedIds, updatedIds };
  }, [pendingEdit]);

  // Compute multi-agent family for current agent
  const currentFamily = useMemo(() => {
    if (!currentAgent) return null;
    const masterId = currentAgent.parentAgentId ??
      (currentAgent.childAgentIds?.length ? currentAgent.id : null);
    if (!masterId) return null;
    return agents.filter(a => a.id === masterId || a.parentAgentId === masterId);
  }, [currentAgent, agents]);

  const masterAgent = useMemo(() => {
    if (!currentFamily) return null;
    return currentFamily.find(a => a.childAgentIds?.length) ?? null;
  }, [currentFamily]);

  // Compute per-node worst conflict severity for canvas badges
  const nodeConflictSeverity = useMemo(() => {
    const map = new Map<string, 'critical' | 'warning' | 'info'>();
    const RANK = { critical: 2, warning: 1, info: 0 } as const;
    for (const issue of conflictIssues) {
      for (const nodeId of issue.nodeIds ?? []) {
        const current = map.get(nodeId);
        if (!current || RANK[issue.severity] > RANK[current]) {
          map.set(nodeId, issue.severity);
        }
      }
    }
    return map;
  }, [conflictIssues]);

  const nodeConflictCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of conflictIssues) {
      for (const nodeId of issue.nodeIds ?? []) {
        map.set(nodeId, (map.get(nodeId) ?? 0) + 1);
      }
    }
    return map;
  }, [conflictIssues]);

  // Initial load effect
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { if (!cancelled) setIsInitialized(true) }, 100);
    setGraphRuleSettings(getGraphRuleSettings());

    getAllAgents().then((loadedAgents) => {
      if (cancelled) return;
      if (loadedAgents.length > 0) {
        setAgents(loadedAgents);
        // Re-apply layout on load so right-column nodes (AGENT, RULE) are
        // positioned correctly even if saved positions are stale.
        const first = loadedAgents[0];
        const relaid = { ...first, nodes: applyAutoLayout(first.nodes, first.connections) };
        setCurrentAgent(relaid);
      } else {
        // Show demo agent by default (not saved to DB yet)
        setCurrentAgent(DEMO_AGENT);
      }
    }).catch(() => {
      if (!cancelled) setCurrentAgent(DEMO_AGENT);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Sync text content and history
  useEffect(() => {
    if (currentAgent) {
      if (!isTextMode) {
        // Prefer edited prompt if user has made edits, else fall back to original
        setTextContent(currentAgent.editedPrompt ?? currentAgent.originalPrompt ?? agentToText(currentAgent));
      }
      if (!historyRef.current) {
        historyRef.current = createHistory(currentAgent);
      }
    }
  }, [currentAgent, isTextMode]);

  const handleCreateAgent = useCallback(() => {
    setAiGeneratorOpen(true);
  }, []);

  const handleSkipToEditor = useCallback(() => {
    const newAgent: AgentConfig = {
      id: `agent-${Date.now()}`,
      name: 'New Agent',
      nodes: [],
      connections: [],
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      groupId: activeWorkspace.id,
      settings: {
        llmProvider: 'gemini',
        apiKey: '',
        model: DEFAULT_GEMINI_MODEL,
        temperature: 0,
      }
    };
    saveAgent(newAgent);
    setAgents([newAgent]);
    setCurrentAgent(newAgent);
    setHasUnsavedChanges(false);
    toast.success('New blank agent created');
  }, [activeWorkspace.id]);

  const handleGenerateAgent = useCallback((agent: AgentConfig) => {
    // AI generation creates the original baseline — no version yet.
    // First edit (node add/delete/agent-edit) will create v1.
    const agentWithGroup = activeWorkspace.id ? { ...agent, groupId: activeWorkspace.id } : agent;
    const agentWithVersion = { ...agentWithGroup, currentVersionId: undefined };
    saveAgent(agentWithVersion);

    setAgents(prev => {
      const exists = prev.some(a => a.id === agent.id);
      return exists
        ? prev.map(a => a.id === agent.id ? agentWithVersion : a)
        : [...prev, agentWithVersion];
    });
    setCurrentAgent(agentWithVersion);
    setHasUnsavedChanges(false);
    toast.success('Agent generated successfully');
  }, [activeWorkspace.id]);

  // Multi-agent: pre-generate detection hook
  const handlePreGenerate = useCallback(async (prompt: string, apiKey: string): Promise<boolean> => {
    try {
      const { detectMultiAgent } = await import('@/lib/prompt-to-graph/v4');
      const detection = await detectMultiAgent(prompt, { apiKey });
      if (detection) {
        setMultiAgentDetection(detection);
        setPendingMasterPrompt(prompt);
        setPendingApiKey(apiKey);
        setWizardKey(k => k + 1);
        setMultiAgentWizardOpen(true);
        return true; // wizard takes over
      }
    } catch (err) {
      console.error('Multi-agent detection failed, proceeding as single agent:', err);
    }
    return false; // proceed with single-agent
  }, []);

  const handleMultiAgentComplete = useCallback((master: AgentConfig, subAgents: AgentConfig[]) => {
    // AI generation creates the original baseline — no version yet.
    const masterWithVersion = { ...master, currentVersionId: undefined };
    saveAgent(masterWithVersion);

    const subWithVersions: AgentConfig[] = [];
    for (const sub of subAgents) {
      const subNoVersion = { ...sub, currentVersionId: undefined };
      saveAgent(subNoVersion);
      subWithVersions.push(subNoVersion);
    }

    setAgents(prev => [...prev, masterWithVersion, ...subWithVersions]);
    setCurrentAgent(masterWithVersion);
    setMultiAgentWizardOpen(false);
    setHasUnsavedChanges(false);
    toast.success(`Multi-agent system created: ${master.agentRole || master.name} + ${subAgents.length} sub-agents`);
  }, []);

  const handleDrillDown = useCallback((linkedAgentId: string) => {
    if (!currentAgent) return;
    setNavigationStack(prev => [...prev, currentAgent.id]);
    const target = agents.find(a => a.id === linkedAgentId);
    if (target) {
      setCurrentAgent(target);
      setSelectedNodeId(null);
      setHasUnsavedChanges(false);
      toast.info(`Navigated to sub-agent: ${target.agentRole || target.name}`);
    }
  }, [currentAgent, agents]);

  const handleNavigateBack = useCallback(() => {
    const stack = [...navigationStack];
    const parentId = stack.pop();
    if (parentId) {
      setNavigationStack(stack);
      const parent = agents.find(a => a.id === parentId);
      if (parent) {
        setCurrentAgent(parent);
        setSelectedNodeId(null);
        toast.info(`Navigated back to: ${parent.agentRole || parent.name}`);
      }
    }
  }, [navigationStack, agents]);

  const handleSelectAgent = useCallback((agentId: string) => {
    if (agentId === DEMO_AGENT.id) {
      setCurrentAgent(DEMO_AGENT);
      setSelectedNodeId(null);
      setHasUnsavedChanges(false);
      return;
    }
    const demoFamilyAgent = DEMO_AGENTS.find(a => a.id === agentId);
    if (demoFamilyAgent) {
      setCurrentAgent(demoFamilyAgent);
      setSelectedNodeId(null);
      setHasUnsavedChanges(false);
      return;
    }
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      const relaid = { ...agent, nodes: applyAutoLayout(agent.nodes, agent.connections) };
      setCurrentAgent(relaid);
      setSelectedNodeId(null);
      setHasUnsavedChanges(false);
    }
  }, [agents]);

  const handleDeleteAgent = useCallback((agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    // Show confirmation dialog instead of deleting immediately
    setDeleteConfirm({
      agentId,
      name: agent.name,
      isFamily: !!(agent.childAgentIds?.length),
    });
  }, [agents]);

  const handleConfirmDelete = useCallback((agentId: string) => {
    const agent = agents.find(a => a.id === agentId);

    // If deleting a master agent, delete entire family
    if (agent?.childAgentIds?.length) {
      deleteAgentFamily(agentId);
      const childIds = new Set(agent.childAgentIds);
      const updatedAgents = agents.filter(a => a.id !== agentId && !childIds.has(a.id));
      setAgents(updatedAgents);
      if (currentAgent?.id === agentId || (currentAgent && childIds.has(currentAgent.id))) {
        setCurrentAgent(updatedAgents[0] || null);
        setNavigationStack([]);
      }
      toast.success('Multi-agent family deleted');
      return;
    }

    // If deleting a child, remove from parent's childAgentIds
    if (agent?.parentAgentId) {
      const parent = agents.find(a => a.id === agent.parentAgentId);
      if (parent) {
        const updatedParent = {
          ...parent,
          childAgentIds: (parent.childAgentIds || []).filter(id => id !== agentId),
        };
        saveAgent(updatedParent);
        setAgents(prev => prev.map(a => a.id === parent.id ? updatedParent : a).filter(a => a.id !== agentId));
        if (currentAgent?.id === parent.id) setCurrentAgent(updatedParent);
      }
    }

    deleteAgentFromStorage(agentId);
    const updatedAgents = agents.filter(a => a.id !== agentId);
    setAgents(updatedAgents);

    if (currentAgent?.id === agentId) {
      // Navigate back to parent if in drill-down
      if (navigationStack.length > 0) {
        handleNavigateBack();
      } else {
        setCurrentAgent(updatedAgents[0] || null);
      }
    }

    toast.success('Agent deleted');
    setDeleteConfirm(null);
  }, [agents, currentAgent, navigationStack, handleNavigateBack]);

  const handleExportAgent = useCallback((agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent) {
      exportAgent(agent);
      toast.success('Agent exported');
    }
  }, [agents]);

  const handleImportAgent = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const agent = await importAgent(file);
          agent.id = `agent-${Date.now()}`;
          agent.currentVersionId = undefined;
          saveAgent(agent);
          setAgents([...agents, agent]);
          setCurrentAgent(agent);
          toast.success('Agent imported');
        } catch (error) {
          toast.error('Failed to import agent');
        }
      }
    };
    input.click();
  }, [agents]);

  const handleLoadExample = useCallback((exampleAgent: AgentConfig) => {
    const newAgent = {
      ...exampleAgent,
      id: `agent-${Date.now()}`,
      name: `${exampleAgent.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveAgent(newAgent);
    setAgents([...agents, newAgent]);
    setCurrentAgent(newAgent);
    setHasUnsavedChanges(false);
    toast.success('Example agent loaded');
  }, [agents]);

  const findEmptyPosition = useCallback((nodes: NodeData[]) => {
    const NODE_W = 200;
    const NODE_H = 100;
    const GAP = 30;
    const startX = 300;
    const startY = 150;

    if (nodes.length === 0) return { x: startX, y: startY };

    // Try positions in a grid pattern, checking for overlaps
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 5; col++) {
        const x = startX + col * (NODE_W + GAP);
        const y = startY + row * (NODE_H + GAP);
        const overlaps = nodes.some(n => {
          const nx = n.position?.x ?? 0;
          const ny = n.position?.y ?? 0;
          return Math.abs(nx - x) < NODE_W && Math.abs(ny - y) < NODE_H;
        });
        if (!overlaps) return { x, y };
      }
    }
    // Fallback: place below all existing nodes
    const maxY = Math.max(...nodes.map(n => n.position?.y ?? 0));
    return { x: startX, y: maxY + NODE_H + GAP };
  }, []);

  const autoCommit = useCallback((agent: AgentConfig, message: string): AgentConfig => {
    const version = saveVersion(agent, message, undefined, currentUserName);
    return { ...agent, currentVersionId: version.id };
  }, [currentUserName]);

  const handleAddNode = useCallback((type: NodeType) => {
    if (!currentAgent) return;

    const newNode: NodeData = {
      id: `node-${Date.now()}`,
      type,
      label: `New ${type}`,
      description: '',
      config: {},
      position: findEmptyPosition(currentAgent.nodes),
    };

    const newAgent = {
      ...currentAgent,
      nodes: [...currentAgent.nodes, newNode],
    };

    const committed = autoCommit(newAgent, `added node: ${newNode.label || type}`);
    saveAgent(committed);
    setCurrentAgent(committed);
    setAgents(prev => prev.map(a => a.id === committed.id ? committed : a));
    setHasUnsavedChanges(false);
    toast.success(`${type} node added`);
  }, [currentAgent, findEmptyPosition, autoCommit]);

  const handleSave = useCallback(() => {
    if (!currentAgent) return;

    const agentWithVersion = autoCommit(currentAgent, `Saved – ${new Date().toLocaleTimeString()}`);
    saveAgent(agentWithVersion);
    setAgents(prev => prev.map(a => (a.id === agentWithVersion.id ? agentWithVersion : a)));
    setCurrentAgent(agentWithVersion);
    setHasUnsavedChanges(false);
    toast.success('Agent saved');

    // Background: run deterministic analysis to update risk badge
    try {
      const { issues } = runStructuralAnalysis(agentWithVersion);
      const criticalSafetyCount = issues.filter(i => i.category === 'safety' && i.severity === 'critical').length;
      setAnalyzerRiskCount(criticalSafetyCount);
    } catch { /* don't block save */ }
  }, [currentAgent]);

  const handleSimulate = useCallback(() => {
    setSimulationStudioOpen(true);
  }, []);

  const handleNodesChange = useCallback((nodes: NodeData[]) => {
    if (!currentAgent) return;

    setCurrentAgent({
      ...currentAgent,
      nodes,
    });
    setHasUnsavedChanges(true);
  }, [currentAgent]);

  const handleConnectionsChange = useCallback((connections: any[]) => {
    if (!currentAgent) return;

    setCurrentAgent({
      ...currentAgent,
      connections,
    });
    setHasUnsavedChanges(true);
  }, [currentAgent]);

  const handleUpdateNode = useCallback((node: NodeData) => {
    if (!currentAgent) return;

    const updatedNodes = currentAgent.nodes.map(n =>
      n.id === node.id ? node : n
    );

    setCurrentAgent({
      ...currentAgent,
      nodes: updatedNodes,
    });
    setHasUnsavedChanges(true);
    toast.success('Node updated');
  }, [currentAgent]);

  const handleUpdateAgent = useCallback((agent: AgentConfig) => {
    setCurrentAgent(agent);
    setAgents(agents.map(a => (a.id === agent.id ? agent : a)));
    setHasUnsavedChanges(true);
  }, [agents]);

  const handleVersionCreated = useCallback((agent: AgentConfig) => {
    setCurrentAgent(agent);
    setAgents(agents.map(a => (a.id === agent.id ? agent : a)));
    setHasUnsavedChanges(false);
  }, [agents]);

  const handleToggleTextMode = useCallback(() => {
    if (isTextMode && currentAgent) {
      if (currentAgent.originalPrompt !== undefined) {
        // Agent was PFG-generated: save edited prompt separately, keep originalPrompt immutable
        const updatedAgent = { ...currentAgent, editedPrompt: textContent };
        setCurrentAgent(updatedAgent);
        saveAgent(updatedAgent);
        setHasUnsavedChanges(false);
        toast.success('Prompt updated. Use Re-sync to rebuild the graph.');
      } else {
        // Manually created agent: parse text back into graph nodes
        const updatedAgent = textToAgent(textContent, currentAgent);
        setCurrentAgent(updatedAgent);
        setHasUnsavedChanges(true);
        toast.success('Graph updated from text');
      }
    }
    setIsTextMode(!isTextMode);
  }, [isTextMode, textContent, currentAgent]);

  const handleTextChange = useCallback((text: string) => {
    setTextContent(text);
  }, []);

  const handleSaveSettings = useCallback((settings: AgentConfig['settings']) => {
    if (!currentAgent) return;

    const updatedAgent = {
      ...currentAgent,
      settings,
    };

    setCurrentAgent(updatedAgent);
    saveAgent(updatedAgent);
    setAgents(agents.map(a => (a.id === updatedAgent.id ? updatedAgent : a)));
    toast.success('Settings saved');
  }, [currentAgent, agents]);

  const handleSelectTemplate = useCallback((agent: AgentConfig) => {
    const agentNoVersion = { ...agent, currentVersionId: undefined };
    saveAgent(agentNoVersion);
    setAgents([...agents, agentNoVersion]);
    setCurrentAgent(agentNoVersion);
    setHasUnsavedChanges(false);
    toast.success('Template loaded');
  }, [agents]);

  const handleRestoreVersion = useCallback((agent: AgentConfig) => {
    setCurrentAgent(agent);
    saveAgent(agent);
    setAgents(agents.map(a => (a.id === agent.id ? agent : a)));
    setHasUnsavedChanges(false);
    toast.success('Version restored');
  }, [agents]);

  const handleAutoLayout = useCallback(() => {
    if (!currentAgent) return;

    const layoutedNodes = applyAutoLayout(currentAgent.nodes, currentAgent.connections);
    const updatedAgent = {
      ...currentAgent,
      nodes: layoutedNodes,
    };

    setCurrentAgent(updatedAgent);
    setHasUnsavedChanges(true);
    toast.success('Nodes arranged automatically');
  }, [currentAgent]);

  const handleForceLayout = useCallback(() => {
    if (!currentAgent) return;

    import('@/lib/graph/force-directed-layout').then(({ applyForceDirectedLayout }) => {
      const layoutedNodes = applyForceDirectedLayout(currentAgent.nodes, currentAgent.connections);
      const updatedAgent = {
        ...currentAgent,
        nodes: layoutedNodes,
      };

      setCurrentAgent(updatedAgent);
      setHasUnsavedChanges(true);
      toast.success('Applied force-directed layout');
    });
  }, [currentAgent]);

  const handleAnalyzeCapabilities = useCallback(() => {
    if (!currentAgent) return;

    const capabilities = detectBasicCapabilities(currentAgent);

    const updatedAgent = {
      ...currentAgent,
      capabilities,
    };

    setCurrentAgent(updatedAgent);
    setAgents(agents.map(a => (a.id === updatedAgent.id ? updatedAgent : a)));
    saveAgent(updatedAgent);
    toast.success(`Found ${capabilities.length} permissions`);
  }, [currentAgent, agents]);

  const handleReSyncRun = useCallback(async () => {
    const agent = currentAgent;
    if (!agent) {
      toast.error('No agent loaded');
      return;
    }
    if (reSyncTimerRef.current) clearTimeout(reSyncTimerRef.current);
    setReSyncRunning(true);
    try {
      const { reSyncGraphToPrompt } = await import('@/lib/graph/graph-to-prompt');
      const result = await reSyncGraphToPrompt(agent);
      const rows = diffLines(result.originalPrompt, result.reconstructedPrompt);
      const stats = computeDiffStats(rows);
      setReSyncCache(result);
      setReSyncSummary({ similarity: result.similarity, added: stats.added, removed: stats.removed });
      setReSyncDirty(false);
      setReSyncDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Re-sync failed');
    } finally {
      setReSyncRunning(false);
    }
  }, [currentAgent]);

  const handleGraphChatEdit = useCallback(async (message: string, useExperimental?: boolean) => {
    if (!currentAgent) throw new Error('No agent loaded');
    const apiKey = currentAgent.settings?.apiKey;
    if (!apiKey) throw new Error('No API key configured. Go to Settings.');

    // Capture snapshot BEFORE the edit — used by Decline to revert
    const snapshot = currentAgent;

    let updatedAgent: AgentConfig;
    let editResult: import('@/lib/ai/graph-edit-agent').GraphEditResult;
    let usedPartialGraph = false;
    let detectedNodeIds: string[] | undefined;
    let formatInfo: any;

    if (useExperimental) {
      const { graphEditAgentExperimental } = await import('@/lib/ai/graph-edit-agent-experimental');
      const result = await graphEditAgentExperimental({
        userMessage: message,
        currentAgent,
        apiKey,
        selectedNodeId,
        onChunk: () => { },
      });
      updatedAgent = result.agent;
      editResult = result.editResult;
      usedPartialGraph = result.usedPartialGraph;
      detectedNodeIds = result.detectedNodeIds;
      formatInfo = result.formatInfo;
    } else {
      const result = await graphEditAgent({
        userMessage: message,
        currentAgent,
        apiKey,
        onChunk: () => { },
      });
      updatedAgent = result.agent;
      editResult = result.editResult;
      formatInfo = result.formatInfo;
    }

    const stats = {
      addedNodes: editResult.newNodes.length,
      addedConnections: editResult.newConnections.length,
      removedNodes: editResult.removedNodeIds.length,
      removedConnections: editResult.removedConnectionIds.length,
      updatedNodes: editResult.updatedNodes.length,
    };

    // Auto-create sub-agents for any pending AGENT nodes
    const pendingAgentNodes = updatedAgent.nodes.filter(
      n => n.type === 'AGENT' && n.config?.linkedAgentId === 'pending'
    );

    const newSubAgents: AgentConfig[] = [];
    if (pendingAgentNodes.length > 0) {
      for (const node of pendingAgentNodes) {
        const role = (node.config?.agentRole as string) || node.label.replace(/\s*Agent$/i, '');
        const subAgentId = `agent-sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // Create a minimal sub-agent config
        const subAgent: AgentConfig = {
          id: subAgentId,
          name: `${role} Agent`,
          agentRole: role,
          parentAgentId: updatedAgent.id,
          nodes: [],
          connections: [],
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          settings: updatedAgent.settings ? { ...updatedAgent.settings } : {
            llmProvider: 'gemini',
            apiKey: '',
            model: DEFAULT_GEMINI_MODEL,
            temperature: 0,
          },
        };

        // Update the node's linkedAgentId from "pending" to the real sub-agent ID
        const nodeIdx = updatedAgent.nodes.findIndex(n => n.id === node.id);
        if (nodeIdx >= 0) {
          updatedAgent = {
            ...updatedAgent,
            nodes: updatedAgent.nodes.map((n, i) =>
              i === nodeIdx
                ? { ...n, config: { ...n.config, linkedAgentId: subAgentId } }
                : n
            ),
          };
        }

        newSubAgents.push(subAgent);
      }

      // Update master's childAgentIds
      const existingChildIds = updatedAgent.childAgentIds ?? [];
      updatedAgent = {
        ...updatedAgent,
        childAgentIds: [...existingChildIds, ...newSubAgents.map(s => s.id)],
      };
    }

    // Show proposed state on canvas immediately for diff preview
    // History + save deferred until Accept
    setCurrentAgent(updatedAgent);
    setPendingEdit({ snapshot, proposed: updatedAgent, stats, summary: editResult.summary });

    if (newSubAgents.length > 0) {
      setAgents(prev => [...prev.map(a => a.id === updatedAgent.id ? updatedAgent : a), ...newSubAgents]);
    }

    return { summary: editResult.summary, stats, usedPartialGraph, detectedNodeIds, formatInfo };
  }, [currentAgent, selectedNodeId, agents]);

  const handleAcceptEdit = useCallback(() => {
    if (!pendingEdit) return;
    // Commit to undo history and save on Accept
    if (historyRef.current) {
      historyRef.current = addToHistory(historyRef.current, pendingEdit.snapshot);
    }
    // Update editedPrompt so the reconstructed prompt reflects new nodes
    // Preserve the editedPrompt from applyGraphEdits if it exists (it has correct AST placement);
    // only fall back to agentToText() for manual edits that don't produce an editedPrompt.
    const accepted = {
      ...pendingEdit.proposed,
      editedPrompt: pendingEdit.proposed.editedPrompt ?? agentToText(pendingEdit.proposed),
    };

    // Automatically create a version for the AI edit
    const acceptedWithVersion = autoCommit(accepted, `AI: ${pendingEdit.summary}`);

    setCurrentAgent(acceptedWithVersion);
    setAgents(prev => prev.map(a => a.id === acceptedWithVersion.id ? acceptedWithVersion : a));
    setHasUnsavedChanges(false);
    saveAgent(acceptedWithVersion);
    setPendingEdit(null);
    setExistingNodeOpacity(0.7);
    // Clear isPending on chat messages so chat panel buttons disappear too
    const agentId = acceptedWithVersion.id;
    if (agentId) {
      setChatHistories(prev => {
        const msgs = prev[agentId];
        if (!msgs) return prev;
        return { ...prev, [agentId]: msgs.map(m => m.isPending ? { ...m, isPending: false } : m) };
      });
    }
    toast.success(pendingEdit.summary);
  }, [pendingEdit, autoCommit]);

  const handleDeclineEdit = useCallback(() => {
    if (!pendingEdit) return;
    const snapshotId = pendingEdit.snapshot.id;
    // Revert canvas to pre-edit snapshot
    setCurrentAgent(pendingEdit.snapshot);
    setPendingEdit(null);
    setExistingNodeOpacity(0.7);
    // Clear isPending on chat messages so chat panel buttons disappear too
    if (snapshotId) {
      setChatHistories(prev => {
        const msgs = prev[snapshotId];
        if (!msgs) return prev;
        return { ...prev, [snapshotId]: msgs.map(m => m.isPending ? { ...m, isPending: false } : m) };
      });
    }
    toast.info('Edit declined — graph restored.');
  }, [pendingEdit]);

  const handleAskQuestion = useCallback(async (message: string) => {
    if (!currentAgent) throw new Error('No agent loaded');
    const apiKey = currentAgent.settings?.apiKey;
    if (!apiKey) throw new Error('No API key configured.');
    const { graphChatAgent } = await import('@/lib/ai/graph-chat-agent');
    return graphChatAgent({ userMessage: message, currentAgent, apiKey });
  }, [currentAgent]);

  const handleNodeEdit = useCallback((nodeId: string, label: string, description?: string) => {
    if (!currentAgent) return;

    const updatedNodes = currentAgent.nodes.map(n =>
      n.id === nodeId ? { ...n, label, description } : n
    );

    const updatedAgent = { ...currentAgent, nodes: updatedNodes };
    if (historyRef.current) {
      historyRef.current = addToHistory(historyRef.current, updatedAgent);
    }
    setCurrentAgent(updatedAgent);
    setHasUnsavedChanges(true);
  }, [currentAgent]);

  const handleNodeDelete = useCallback((nodeId: string) => {
    if (!currentAgent) return;

    const deletedNode = currentAgent.nodes.find(n => n.id === nodeId);
    const updatedNodes = currentAgent.nodes.filter(n => n.id !== nodeId);
    const updatedConnections = currentAgent.connections.filter(
      c => c.source !== nodeId && c.target !== nodeId
    );

    const newAgent = {
      ...currentAgent,
      nodes: updatedNodes,
      connections: updatedConnections,
    };

    if (historyRef.current) {
      historyRef.current = addToHistory(historyRef.current, newAgent);
    }
    const committed = autoCommit(newAgent, `removed node: ${deletedNode?.label || nodeId}`);
    saveAgent(committed);
    setCurrentAgent(committed);
    setAgents(prev => prev.map(a => a.id === committed.id ? committed : a));
    setSelectedNodeId(null);
    setHasUnsavedChanges(false);
    toast.success('Node deleted');
  }, [currentAgent, autoCommit]);

  const handleEdgeClick = useCallback((edgeId: string) => {
    if (!currentAgent) return;
    const conn = currentAgent.connections.find(c => c.id === edgeId);
    if (conn) {
      setEditingEdge({ id: edgeId, condition: conn.condition || '' });
    }
  }, [currentAgent]);

  const handleUpdateEdgeLabel = useCallback((edgeId: string, condition: string) => {
    if (!currentAgent) return;

    const updatedConnections = currentAgent.connections.map(c =>
      c.id === edgeId ? { ...c, condition: condition || undefined } : c
    );

    const updatedAgent = { ...currentAgent, connections: updatedConnections };
    if (historyRef.current) {
      historyRef.current = addToHistory(historyRef.current, updatedAgent);
    }
    setCurrentAgent(updatedAgent);
    setHasUnsavedChanges(true);
    setEditingEdge(null);
    toast.success('Connection label updated');
  }, [currentAgent]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    if (!currentAgent) return;

    const updatedAgent = {
      ...currentAgent,
      connections: currentAgent.connections.filter(c => c.id !== edgeId),
    };

    if (historyRef.current) {
      historyRef.current = addToHistory(historyRef.current, updatedAgent);
    }
    setCurrentAgent(updatedAgent);
    setHasUnsavedChanges(true);
    setEditingEdge(null);
    toast.success('Connection removed');
  }, [currentAgent]);

  const handleUndo = useCallback(() => {
    if (!historyRef.current || !canUndo(historyRef.current)) return;

    historyRef.current = undo(historyRef.current);
    setCurrentAgent(historyRef.current.present);
    setHasUnsavedChanges(true);
    toast.success('Undone');
  }, []);

  const handleRedo = useCallback(() => {
    if (!historyRef.current || !canRedo(historyRef.current)) return;

    historyRef.current = redo(historyRef.current);
    setCurrentAgent(historyRef.current.present);
    setHasUnsavedChanges(true);
    toast.success('Redone');
  }, []);

  const handleCopyNode = useCallback(() => {
    if (!selectedNodeId || !currentAgent) return;

    const node = currentAgent.nodes.find(n => n.id === selectedNodeId);
    if (node) {
      setCopiedNode(node);
      toast.success('Node copied');
    }
  }, [selectedNodeId, currentAgent]);

  const handlePasteNode = useCallback(() => {
    if (!copiedNode || !currentAgent) return;

    const newNode: NodeData = {
      ...copiedNode,
      id: `node-${Date.now()}`,
      label: `${copiedNode.label} (Copy)`,
      position: {
        x: copiedNode.position.x + 50,
        y: copiedNode.position.y + 50,
      },
    };

    const updatedAgent = {
      ...currentAgent,
      nodes: [...currentAgent.nodes, newNode],
    };

    if (historyRef.current) {
      historyRef.current = addToHistory(historyRef.current, updatedAgent);
    }
    setCurrentAgent(updatedAgent);
    setHasUnsavedChanges(true);
    toast.success('Node pasted');
  }, [copiedNode, currentAgent]);

  const handleDuplicateNode = useCallback(() => {
    if (!selectedNodeId || !currentAgent) return;
    const node = currentAgent.nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    const newNode: NodeData = {
      ...node,
      id: `node-${Date.now()}`,
      label: `${node.label} (Copy)`,
      position: {
        x: (node.position?.x ?? 0) + 50,
        y: (node.position?.y ?? 0) + 50,
      },
    };

    const updatedAgent = { ...currentAgent, nodes: [...currentAgent.nodes, newNode] };
    if (historyRef.current) {
      historyRef.current = addToHistory(historyRef.current, updatedAgent);
    }
    setCurrentAgent(updatedAgent);
    setSelectedNodeId(newNode.id);
    setHasUnsavedChanges(true);
    toast.success('Node duplicated');
  }, [selectedNodeId, currentAgent]);

  const onInsertPattern = useCallback(
    (pattern: PromptPattern, position: { x: number; y: number }, connectToNodeId?: string) => {
      if (!currentAgent) return;
      const { updatedAgent } = insertPatternIntoGraph(currentAgent, pattern, position, connectToNodeId);
      const newHistory = addToHistory(historyRef.current!, updatedAgent);
      historyRef.current = newHistory;
      setCurrentAgent(updatedAgent);
      setHasUnsavedChanges(true);
      toast.success(`Pattern "${pattern.name}" inserted`);
    },
    [currentAgent]
  );

  const onOpenPatternBrowser = useCallback(
    (position: { x: number; y: number }, connectToNodeId?: string) => {
      patternInsertContextRef.current = { position, connectToNodeId };
      setPatternBrowserOpen(true);
    },
    []
  );

  const onPatternBrowserInsert = useCallback(
    (pattern: PromptPattern) => {
      const ctx = patternInsertContextRef.current;
      onInsertPattern(pattern, ctx?.position ?? { x: 200, y: 200 }, ctx?.connectToNodeId);
    },
    [onInsertPattern]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Ctrl+S — save (always, even when input focused)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl+F — node search (always)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && currentAgent) {
        e.preventDefault();
        setNodeSearchOpen(true);
        return;
      }

      // ? — open keyboard shortcuts (when not in input)
      if (e.key === '?' && !isInputFocused) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (isInputFocused) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedNodeId) {
        e.preventDefault();
        handleCopyNode();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'v' && copiedNode) {
        e.preventDefault();
        handlePasteNode();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedNodeId) {
        e.preventDefault();
        handleDuplicateNode();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        handleNodeDelete(selectedNodeId);
      }
    };

    const handleForceLayoutEvent = () => handleForceLayout();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('force-layout', handleForceLayoutEvent);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('force-layout', handleForceLayoutEvent);
    };
  }, [handleUndo, handleRedo, handleCopyNode, handlePasteNode, handleDuplicateNode, handleNodeDelete, handleSave, selectedNodeId, copiedNode, currentAgent, handleForceLayout]);

  // Auto-run re-sync in background when agent changes (debounced 4s) — only when opt-in is on
  useEffect(() => {
    if (!reSyncAutoRun || !currentAgent) return;
    reSyncAgentRef.current = currentAgent;
    if (reSyncCache) setReSyncDirty(true);
    if (reSyncTimerRef.current) clearTimeout(reSyncTimerRef.current);
    reSyncTimerRef.current = setTimeout(async () => {
      const agent = reSyncAgentRef.current;
      if (!agent || reSyncRunning) return;
      setReSyncRunning(true);
      try {
        const { reSyncGraphToPrompt } = await import('@/lib/graph/graph-to-prompt');
        const result = await reSyncGraphToPrompt(agent);
        const rows = diffLines(result.originalPrompt, result.reconstructedPrompt);
        const stats = computeDiffStats(rows);
        setReSyncCache(result);
        setReSyncSummary({ similarity: result.similarity, added: stats.added, removed: stats.removed });
        setReSyncDirty(false);
      } catch { /* fail silently for background runs */ }
      finally { setReSyncRunning(false); }
    }, 4000);
    return () => { if (reSyncTimerRef.current) clearTimeout(reSyncTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgent, reSyncAutoRun]);

  // Debounced live prompt fragment update for Create Pattern mode
  useEffect(() => {
    if (!patternSelectionMode || selectedPatternNodeIds.length === 0) {
      setPatternPromptFragment('');
      return;
    }
    const timer = setTimeout(() => {
      if (!currentAgent) return;
      const fragment = subgraphToPromptFragment(
        currentAgent.nodes,
        currentAgent.connections,
        selectedPatternNodeIds
      );
      setPatternPromptFragment(fragment);
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedPatternNodeIds, patternSelectionMode, currentAgent]);

  const handleAddComment = useCallback((content: string, nodeId?: string, mentions?: string[]) => {
    setComments(addComment(comments, content, currentUserName, nodeId));
  }, [comments, currentUserName]);

  const handleResolveComment = useCallback((commentId: string) => {
    setComments(resolveComment(comments, commentId));
  }, [comments]);

  const conflicts = currentAgent ? validateAgentConfig(currentAgent) : [];
  const conflictNodeIds = new Set(conflicts.flatMap(c => c.nodeIds));
  const selectedNode = currentAgent?.nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="flex flex-row h-screen bg-background overflow-hidden">
      {/* Activity rail — switches entire content view */}
      <EditorSidebarRail activePanel={editorPanel} onPanelChange={handlePanelChange} />

      {/* Full-page: Home dashboard */}
      {editorPanel === 'home' && (
        <EditorHomePage
          onOpenAgent={(id) => {
            getAgent(id).then(a => { if (a) { setCurrentAgent(a); setEditorPanel('editor') } })
          }}
          onNewAgent={() => { setCurrentAgent(null); setEditorPanel('editor') }}
          onGoToPrompts={() => setEditorPanel('prompts')}
        />
      )}

      {/* Full-page: Prompts browser */}
      {editorPanel === 'prompts' && (
        <EditorPromptsPage
          activeWorkspace={activeWorkspace}
          currentAgent={currentAgent}
          onOpenAgent={(id) => {
            getAgent(id).then(a => { if (a) { setCurrentAgent(a); setEditorPanel('editor') } })
          }}
          onNewAgent={() => {
            setCurrentAgent(null)
            setEditorPanel('editor')
          }}
          onDeleteAgent={handleDeleteAgent}
        />
      )}

      {/* Full-page: Agent Hub */}
      {editorPanel === 'hub' && (
        <HubPanel
          onOpenAgent={(agentId) => {
            getAgent(agentId).then(a => { if (a) { setCurrentAgent(a); setEditorPanel('editor') } })
          }}
          onGoToPrompts={() => setEditorPanel('prompts')}
        />
      )}

      {/* Full-page: MCP Server */}
      {editorPanel === 'mcp' && (
        <McpSidebarPanel />
      )}

      {/* Full-page: Pattern Library */}
      {editorPanel === 'patterns' && (
        <EditorPatternsPage
          currentAgent={currentAgent}
          onInsertPattern={(updated) => { setCurrentAgent(updated); setEditorPanel('editor') }}
        />
      )}

      {/* Full-page: Groups */}
      {editorPanel === 'groups' && (
        <EditorGroupsPage onOpenAgent={(id) => {
          getAgent(id).then(agent => {
            if (agent) { setCurrentAgent(agent); setEditorPanel('editor') }
          })
        }} />
      )}

      {/* Full-page: Settings */}
      {editorPanel === 'settings' && (
        <EditorSettingsPage activeAgentName={currentAgent?.name ?? null} />
      )}

      {/* Full-page: Profile */}
      {editorPanel === 'profile' && (
        <EditorProfilePage />
      )}

      {/* Editor view — only visible when panel === 'editor' */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden relative ${editorPanel !== 'editor' ? 'hidden' : ''}`}>
      {!isInitialized ? (
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4 text-foreground text-glow animate-pulse">Initializing Ecosystem...</h1>
            <p className="text-muted-foreground transition-all duration-700 delay-500 opacity-80 mb-8">Preparing your workspace...</p>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          </div>
        </div>
      ) : !currentAgent ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-background p-8 text-center overflow-y-auto">
          <div className="max-w-2xl w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Logo mark */}
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <NetworkIcon className="w-10 h-10 text-primary" />
            </div>

            {/* Title + tagline */}
            <h1 className="text-5xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
              MAP
            </h1>
            <p className="text-lg font-medium text-primary mb-4 tracking-wide uppercase text-xs">
              Model Attention Path
            </p>
            <p className="text-xl text-muted-foreground mb-3 leading-relaxed">
              A self-hosted visual editor for designing, versioning, and sharing AI agent workflows.
            </p>
            <p className="text-base text-muted-foreground/80 mb-10 leading-relaxed max-w-lg mx-auto">
              Describe what your agent should do in plain text — MAP turns it into a structured graph of nodes and edges.
              Edit visually, track every change like git, collaborate in real time, and push finished prompts directly to
              Claude Code, Cursor, or Codex via the built-in MCP server.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 justify-center mb-10">
              {[
                { icon: Sparkles, label: 'AI Generation' },
                { icon: GitFork, label: 'Version Control' },
                { icon: Users, label: 'Collaboration' },
                { icon: Server, label: 'MCP Server' },
                { icon: Shield, label: 'DAG Validation' },
                { icon: BookOpen, label: 'Pattern Library' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm font-medium">
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </span>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
              <Button onClick={handleCreateAgent} size="lg" className="h-14 px-8 rounded-2xl text-lg font-semibold shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all">
                <Plus className="mr-2 h-6 w-6" /> Create with AI
              </Button>
              <Button onClick={handleSkipToEditor} variant="outline" size="lg" className="h-14 px-8 rounded-2xl text-lg font-semibold border-2">
                <Layout className="mr-2 h-6 w-6" /> Open Full Editor
              </Button>
              <Button onClick={handleImportAgent} variant="ghost" size="lg" className="h-14 px-8 rounded-2xl text-lg font-semibold">
                Import Agent
              </Button>
            </div>

            {/* Docs link */}
            <button
              onClick={() => router.push('/introduction')}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Read the full introduction
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <Toolbar
            agentName={currentAgent.name}
            onAddNode={handleAddNode}
            onSave={handleSave}
            onSimulate={handleSimulate}
            onSettings={() => setSettingsOpen(true)}
            onOpenTemplates={() => setTemplatesOpen(true)}
            onOpenVersions={() => setVersionsOpen(true)}
            onAutoLayout={handleAutoLayout}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onReSyncRun={handleReSyncRun}
            onReSyncView={() => setReSyncDialogOpen(true)}
            reSyncSummary={reSyncSummary}
            reSyncRunning={reSyncRunning}
            reSyncDirty={reSyncDirty}
            reSyncAutoRun={reSyncAutoRun}
            onReSyncAutoRunToggle={() => setReSyncAutoRun(v => !v)}
            onOpenJsonParser={() => setJsonParserOpen(true)}
            onOpenConflictAnalyzer={() => setConflictAnalyzerOpen(true)}
            onOpenExportJson={() => setExportJsonOpen(true)}
            canUndo={historyRef.current ? canUndo(historyRef.current) : false}
            canRedo={historyRef.current ? canRedo(historyRef.current) : false}
            analyzerRiskCount={analyzerRiskCount}
            conflictCount={conflicts.length}
            conflicts={conflicts}
            onConflictNodeClick={(nodeId) => {
              setSelectedNodeId(nodeId);
              handleHighlightNode(nodeId);
            }}
            hasUnsavedChanges={hasUnsavedChanges}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenMcpPanel={() => setEditorPanel('mcp')}
            onOpenGenerator={handleCreateAgent}
            currentGroupId={currentAgent?.groupId}
            onGroupChange={(groupId) => {
              if (!currentAgent) return;
              const updated = { ...currentAgent, groupId };
              setCurrentAgent(updated);
              saveAgent(updated);
            }}
          />


          {/* Multi-agent tab bar */}
          {currentFamily && masterAgent && (
            <AgentTabBar
              family={currentFamily}
              masterAgent={masterAgent}
              activeAgentId={currentAgent.id}
              navigationStack={navigationStack}
              onSelectAgent={(id) => {
                const target = agents.find(a => a.id === id);
                if (target) {
                  setCurrentAgent(target);
                  setSelectedNodeId(null);
                  // Reset navigation stack when using tabs
                  if (id === masterAgent.id) {
                    setNavigationStack([]);
                  } else {
                    setNavigationStack([masterAgent.id]);
                  }
                }
              }}
              onNavigateBack={handleNavigateBack}
            />
          )}

          <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={20} minSize={18} maxSize={35}>
              <AgentTree
                agents={agents}
                selectedAgentId={currentAgent?.id || ''}
                onSelectAgent={handleSelectAgent}
                onCreateAgent={handleCreateAgent}
                onDeleteAgent={handleDeleteAgent}
                onExportAgent={handleExportAgent}
                onImportAgent={handleImportAgent}
                isTextMode={isTextMode}
                onToggleTextMode={handleToggleTextMode}
                textContent={textContent}
                onTextChange={handleTextChange}
                onNodeHover={handleHighlightNode}
                selectedNodeId={selectedNodeId || undefined}
                demoAgent={DEMO_AGENT}
                demoAgents={DEMO_AGENTS}
                generationJob={generationJob}
                onDismissGenerationJob={() => setGenerationJob(null)}
                multiAgentJob={multiAgentJob}
                onDismissMultiAgentJob={() => setMultiAgentJob(null)}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={55} minSize={40}>
              <div className={`relative h-full ${patternSelectionMode ? 'ring-2 ring-inset ring-indigo-500/50' : ''}`}>
                <AgentCanvas
                  nodes={currentAgent?.nodes || []}
                  connections={currentAgent?.connections || []}
                  onNodesChange={handleNodesChange}
                  onConnectionsChange={handleConnectionsChange}
                  selectedNodeId={patternSelectionMode ? undefined : (selectedNodeId || undefined)}
                  onNodeSelect={(nodeId) => {
                    if (patternSelectionMode && nodeId) {
                      setSelectedPatternNodeIds((prev) =>
                        prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
                      );
                    } else {
                      setSelectedNodeId(nodeId);
                    }
                  }}
                  onNodeEdit={patternSelectionMode ? () => {} : handleNodeEdit}
                  onNodeDelete={handleNodeDelete}
                  conflictNodeIds={conflictNodeIds}
                  highlightedNodeId={highlightedNodeId || undefined}
                  edgeType={currentAgent?.edgeType || 'default'}
                  nodeConflictSeverity={nodeConflictSeverity}
                  nodeConflictCount={nodeConflictCount}
                  onNodeConflictClick={(nodeId) => {
                    setConflictFocusNodeId(nodeId);
                    handleHighlightNode(nodeId);
                    setConflictAnalyzerOpen(true);
                  }}
                  onAgentNodeDrillDown={handleDrillDown}
                  onSearchClick={() => setNodeSearchOpen(true)}
                  onEdgeClick={handleEdgeClick}
                  onInsertPattern={onInsertPattern}
                  onOpenPatternBrowser={onOpenPatternBrowser}
                  onToggleChat={() => setIsChatOpen(v => !v)}
                  isChatOpen={isChatOpen}
                  pendingDiff={pendingDiff}
                  existingNodeOpacity={pendingEdit ? existingNodeOpacity : 1}
                  onOpacityChange={setExistingNodeOpacity}
                  onAcceptEdit={pendingEdit ? handleAcceptEdit : undefined}
                  onDeclineEdit={pendingEdit ? handleDeclineEdit : undefined}
                  onAddNode={handleAddNode}
                  onOpenTemplates={() => setTemplatesOpen(true)}
                  onCreateTemplate={() => { setPatternSelectionMode(v => !v); setSelectedPatternNodeIds([]); setPatternPromptFragment(''); }}
                  isTemplateMode={patternSelectionMode}
                  selectedForTemplateIds={patternSelectionMode ? new Set(selectedPatternNodeIds) : undefined}
                />

              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
              {patternSelectionMode ? (
                <TemplateCreatorPanel
                  selectedNodeIds={selectedPatternNodeIds}
                  allNodes={currentAgent?.nodes ?? []}
                  promptFragment={patternPromptFragment}
                  originalPrompt={currentAgent?.originalPrompt}
                  apiKey={currentAgent?.settings?.apiKey}
                  onNodeDeselect={(id) => setSelectedPatternNodeIds((p) => p.filter((i) => i !== id))}
                  onNodesAiSelect={(ids, name, desc) => {
                    setSelectedPatternNodeIds(ids);
                    setAiSuggestedPatternName(name);
                    setAiSuggestedPatternDescription(desc);
                  }}
                  onSave={(overrideTemplate) => {
                    if (overrideTemplate) setAiExtractedTemplate(overrideTemplate);
                    setShowPatternSave(true);
                  }}
                  onClose={() => {
                    setPatternSelectionMode(false);
                    setSelectedPatternNodeIds([]);
                    setAiSuggestedPatternName('');
                    setAiSuggestedPatternDescription('');
                    setAiExtractedTemplate('');
                  }}
                />
              ) : showComments ? (
                <CommentsPanel
                  comments={comments}
                  selectedNodeId={selectedNodeId || undefined}
                  currentUser={currentUserName}
                  onAddComment={handleAddComment}
                  onResolveComment={handleResolveComment}
                />
              ) : (
                <PropertiesPanel
                  agent={currentAgent}
                  selectedNode={selectedNode}
                  onUpdateNode={handleUpdateNode}
                  onUpdateAgent={handleUpdateAgent}
                  conflicts={conflicts}
                  onNodeHover={handleHighlightNode}
                  onNodeSelect={(nodeId) => {
                    setSelectedNodeId(nodeId);
                    handleHighlightNode(nodeId);
                  }}
                  onAnalyzeCapabilities={handleAnalyzeCapabilities}
                  apiKey={currentAgent?.settings?.apiKey}
                  onApplyFix={(updatedAgent) => {
                    if (historyRef.current && currentAgent) {
                      historyRef.current = addToHistory(historyRef.current, currentAgent);
                    }
                    setCurrentAgent(updatedAgent);
                    setHasUnsavedChanges(true);
                  }}
                />
              )}
            </ResizablePanel>
          </ResizablePanelGroup>

          <GraphChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            currentAgent={currentAgent}
            apiKey={currentAgent?.settings?.apiKey}
            onApplyEdit={handleGraphChatEdit}
            onAskQuestion={handleAskQuestion}
            hasPendingEdit={!!pendingEdit}
            onAcceptEdit={handleAcceptEdit}
            onDeclineEdit={handleDeclineEdit}
            canUndo={historyRef.current ? canUndo(historyRef.current) : false}
            onUndo={handleUndo}
            messages={chatHistories[currentAgent.id] ?? []}
            onMessagesChange={(msgs) =>
              setChatHistories(prev => ({ ...prev, [currentAgent.id]: msgs }))
            }
            selectedNodeId={selectedNodeId}
          />
        </>
      )}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={currentAgent?.settings || { llmProvider: 'gemini', apiKey: '', model: 'gemini-3-flash-preview', temperature: 0 }}
        onSaveSettings={handleSaveSettings}
        onOpenMcpPanel={() => { setSettingsOpen(false); setEditorPanel('mcp'); }}
        graphRuleSettings={graphRuleSettings}
        onSaveGraphRuleSettings={(settings) => {
          setGraphRuleSettings(settings);
          saveGraphRuleSettings(settings);
        }}
      />

      {/* McpControlPanel and AgentHubDialog replaced by inline panels (editorPanel === 'mcp' / 'hub') */}

      <VersionControlDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        agent={currentAgent || agents[0] || null}
        onRestore={handleRestoreVersion}
        onVersionCreated={handleVersionCreated}
      />

      <SimulationStudioDialog
        open={simulationStudioOpen}
        onOpenChange={setSimulationStudioOpen}
        agent={currentAgent || agents[0] || null}
        onNodeHighlight={handleHighlightNode}
      />

      <AIGeneratorDialog
        open={aiGeneratorOpen}
        onOpenChange={setAiGeneratorOpen}
        onGenerate={handleGenerateAgent}
        onGenerationJobChange={setGenerationJob}
        apiKey={currentAgent?.settings?.apiKey}
        currentAgent={currentAgent}
        onPreGenerate={handlePreGenerate}
        activeWorkspace={activeWorkspace}
      />

      <ReSyncDialog
        open={reSyncDialogOpen}
        onOpenChange={setReSyncDialogOpen}
        currentAgent={currentAgent}
        apiKey={currentAgent?.settings?.apiKey}
        preloadedResult={reSyncCache}
        onResultComputed={(result) => {
          const rows = diffLines(result.originalPrompt, result.reconstructedPrompt);
          const stats = computeDiffStats(rows);
          setReSyncCache(result);
          setReSyncSummary({ similarity: result.similarity, added: stats.added, removed: stats.removed });
          setReSyncDirty(false);
        }}
        onRegenerate={handleGenerateAgent}
        versions={currentAgent ? getAllVersions(currentAgent.id) : []}
      />

      <JsonParserDialog
        open={jsonParserOpen}
        onOpenChange={setJsonParserOpen}
        onParse={(agent) => {
          saveAgent(agent);
          setAgents(prev => [...prev, agent]);
          setCurrentAgent(agent);
          setHasUnsavedChanges(false);
          toast.success('Graph built from JSON');
        }}
      />


      <AIConflictDialog
        open={conflictAnalyzerOpen}
        onOpenChange={(v) => { setConflictAnalyzerOpen(v); if (!v) setConflictFocusNodeId(null); }}
        agent={currentAgent}
        apiKey={currentAgent?.settings?.apiKey}
        onNodeHighlight={handleHighlightNode}
        onIssuesChange={setConflictIssues}
        onApplyFix={(updatedAgent) => {
          if (historyRef.current && currentAgent) {
            historyRef.current = addToHistory(historyRef.current, currentAgent);
          }
          setCurrentAgent(updatedAgent);
          setHasUnsavedChanges(true);
        }}
        focusNodeId={conflictFocusNodeId}
      />

      <ExportJsonDialog
        open={exportJsonOpen}
        onOpenChange={setExportJsonOpen}
        agent={currentAgent}
      />

      <PatternBrowserDialog
        open={patternBrowserOpen}
        onOpenChange={setPatternBrowserOpen}
        onInsert={onPatternBrowserInsert}
      />

      <PatternSaveDialog
        open={showPatternSave}
        onClose={() => setShowPatternSave(false)}
        initialName={aiSuggestedPatternName || suggestPatternName(
          (currentAgent?.nodes ?? []).filter((n) => selectedPatternNodeIds.includes(n.id))
        )}
        initialDescription={aiSuggestedPatternDescription}
        initialComplexity={suggestComplexity(selectedPatternNodeIds.length)}
        onSave={async (meta) => {
          if (!currentAgent) return;
          const selectedNodes = currentAgent.nodes.filter((n) => selectedPatternNodeIds.includes(n.id));
          const selectedConns = currentAgent.connections.filter(
            (c) => selectedPatternNodeIds.includes(c.source) && selectedPatternNodeIds.includes(c.target)
          );
          const hasIncoming = new Set(selectedConns.map((c) => c.target));
          const entryNode = selectedNodes.find((n) => !hasIncoming.has(n.id)) ?? selectedNodes[0];
          const hasOutgoing = new Set(selectedConns.map((c) => c.source));
          const exitNodes = selectedNodes.filter((n) => !hasOutgoing.has(n.id));
          await fetch('/api/patterns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...meta,
              nodes: selectedNodes,
              connections: selectedConns,
              entryNodeId: entryNode?.id ?? '',
              exitNodeIds: exitNodes.map((n) => n.id),
              promptFragment: aiExtractedTemplate || patternPromptFragment,
            }),
          });
          setPatternSelectionMode(false);
          setSelectedPatternNodeIds([]);
          setAiSuggestedPatternName('');
          setAiSuggestedPatternDescription('');
          setAiExtractedTemplate('');
          toast.success('Pattern saved!');
        }}
      />

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      {multiAgentDetection && (
        <MultiAgentWizard
          key={wizardKey}
          open={multiAgentWizardOpen}
          onOpenChange={setMultiAgentWizardOpen}
          detection={multiAgentDetection}
          masterPrompt={pendingMasterPrompt}
          apiKey={pendingApiKey || currentAgent?.settings?.apiKey || ''}
          onComplete={handleMultiAgentComplete}
          onCancel={() => setMultiAgentWizardOpen(false)}
          onJobChange={setMultiAgentJob}
        />
      )}

      <button
        onClick={() => setShowComments(!showComments)}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-all hover:scale-110 active:scale-95 z-50 shadow-primary/40 border border-primary/20 backdrop-blur"
        title={showComments ? 'Show Properties' : 'Show Comments'}
      >
        {showComments ? <Layout className="h-5 w-5" /> : <Database className="h-5 w-5" />}
      </button>

      <CompilationStatus />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.isFamily ? 'agent family' : 'agent'}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.isFamily
                ? `This will permanently delete "${deleteConfirm.name}" and all its sub-agents. This action cannot be undone.`
                : `This will permanently delete "${deleteConfirm?.name}". This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleConfirmDelete(deleteConfirm.agentId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Node search overlay */}
      {nodeSearchOpen && currentAgent && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => { setNodeSearchOpen(false); setNodeSearchQuery(''); }}>
          <div className="w-full max-w-md bg-background border rounded-xl shadow-2xl p-2" onClick={(e) => e.stopPropagation()}>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search nodes by name or type..."
                value={nodeSearchQuery}
                onChange={(e) => setNodeSearchQuery(e.target.value)}
                className="pl-10"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setNodeSearchOpen(false); setNodeSearchQuery(''); }
                }}
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {currentAgent.nodes
                .filter(n => {
                  if (!nodeSearchQuery) return true;
                  const q = nodeSearchQuery.toLowerCase();
                  return n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q) || n.description?.toLowerCase().includes(q);
                })
                .map(n => (
                  <button
                    key={n.id}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm flex items-center gap-2 transition-colors"
                    onClick={() => {
                      setSelectedNodeId(n.id);
                      handleHighlightNode(n.id);
                      setNodeSearchOpen(false);
                      setNodeSearchQuery('');
                    }}
                  >
                    <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{n.type}</span>
                    <span className="font-medium truncate">{n.label}</span>
                  </button>
                ))}
              {currentAgent.nodes.filter(n => {
                if (!nodeSearchQuery) return true;
                const q = nodeSearchQuery.toLowerCase();
                return n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q) || n.description?.toLowerCase().includes(q);
              }).length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-4">No matching nodes</p>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Connection editor dialog */}
      <AlertDialog open={!!editingEdge} onOpenChange={(open) => { if (!open) setEditingEdge(null); }}>
        <AlertDialogContent className="sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Add a condition label or delete this connection entirely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder="e.g. if approved, on error, default..."
              value={editingEdge?.condition ?? ''}
              onChange={(e) => setEditingEdge(prev => prev ? { ...prev, condition: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editingEdge) {
                  handleUpdateEdgeLabel(editingEdge.id, editingEdge.condition);
                }
              }}
            />
          </div>
          <AlertDialogFooter className="flex-row gap-2 sm:justify-between">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:mr-auto"
              onClick={() => editingEdge && handleDeleteEdge(editingEdge.id)}
            >
              Delete Connection
            </AlertDialogAction>
            <div className="flex gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => editingEdge && handleUpdateEdgeLabel(editingEdge.id, editingEdge.condition)}>
                Save Label
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      </div>{/* end main editor content */}

      {/* Templates dialog — accessible from canvas toolbar */}
      <TemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onSelectTemplate={(agent) => {
          setCurrentAgent(agent);
          setTemplatesOpen(false);
          setEditorPanel('editor');
        }}
      />

    </div>
  );
}

// ── Editor Sidebar Rail ───────────────────────────────────────────────────────

function EditorSidebarRail({
  activePanel,
  onPanelChange,
}: {
  activePanel: EditorPanel
  onPanelChange: (p: EditorPanel) => void
}) {
  const { user: railUser } = useCurrentUser()

  const mainItems = [
    { panel: 'home' as EditorPanel, icon: HomeIcon, label: 'Home' },
    { panel: 'editor' as EditorPanel, icon: NetworkIcon, label: 'Editor' },
    { panel: 'prompts' as EditorPanel, icon: FileText, label: 'Prompts' },
    { panel: 'hub' as EditorPanel, icon: Globe, label: 'Agent Hub' },
    { panel: 'mcp' as EditorPanel, icon: Server, label: 'MCP Server' },
    { panel: 'patterns' as EditorPanel, icon: Library, label: 'Pattern Library' },
    { panel: 'groups' as EditorPanel, icon: Building2, label: 'Groups' },
    { panel: 'wiki' as EditorPanel, icon: BookOpen, label: 'Wiki' },
  ]

  const RailBtn = ({ panel, icon: Icon, label }: { panel: EditorPanel; icon: React.ElementType; label: string }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onPanelChange(panel)}
          className={`w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
            activePanel === panel
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )

  const initials = railUser?.name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() ?? '?'

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="flex flex-col w-12 h-full bg-background border-r border-border/50 shrink-0">
        {/* V logo — click to go home */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onPanelChange('home')}
              className="h-11 border-b border-border/50 flex items-center justify-center shrink-0 w-full hover:bg-muted/50 transition-colors"
            >
              <div className="w-5 h-5 rounded bg-gradient-to-br from-chart-1 to-chart-2 flex items-center justify-center">
                <span className="text-white font-bold text-[9px]">V</span>
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Home</TooltipContent>
        </Tooltip>
        <nav className="flex-1 py-2 flex flex-col items-center gap-1">
          {mainItems.map(item => <RailBtn key={item.panel} {...item} />)}
        </nav>
        {/* Bottom: Settings + Profile avatar */}
        <div className="py-2 flex flex-col items-center gap-1 border-t border-border/50">
          <RailBtn panel="settings" icon={SettingsIcon} label="Settings" />
          {/* Profile avatar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onPanelChange('profile')}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${
                  activePanel === 'profile'
                    ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                    : 'hover:ring-2 hover:ring-border hover:ring-offset-1 hover:ring-offset-background'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary">
                  {initials}
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{railUser?.name ?? 'Profile'}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}

// ── Full-page: Prompts browser ────────────────────────────────────────────────

// ── PromptEditModal ───────────────────────────────────────────────────────────

type PromptListItem = {
  id: string
  name: string
  description: string | null
  updatedAt: string
  groupId: string | null
  isPublicInOrg: boolean
  ownerId: string
  hubMeta?: any
  tags?: string[]
  groups?: { id: string; name: string }[]
  lastComment?: { text: string; author: string; createdAt: string }
  lastChangeSummary?: string
  linkedAgents?: { id: string; name: string }[]
  pullCount?: number
}

interface PromptEditModalProps {
  agent: PromptListItem
  groups: { id: string; name: string }[]
  onClose: () => void
  onSaved: (updated: PromptListItem) => void
}

function PromptEditModal({ agent, groups, onClose, onSaved }: PromptEditModalProps) {
  const existingGroupIds: string[] = agent.hubMeta?.groupIds ?? (agent.groupId ? [agent.groupId] : [])
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description ?? '')
  const [isPublic, setIsPublic] = useState(agent.isPublicInOrg)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(existingGroupIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleGroup(id: string) {
    setSelectedGroupIds(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const primaryGroupId = selectedGroupIds[0] ?? null
      const hubMeta = { ...(agent.hubMeta ?? {}), groupIds: selectedGroupIds }
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          groupId: primaryGroupId,
          isPublicInOrg: isPublic,
          hubMeta,
        }),
      })
      if (!res.ok) { setError('Failed to save'); setSaving(false); return }
      const data = await res.json()
      onSaved({ ...agent, ...data.agent, hubMeta })
      onClose()
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col gap-0 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <h2 className="text-sm font-semibold">Edit Prompt</h2>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/60 text-foreground"
              placeholder="Prompt name"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/60 text-foreground resize-none placeholder:text-muted-foreground"
              placeholder="Short description of what this prompt does…"
            />
          </div>

          {/* Visibility */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-muted-foreground">Visibility</label>
            <button
              type="button"
              onClick={() => setIsPublic(v => !v)}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border transition-colors ${
                isPublic
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-muted text-muted-foreground border-border/50 hover:border-border'
              }`}
            >
              {isPublic ? <><Globe className="h-3 w-3" /> Public</> : <><Lock className="h-3 w-3" /> Private</>}
            </button>
          </div>

          {/* Groups */}
          {groups.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Groups</label>
              <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/30">
                {groups.map(g => (
                  <label key={g.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <span className="text-sm">{g.name}</span>
                    {selectedGroupIds[0] === g.id && (
                      <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">primary</span>
                    )}
                  </label>
                ))}
              </div>
              {selectedGroupIds.length > 1 && (
                <p className="text-[11px] text-muted-foreground">First selected group is the primary group. Others are additional memberships.</p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50 bg-muted/20">
          <button onClick={onClose} className="h-8 px-3 text-sm rounded-md hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-8 px-4 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EditorPromptsPage ─────────────────────────────────────────────────────────

function EditorPromptsPage({
  activeWorkspace,
  currentAgent,
  onOpenAgent,
  onNewAgent,
  onDeleteAgent,
}: {
  activeWorkspace: { id: string | null; name: string }
  currentAgent: AgentConfig | null
  onOpenAgent: (id: string) => void
  onNewAgent: () => void
  onDeleteAgent: (id: string) => void
}) {
  const { user } = useCurrentUser()
  const [agentList, setAgentList] = useState<PromptListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAgent, setEditingAgent] = useState<PromptListItem | null>(null)
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string }[]>([])
  const [filters, setFilters] = useState<PromptFilters>(DEFAULT_FILTERS)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  const currentUserId = user?.id ?? ''
  const filteredPrompts = useMemo(
    () => applyFilters(agentList, filters, currentUserId),
    [agentList, filters, currentUserId]
  )
  const derivedTags = useMemo(() => extractTags(agentList), [agentList])

  const loadAgents = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (activeWorkspace.id) params.set('group', activeWorkspace.id)
    else params.set('mine', 'true')
    fetch(`/api/agents?${params}`)
      .then(r => r.json())
      .then(d => {
        const list = d.agents ?? []
        setAgentList(activeWorkspace.id === null ? list.filter((a: { groupId: string | null }) => a.groupId === null) : list)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeWorkspace])

  useEffect(() => { loadAgents() }, [loadAgents])

  useEffect(() => {
    fetch('/api/groups')
      .then(r => r.json())
      .then(d => setAvailableGroups(d.groups ?? []))
      .catch(() => {})
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('Delete this prompt? This cannot be undone.')) return
    await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    setAgentList(prev => prev.filter(a => a.id !== id))
    onDeleteAgent(id)
  }

  function handleSaved(updated: typeof agentList[number]) {
    setAgentList(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
  }

  async function handleEditGroups(promptId: string, groupIds: string[]) {
    const primaryGroupId = groupIds[0] ?? null
    await fetch(`/api/agents/${promptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: primaryGroupId,
        hubMeta: { groupIds },
      }),
    })
    setAgentList(prev =>
      prev.map(p =>
        p.id === promptId
          ? {
              ...p,
              groupId: primaryGroupId,
              groups: availableGroups.filter(g => groupIds.includes(g.id)),
              hubMeta: { ...(p.hubMeta ?? {}), groupIds },
            }
          : p
      )
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur shrink-0">
        <div className="px-6 h-14 flex items-center gap-3">
          <h1 className="text-base font-semibold">Prompts</h1>
          <div className="flex-1" />
          <button
            onClick={onNewAgent}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Prompt
          </button>
        </div>
      </header>

      {/* Workspace label */}
      <div className="px-6 py-3 border-b border-border/30">
        <p className="text-sm font-medium">{activeWorkspace.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {loading ? 'Loading…' : `${filteredPrompts.length} prompt${filteredPrompts.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        {/* Filter bar */}
        <PromptFilterBar
          filters={filters}
          availableGroups={availableGroups}
          availableTags={derivedTags}
          onChange={setFilters}
        />

        {loading ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-1">No prompts yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {filters.search ? 'No results for your search.' : `No prompts in ${activeWorkspace.name}. Create one to get started.`}
            </p>
            {!filters.search && (
              <button
                onClick={onNewAgent}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> New Prompt
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPrompts.map(a => (
              <PromptCard
                key={a.id}
                prompt={a}
                isExpanded={expandedCardId === a.id}
                onToggle={() => setExpandedCardId(prev => prev === a.id ? null : a.id)}
                onDelete={async (id) => {
                  await fetch(`/api/agents/${id}`, { method: 'DELETE' })
                  setAgentList(prev => prev.filter(p => p.id !== id))
                  onDeleteAgent(id)
                }}
                onEditGroups={handleEditGroups}
                onEditDetails={(p) => setEditingAgent(p)}
                onOpenInEditor={(id) => onOpenAgent(id)}
                availableGroups={availableGroups}
              />
            ))}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingAgent && (
        <PromptEditModal
          agent={editingAgent}
          groups={availableGroups}
          onClose={() => setEditingAgent(null)}
          onSaved={updated => { handleSaved(updated); setEditingAgent(null) }}
        />
      )}
    </div>
  )
}

// ── Full-page: Wiki ───────────────────────────────────────────────────────────

const WIKI_SECTIONS_FP = [
  { id: 'fp-getting-started', label: 'Getting Started' },
  { id: 'fp-create-prompt', label: 'Creating a Prompt' },
  { id: 'fp-node-types', label: 'Node Types' },
  { id: 'fp-permissions', label: 'Actions & Permissions' },
  { id: 'fp-shortcuts', label: 'Keyboard Shortcuts' },
  { id: 'fp-mcp', label: 'MCP Integration' },
]

const FP_NODE_TYPES = [
  { type: 'start', icon: '▶', color: '#22c55e', desc: 'Entry point — where agent execution begins.' },
  { type: 'end', icon: '■', color: '#ef4444', desc: 'Terminal node — agent execution ends here.' },
  { type: 'action', icon: '⚡', color: '#f97316', desc: 'Performs a task: API call, function, tool use.' },
  { type: 'decision', icon: '◆', color: '#eab308', desc: 'Branching logic — routes flow based on conditions.' },
  { type: 'tool_call', icon: '🔧', color: '#3b82f6', desc: 'Invokes an external tool or MCP function.' },
  { type: 'condition', icon: '?', color: '#a855f7', desc: 'Evaluates a boolean expression.' },
  { type: 'rule', icon: '📋', color: '#06b6d4', desc: 'Defines a constraint or policy rule.' },
  { type: 'step', icon: '→', color: '#64748b', desc: 'A sequential processing step.' },
  { type: 'persona', icon: '👤', color: '#ec4899', desc: 'Sets the agent identity and tone.' },
  { type: 'memory', icon: '🧠', color: '#8b5cf6', desc: 'Reads or writes agent memory/state.' },
  { type: 'loop', icon: '↻', color: '#14b8a6', desc: 'Repeats a block until a condition is met.' },
  { type: 'hook', icon: '🪝', color: '#f59e0b', desc: 'Lifecycle event — on_start, on_end, on_error.' },
]

const FP_PERMISSIONS = [
  { icon: '🌐', label: 'API & Integrations', color: 'text-blue-400', desc: 'External HTTP, webhooks, third-party APIs.' },
  { icon: '🗄️', label: 'Data & Storage', color: 'text-cyan-400', desc: 'Databases, files, memory, caches.' },
  { icon: '🗃️', label: 'Logging & Audit', color: 'text-teal-400', desc: 'Audit trails, telemetry, event logs.' },
  { icon: '📧', label: 'User Communication', color: 'text-indigo-400', desc: 'Emails, SMS, Slack, push notifications.' },
  { icon: '💰', label: 'Financial', color: 'text-amber-400', desc: 'Payments, refunds, billing.' },
  { icon: '💻', label: 'System & Infrastructure', color: 'text-red-400', desc: 'Shell, deployments, server access.' },
  { icon: '🔑', label: 'Auth & Permissions', color: 'text-purple-400', desc: 'Auth, tokens, role grants.' },
  { icon: '🤖', label: 'AI & LLM Calls', color: 'text-orange-400', desc: 'LLM models, embeddings, sub-agents.' },
]

const FP_SHORTCUTS = [
  { keys: 'Ctrl/Cmd+S', action: 'Save prompt' },
  { keys: 'Ctrl/Cmd+Z', action: 'Undo' },
  { keys: 'Ctrl/Cmd+Y', action: 'Redo' },
  { keys: 'Ctrl/Cmd+C', action: 'Copy node' },
  { keys: 'Ctrl/Cmd+V', action: 'Paste node' },
  { keys: 'Ctrl/Cmd+D', action: 'Duplicate node' },
  { keys: 'Delete', action: 'Remove selected node' },
  { keys: '?', action: 'Shortcuts dialog' },
  { keys: 'Ctrl/Cmd+F', action: 'Node search' },
  { keys: 'Escape', action: 'Deselect / close panel' },
]

function EditorWikiPage() {
  const [activeSection, setActiveSection] = useState('fp-getting-started')

  const scrollTo = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left nav */}
      <aside className="w-52 shrink-0 border-r border-border/50 py-6 px-3 overflow-y-auto">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Wiki</p>
        <nav className="space-y-0.5">
          {WIKI_SECTIONS_FP.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
                activeSection === s.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-10 px-8 space-y-20">

        <section id="fp-getting-started">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Getting Started</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            MAP is a visual AI agent architect. You describe what an agent should do — MAP turns it into an interactive graph, a structured representation of how the agent thinks and acts.
          </p>
          <div className="grid gap-4 sm:grid-cols-3 mb-8">
            {[
              { step: '1', title: 'Describe your agent', desc: 'Click "+ Generate Graph" and type what your agent should do. Gemini builds the full graph in seconds.' },
              { step: '2', title: 'Edit visually', desc: 'Drag nodes, add connections, or chat with the editor: "Add a validation step after intake."' },
              { step: '3', title: 'Export & use', desc: 'Copy the system prompt, export as JSON, or connect via the MCP server from Claude Desktop.' },
            ].map(item => (
              <div key={item.step} className="rounded-lg border border-border/50 bg-card p-4">
                <div className="h-7 w-7 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center mb-3">{item.step}</div>
                <h3 className="font-medium text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm">
            <p className="font-medium mb-2">Workspaces</p>
            <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
              <li>Your <strong className="text-foreground">Personal</strong> workspace is private — only you see it.</li>
              <li><strong className="text-foreground">Group</strong> workspaces are shared with group members.</li>
              <li>New prompts are automatically assigned to the active workspace.</li>
            </ul>
          </div>
        </section>

        <section id="fp-create-prompt">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Creating a Prompt</h2>
          <div className="space-y-6">
            {[
              {
                n: 1, title: 'Open the Prompts view',
                desc: 'Click the document icon in the left rail or go to the Prompts tab. Click "+ New Prompt" to start.',
                tip: null,
              },
              {
                n: 2, title: 'Choose: Generate with AI or start blank',
                desc: 'The editor welcome screen gives you two options.',
                tip: 'Generate with AI: describe your agent in plain English — Gemini builds a complete graph. Start blank: add nodes manually from the canvas.',
              },
              {
                n: 3, title: 'Edit the graph',
                desc: 'Click a node to edit its label. Drag from a handle to draw a connection. Chat with the editor for AI-assisted edits.',
                tip: null,
              },
              {
                n: 4, title: 'Save and export',
                desc: 'Press Ctrl+S to save. Use "Show Prompt" to copy the generated system prompt, or export as JSON.',
                tip: null,
              },
            ].map((item, i, arr) => (
              <div key={item.n} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">{item.n}</div>
                  {i < arr.length - 1 && <div className="w-px bg-border/50 flex-1 mt-2" />}
                </div>
                <div className="pb-4 flex-1">
                  <h3 className="font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{item.desc}</p>
                  {item.tip && (
                    <div className="rounded border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{item.tip}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="fp-node-types">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Node Types</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Every node has a type that controls how it behaves in the agent graph.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {FP_NODE_TYPES.map(t => (
              <div key={t.type} className="flex items-start gap-3 rounded-lg border border-border/40 bg-card p-3">
                <div
                  className="h-8 w-8 rounded flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: t.color + '33', color: t.color }}
                >
                  {t.icon}
                </div>
                <div>
                  <span className="text-xs font-semibold font-mono" style={{ color: t.color }}>{t.type}</span>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="fp-permissions">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Actions & Permissions</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Every node that performs a real-world action is classified by category and risk level. The Actions & Permissions panel (right sidebar in the editor) shows what your agent can do and whether those actions are protected by a Guard node.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 mb-6">
            {FP_PERMISSIONS.map(cat => (
              <div key={cat.label} className="rounded-lg border border-border/40 bg-card p-3 flex gap-3">
                <span className="text-xl shrink-0">{cat.icon}</span>
                <div>
                  <p className={`text-sm font-medium ${cat.color}`}>{cat.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cat.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 flex-wrap">
            {(['high', 'medium', 'low'] as const).map(level => (
              <div key={level} className="flex items-center gap-2 text-sm">
                <span className={`h-3 w-3 rounded-full ${level === 'high' ? 'bg-red-500' : level === 'medium' ? 'bg-amber-500' : 'bg-green-500'}`} />
                <span className="capitalize font-medium">{level} risk</span>
                <span className="text-muted-foreground text-xs">—</span>
                <span className="text-muted-foreground text-xs">
                  {level === 'high' ? 'Irreversible or dangerous' : level === 'medium' ? 'Has side effects' : 'Minor impact'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section id="fp-shortcuts">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Keyboard Shortcuts</h2>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Shortcut</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {FP_SHORTCUTS.map(s => (
                  <tr key={s.keys} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <kbd className="px-1.5 py-0.5 rounded border border-border text-xs font-mono bg-muted/50">{s.keys}</kbd>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="fp-mcp">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">MCP Integration</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            MAP&apos;s built-in MCP server lets external AI tools (Claude Code, Cursor, Codex, and more) pull your prompts directly.
            Every pull is recorded and visible in the <strong className="text-foreground">Agent Hub</strong>.
          </p>

          {/* Endpoint */}
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">MCP endpoint</p>
            <code className="text-sm font-mono text-primary">http://localhost:3100/mcp</code>
            <p className="text-xs text-muted-foreground mt-2">
              Bound to <code>127.0.0.1</code> only — not reachable from the internet. Starts automatically with <code>docker compose up -d</code>.
            </p>
          </div>

          {/* Enable/disable */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-6 text-sm">
            <p className="font-medium text-amber-400 mb-1">Enable / Disable</p>
            <p className="text-xs text-muted-foreground">
              Set <code className="bg-muted px-1 rounded">MCP_ENABLED=false</code> in your <code>.env</code> file and restart the container to turn the MCP server off.
              The <strong className="text-foreground">MCP Server</strong> sidebar panel shows the current status.
            </p>
          </div>

          {/* Client configs */}
          <div className="space-y-4">
            {[
              {
                name: 'Claude Code (CLI)',
                code: 'claude mcp add MAP --transport http http://localhost:3100/mcp',
                lang: 'bash',
                note: 'Run once. Then use list_prompts / pull_prompt in any session.',
              },
              {
                name: 'Cursor',
                code: `// ~/.cursor/mcp.json\n{\n  "mcpServers": {\n    "MAP": { "url": "http://localhost:3100/mcp" }\n  }\n}`,
                lang: 'json',
                note: 'Or add via Cursor Settings → MCP Servers.',
              },
              {
                name: 'Claude Desktop',
                code: `// claude_desktop_config.json\n{\n  "mcpServers": {\n    "MAP": {\n      "type": "http",\n      "url": "http://localhost:3100/mcp"\n    }\n  }\n}`,
                lang: 'json',
                note: 'macOS: ~/Library/Application Support/Claude/  |  Windows: %APPDATA%\\Claude\\',
              },
              {
                name: 'Windsurf (Codeium)',
                code: `// ~/.codeium/windsurf/mcp_config.json\n{\n  "mcpServers": {\n    "MAP": { "serverUrl": "http://localhost:3100/mcp" }\n  }\n}`,
                lang: 'json',
                note: null,
              },
              {
                name: 'VS Code — Continue extension',
                code: `// ~/.continue/config.json\n{\n  "mcpServers": [{\n    "name": "map",\n    "transport": { "type": "http", "url": "http://localhost:3100/mcp" }\n  }]\n}`,
                lang: 'json',
                note: null,
              },
              {
                name: 'OpenAI Codex CLI',
                code: `// ~/.codex/config.json\n{\n  "mcpServers": [{ "name": "map", "url": "http://localhost:3100/mcp" }]\n}`,
                lang: 'json',
                note: 'Or pass --mcp-server http://localhost:3100/mcp as a flag.',
              },
            ].map(client => (
              <div key={client.name} className="rounded-lg border border-border/50 overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/30 border-b border-border/30 flex items-center gap-2">
                  <span className="text-sm font-medium">{client.name}</span>
                </div>
                <pre className="text-xs font-mono p-4 overflow-x-auto bg-muted/10 leading-relaxed">{client.code}</pre>
                {client.note && (
                  <p className="text-xs text-muted-foreground px-4 pb-3">{client.note}</p>
                )}
              </div>
            ))}
          </div>

          {/* Tools reference */}
          <div className="mt-6 rounded-lg border border-border/50 overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/30 border-b border-border/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available MCP Tools</p>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border/30">
                <tr className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-primary text-xs">list_prompts</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">Lists all prompts — name, description, pull count, agent usage. Filtered to token&apos;s allowed groups.</td>
                </tr>
                <tr className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-primary text-xs">pull_prompt</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    Fetches full prompt content by ID. Records the pull in the Agent Hub.<br />
                    <span className="text-xs">Params: <code>promptId</code> (required), <code>clientName</code> (optional)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* API Tokens */}
          <div className="mt-8">
            <h3 className="text-base font-semibold mb-3">API Tokens</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Each external tool should use its own API token scoped to specific group workspaces.
              Tokens control which prompts are visible via <code className="bg-muted px-1 rounded text-xs">list_prompts</code> and <code className="bg-muted px-1 rounded text-xs">pull_prompt</code> — a token only sees prompts belonging to its allowed groups.
            </p>

            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Generating a token</p>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Open the <strong className="text-foreground">MCP Server</strong> panel (Server icon in the sidebar)</li>
                <li>Expand <strong className="text-foreground">API Tokens</strong> → click <strong className="text-foreground">+ New Token</strong></li>
                <li>Enter a name, select which groups the token can access, set an optional expiry</li>
                <li>Click <strong className="text-foreground">Generate Token</strong> and copy the token — it is shown only once</li>
              </ol>
            </div>

            <div className="space-y-4 mb-4">
              {[
                {
                  name: 'Claude Code (CLI)',
                  code: `claude mcp add MAP --transport http http://localhost:3100/mcp \\\n  --header "Authorization: Bearer verto_your_token_here"`,
                },
                {
                  name: 'Cursor',
                  code: `// ~/.cursor/mcp.json\n{\n  "mcpServers": {\n    "MAP": {\n      "url": "http://localhost:3100/mcp",\n      "headers": { "Authorization": "Bearer verto_your_token_here" }\n    }\n  }\n}`,
                },
                {
                  name: 'Claude Desktop',
                  code: `// claude_desktop_config.json\n{\n  "mcpServers": {\n    "MAP": {\n      "command": "npx",\n      "args": ["-y", "mcp-remote", "http://localhost:3100/mcp",\n               "--header", "Authorization: Bearer verto_your_token_here"]\n    }\n  }\n}`,
                },
              ].map(client => (
                <div key={client.name} className="rounded-lg border border-border/50 overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/30 border-b border-border/30">
                    <span className="text-sm font-medium">{client.name}</span>
                  </div>
                  <pre className="text-xs font-mono p-4 overflow-x-auto bg-muted/10 leading-relaxed">{client.code}</pre>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/20 p-4 mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Revoking a token</p>
              <p className="text-sm text-muted-foreground">
                Click <strong className="text-foreground">×</strong> next to any token in the API Tokens list. The token is immediately invalidated — any tool using it will receive 401 on its next request.
              </p>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
              <p className="font-medium text-amber-400 mb-1">Admin bypass</p>
              <p className="text-xs text-muted-foreground">
                The <code className="bg-muted px-1 rounded">MCP_AUTH_TOKEN</code> env var still works as a server-to-server admin token with access to all groups.
                Use it for automation only — use per-client API tokens for human tools like Cursor or Claude Code.
              </p>
            </div>
          </div>
        </section>

        </div>
      </main>
    </div>
  )
}

// ── Full-page: Settings ───────────────────────────────────────────────────────

const SHORTCUT_GROUPS_INLINE = [
  {
    title: 'Graph Editing',
    shortcuts: [
      { keys: ['Ctrl/⌘', 'S'], description: 'Save agent' },
      { keys: ['Ctrl/⌘', 'Z'], description: 'Undo' },
      { keys: ['Ctrl/⌘', 'Y'], description: 'Redo' },
      { keys: ['Ctrl/⌘', 'C'], description: 'Copy selected node' },
      { keys: ['Ctrl/⌘', 'V'], description: 'Paste node' },
      { keys: ['Ctrl/⌘', 'D'], description: 'Duplicate selected node' },
      { keys: ['Delete'], description: 'Delete selected node' },
    ],
  },
  {
    title: 'Navigation & View',
    shortcuts: [
      { keys: ['Ctrl/⌘', 'F'], description: 'Find / search nodes' },
      { keys: ['Ctrl/⌘', 'B'], description: 'Toggle sidebar' },
      { keys: ['?'], description: 'Open keyboard shortcuts dialog' },
    ],
  },
  {
    title: 'Chat & Comments',
    shortcuts: [
      { keys: ['Ctrl/⌘', 'Enter'], description: 'Send message or comment' },
      { keys: ['/help'], description: 'Show all chat commands' },
      { keys: ['/mcp'], description: 'MCP server info and tools' },
    ],
  },
]

function EditorSettingsPage({ activeAgentName }: { activeAgentName: string | null }) {
  const { activeWorkspace, workspaces, setActiveWorkspace } = useWorkspace()
  const { resolvedTheme, setTheme } = useTheme()
  const [mcpOnline, setMcpOnline] = useState<boolean | null>(null)
  const MCP_URL = 'http://localhost:3100'

  useEffect(() => {
    setMcpOnline(null)
    fetch(`${MCP_URL}/api/status`)
      .then(r => r.ok ? setMcpOnline(true) : setMcpOnline(false))
      .catch(() => setMcpOnline(false))
  }, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
        <div>
          <h1 className="text-xl font-semibold mb-1">Settings</h1>
          <p className="text-sm text-muted-foreground">Workspace preferences.</p>
        </div>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Workspaces</h2>
          <div className="rounded-lg border border-border/50 bg-card divide-y divide-border/50">
            {workspaces.map(ws => (
              <div key={ws.id ?? 'personal'} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                    {ws.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{ws.name}</p>
                    <p className="text-xs text-muted-foreground">{ws.id ? 'Group workspace' : 'Personal workspace'}</p>
                  </div>
                </div>
                {activeWorkspace.id === ws.id ? (
                  <Badge variant="secondary" className="text-xs">Active</Badge>
                ) : (
                  <button onClick={() => setActiveWorkspace(ws)} className="text-xs text-primary hover:underline">
                    Switch
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">MCP Server</h2>
          <div className="rounded-lg border border-border/50 bg-card divide-y divide-border/50">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                mcpOnline === null ? 'bg-yellow-400' : mcpOnline ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-sm">
                {mcpOnline === null ? 'Checking…' : mcpOnline ? `Server running at ${MCP_URL}` : `Server offline — run: cd mcp-server && npm run dev`}
              </span>
            </div>
            {activeAgentName && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">Active agent context</span>
                <span className="text-sm font-medium">{activeAgentName}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-3 mb-3">Connect external tools to MAP via MCP. Use these snippets to configure your AI client:</p>

          <div className="space-y-3">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Claude Desktop</span>
                <button
                  onClick={() => copyToClipboard(`{ "mcpServers": { "MAP": { "type": "http", "url": "${MCP_URL}/mcp" } } }`)}
                  className="text-xs text-primary hover:underline"
                >
                  Copy
                </button>
              </div>
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{`{ "mcpServers": { "MAP": { "type": "http", "url": "${MCP_URL}/mcp" } } }`}</pre>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">Cursor / VS Code</span>
                <button
                  onClick={() => copyToClipboard(`{ "mcp": { "servers": { "MAP": { "url": "${MCP_URL}/mcp" } } } }`)}
                  className="text-xs text-primary hover:underline"
                >
                  Copy
                </button>
              </div>
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">{`{ "mcp": { "servers": { "MAP": { "url": "${MCP_URL}/mcp" } } } }`}</pre>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Appearance</h2>
          <div className="rounded-lg border border-border/50 bg-card px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground mt-0.5">Choose between light and dark mode</p>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 p-0.5">
              {(['light', 'dark', 'system'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                    resolvedTheme === t || (t === 'system' && !['light', 'dark'].includes(resolvedTheme ?? ''))
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Keyboard Shortcuts</h2>
          <div className="rounded-lg border border-border/50 bg-card divide-y divide-border/50">
            {SHORTCUT_GROUPS_INLINE.map(group => (
              <div key={group.title} className="px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{group.title}</p>
                {group.shortcuts.map(s => (
                  <div key={s.description} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{s.description}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
                          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted border border-border rounded shadow-sm">{k}</kbd>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Full-page: Home dashboard ─────────────────────────────────────────────────

function EditorHomePage({
  onOpenAgent,
  onNewAgent,
  onGoToPrompts,
}: {
  onOpenAgent: (id: string) => void
  onNewAgent: () => void
  onGoToPrompts: () => void
}) {
  const { user } = useCurrentUser()
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspace()
  const [recentAgents, setRecentAgents] = useState<{
    id: string; name: string; description: string | null; groupId: string | null;
    isPublicInOrg: boolean; updatedAt: string; ownerId: string
  }[]>([])
  const [groups, setGroups] = useState<{ id: string; name: string; description: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/agents?limit=6').then(r => r.json()).catch(() => ({ agents: [] })),
      fetch('/api/groups').then(r => r.json()).catch(() => ({ groups: [] })),
    ]).then(([agentsData, groupsData]) => {
      const all: typeof recentAgents = agentsData.agents ?? []
      // sort by updatedAt descending, take top 6
      all.sort((a: typeof recentAgents[0], b: typeof recentAgents[0]) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      setRecentAgents(all.slice(0, 6))
      setGroups(groupsData.groups ?? [])
      setLoading(false)
    })
  }, [])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold mb-1">{greeting}, {user?.name?.split(' ')[0] ?? 'there'}</h1>
          <p className="text-sm text-muted-foreground">Here's what's happening across your workspaces.</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { icon: Plus, label: 'New Prompt', desc: 'Start from scratch', action: onNewAgent, primary: true },
            { icon: FileText, label: 'Browse Prompts', desc: 'View all prompts', action: onGoToPrompts, primary: false },
            { icon: TrendingUp, label: 'Active Workspace', desc: activeWorkspace.name, action: () => {}, primary: false },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              className={`flex items-start gap-3 p-4 rounded-lg border text-left transition-all hover:shadow-sm ${
                item.primary
                  ? 'border-primary/30 bg-primary/5 hover:bg-primary/10'
                  : 'border-border/50 bg-card hover:border-border hover:bg-muted/30'
              }`}
            >
              <item.icon className={`h-5 w-5 mt-0.5 shrink-0 ${item.primary ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <p className={`text-sm font-medium ${item.primary ? 'text-primary' : ''}`}>{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Recent prompts */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Prompts
            </h2>
            <button onClick={onGoToPrompts} className="text-xs text-primary hover:underline">View all</button>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : recentAgents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/50 py-12 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No prompts yet. Create your first one.</p>
              <button
                onClick={onNewAgent}
                className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> New Prompt
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentAgents.map(a => (
                <button
                  key={a.id}
                  onClick={() => onOpenAgent(a.id)}
                  className="group flex flex-col gap-1.5 rounded-lg border border-border/50 bg-card p-4 text-left hover:border-border hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{a.name}</span>
                    {a.isPublicInOrg ? <Globe className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" /> : <Lock className="h-3 w-3 text-muted-foreground shrink-0 ml-auto" />}
                  </div>
                  {a.description && <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
                  <p className="text-xs text-muted-foreground mt-auto">{relativeTime(a.updatedAt)}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Groups */}
        {groups.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-muted-foreground" />
              Your Groups
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {groups.map(g => {
                const ws = workspaces.find(w => w.id === g.id)
                const isActive = activeWorkspace.id === g.id
                return (
                  <div
                    key={g.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all ${
                      isActive ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {g.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{g.name}</p>
                        {g.description && <p className="text-xs text-muted-foreground truncate">{g.description}</p>}
                      </div>
                    </div>
                    {isActive ? (
                      <Badge variant="secondary" className="text-xs shrink-0">Active</Badge>
                    ) : ws ? (
                      <button
                        onClick={() => setActiveWorkspace(ws)}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        Switch
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}

// ── Full-page: Profile ────────────────────────────────────────────────────────

function EditorProfilePage() {
  const { user, logout } = useCurrentUser()
  const [nameInput, setNameInput] = useState(user?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  async function handleSaveName() {
    if (!nameInput.trim() || nameInput === user?.name) return
    setSavingName(true)
    try {
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      })
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('All password fields are required')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to change password')
        return
      }
      toast.success('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Failed to change password')
    } finally {
      setSavingPassword(false)
    }
  }

  const initials = user?.name?.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() ?? '?'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        <div>
          <h1 className="text-xl font-semibold mb-1">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account and preferences.</p>
        </div>

        {/* Avatar + identity */}
        <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <div className="h-20 bg-gradient-to-br from-primary/20 to-chart-2/20" />
          <div className="px-6 pb-6">
            <div className="-mt-8 mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/30 to-chart-2/30 border-4 border-card flex items-center justify-center text-xl font-bold text-primary">
                {initials}
              </div>
            </div>
            <h2 className="text-lg font-semibold">{user?.name}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Mail className="h-3.5 w-3.5" />{user?.email}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="secondary" className="capitalize gap-1">
                <Shield className="h-3 w-3" />{user?.role}
              </Badge>
            </div>
          </div>
        </div>

        {/* Edit name */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <UserCog className="h-4 w-4" /> Account Details
          </h2>
          <div className="rounded-lg border border-border/50 bg-card divide-y divide-border/50">
            <div className="px-4 py-4">
              <label className="text-xs font-medium text-muted-foreground block mb-2">Display name</label>
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  placeholder={user?.name}
                  className="flex-1 h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/50 transition-colors"
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName || !nameInput.trim() || nameInput === user?.name}
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  {savingName ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <div className="px-4 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email address</p>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
              </div>
              <Badge variant="outline" className="text-xs">Read-only</Badge>
            </div>
          </div>
        </section>

        {/* Password change */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Change Password
          </h2>
          <div className="rounded-lg border border-border/50 bg-card divide-y divide-border/50">
            <div className="px-4 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Current password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/50 transition-colors"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                {savingPassword ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </div>
        </section>

        {/* Sign out */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Session
          </h2>
          <div className="rounded-lg border border-border/50 bg-card px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sign out of MAP</p>
              <p className="text-xs text-muted-foreground mt-0.5">You'll be redirected to the login page.</p>
            </div>
            <button
              onClick={logout}
              className="h-9 px-4 rounded-md border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </section>

      </div>
    </div>
  )
}

// ── Full-page: Agent Hub ──────────────────────────────────────────────────────

type SortKey = 'forks' | 'newest' | 'az'
const SORT_LABELS: Record<SortKey, string> = { forks: 'Most Forked', newest: 'Newest', az: 'A–Z' }

function HubComplexityLabel(nodeCount: number): { label: string; color: string } {
  if (nodeCount <= 6) return { label: 'simple', color: 'bg-emerald-500/15 text-emerald-400' }
  if (nodeCount <= 12) return { label: 'moderate', color: 'bg-amber-500/15 text-amber-400' }
  if (nodeCount <= 20) return { label: 'complex', color: 'bg-orange-500/15 text-orange-400' }
  return { label: 'very complex', color: 'bg-red-500/15 text-red-400' }
}

function EditorAgentHubPage({
  agents,
  onLoadAgent,
  onForkAgent,
  onTogglePublic,
  onUpdateTags,
}: {
  agents: AgentConfig[]
  onLoadAgent: (agent: AgentConfig) => void
  onForkAgent: (agent: AgentConfig) => void
  onTogglePublic: (agentId: string) => void
  onUpdateTags: (agentId: string, tags: string[]) => void
}) {
  const [tab, setTab] = useState<'community' | 'my'>('community')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('forks')

  const communityAgents = MOCK_COMMUNITY_AGENTS
  const allTags = useMemo(() => getAllTags([...agents, ...communityAgents]), [agents, communityAgents])
  const trending = useMemo(() => getTrendingAgents(communityAgents, 3), [communityAgents])

  const sourceAgents = tab === 'community' ? communityAgents : agents

  const filtered = useMemo(() => {
    let result = [...sourceAgents]
    if (category !== 'all') result = result.filter(a => a.hubMeta?.category === category)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.description?.toLowerCase().includes(q) ?? false) ||
        (a.hubMeta?.tags?.some(t => t.toLowerCase().includes(q)) ?? false)
      )
    }
    switch (sort) {
      case 'forks': result.sort((a, b) => (b.hubMeta?.forkCount ?? 0) - (a.hubMeta?.forkCount ?? 0)); break
      case 'newest': result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break
      case 'az': result.sort((a, b) => a.name.localeCompare(b.name)); break
    }
    return result
  }, [sourceAgents, category, search, sort])

  const TEMPLATE_CATS = [
    { id: 'customer-service', label: 'Customer Service', icon: '💬' },
    { id: 'data-processing', label: 'Data Processing', icon: '📊' },
    { id: 'approval-workflow', label: 'Approval Workflows', icon: '✅' },
    { id: 'content-moderation', label: 'Content Moderation', icon: '🛡️' },
    { id: 'orchestration', label: 'Multi-Agent', icon: '🔀' },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/50 px-6 h-14 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold">Agent Hub</h1>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">Preview</span>
        </div>
        <div className="flex-1" />
        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(['community', 'my'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setCategory('all'); setSearch(''); setSort('forks') }}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t === 'community' ? 'Community' : 'My Agents'}
            </button>
          ))}
        </div>
      </div>

      {/* Community preview notice */}
      {tab === 'community' && (
        <div className="px-6 py-2 bg-blue-500/5 border-b border-blue-500/10 flex items-center gap-2 shrink-0">
          <span className="text-xs text-blue-400/80">Community sync coming soon — showing preview agents</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Trending (community only) */}
        {tab === 'community' && trending.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-3">
              <TrendingUp className="h-3.5 w-3.5" /> Trending
            </div>
            <div className="grid grid-cols-3 gap-3">
              {trending.map(agent => {
                const { label, color } = HubComplexityLabel(agent.nodes.length)
                return (
                  <div key={agent.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3">
                    <div className="flex flex-wrap items-start gap-1.5">
                      <span className="line-clamp-2 flex-1 text-xs font-semibold leading-snug">{agent.name}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}>{label}</span>
                    </div>
                    {agent.author && <p className="text-[11px] text-muted-foreground">by {agent.author}</p>}
                    <div className="mt-auto flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <GitFork className="h-3 w-3" />{agent.hubMeta?.forkCount ?? 0}
                      </span>
                      <button onClick={() => onForkAgent(agent)} className="h-6 px-2 text-[11px] rounded border border-border hover:bg-muted transition-colors">Fork</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, description or tag…"
              className="w-full h-8 pl-9 pr-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ id: 'all', label: 'All' }, ...TEMPLATE_CATS].map(cat => (
              <button key={cat.id} onClick={() => setCategory(cat.id)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${category === cat.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border/50 hover:border-border bg-card'}`}
              >
                {'icon' in cat ? `${cat.icon} ${cat.label}` : cat.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
              className="h-8 pl-3 pr-8 text-xs rounded-md bg-muted border border-border/50 outline-none appearance-none"
            >
              {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Agent cards */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {search ? 'No agents match your search.' : tab === 'my' ? 'No agents yet. Create one in the editor.' : 'No agents in this category.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(agent => {
              const { label, color } = HubComplexityLabel(agent.nodes.length)
              const tags = agent.hubMeta?.tags ?? []
              return (
                <div key={agent.id} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/50 transition-colors">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <h3 className="text-sm font-semibold flex-1 truncate">{agent.name}</h3>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}>{label}</span>
                    </div>
                    {agent.author && <p className="text-xs text-muted-foreground mb-1">by {agent.author}</p>}
                    {agent.description && <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>}
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.slice(0, 4).map(tag => (
                        <span key={tag} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">{tag}</span>
                      ))}
                      {tags.length > 4 && <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">+{tags.length - 4}</span>}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-auto pt-1 border-t border-border/30">
                    <span className="text-[11px] text-muted-foreground">
                      {agent.nodes.length} nodes
                      {(agent.hubMeta?.forkCount ?? 0) > 0 && <> · <GitFork className="inline h-2.5 w-2.5" /> {agent.hubMeta!.forkCount}</>}
                    </span>
                    <div className="flex gap-1.5">
                      {tab === 'community' && (
                        <button onClick={() => onForkAgent(agent)} className="h-7 px-2 text-xs rounded-md border border-border hover:bg-muted transition-colors flex items-center gap-1">
                          <GitFork className="h-3 w-3" /> Fork
                        </button>
                      )}
                      {tab === 'my' && (
                        <>
                          <button onClick={() => onTogglePublic(agent.id)} className="h-7 w-7 rounded-md border border-border hover:bg-muted transition-colors flex items-center justify-center" title={agent.isPublic ? 'Make private' : 'Make public'}>
                            {agent.isPublic ? <Globe className="h-3.5 w-3.5 text-primary" /> : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                          </button>
                          <button onClick={() => onLoadAgent(agent)} className="h-7 px-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                            Load
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Full-page: Pattern Library ────────────────────────────────────────────────

function EditorPatternsPage({
  currentAgent,
  onInsertPattern,
}: {
  currentAgent: AgentConfig | null
  onInsertPattern: (updated: AgentConfig) => void
}) {
  const [activeTab, setActiveTab] = useState<'builtin' | 'workspace' | 'community'>('builtin')
  const [filters, setFilters] = useState<PatternFilters>({ categories: [], domains: [], complexities: [] })
  const [search, setSearch] = useState('')
  const [dbPatterns, setDbPatterns] = useState<PromptPattern[]>([])
  const [loading, setLoading] = useState(false)
  const [previewPattern, setPreviewPattern] = useState<PromptPattern | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)

  // Fetch patterns when tab / filters / search change
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ tab: activeTab })
    if (filters.categories.length === 1) params.set('category', filters.categories[0])
    if (filters.domains.length === 1) params.set('domain', filters.domains[0])
    if (filters.complexities.length === 1) params.set('complexity', filters.complexities[0])
    if (search) params.set('search', search)

    fetch(`/api/patterns?${params}`)
      .then((r) => r.json())
      .then((data) => setDbPatterns(data.patterns ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [activeTab, filters, search])

  // Client-side multi-filter: OR within group, AND across groups
  const filteredPatterns = dbPatterns.filter((p) => {
    if (filters.categories.length > 0 && !filters.categories.includes(p.category as any)) return false
    if (filters.domains.length > 0 && (!p.domain || !filters.domains.includes(p.domain as any))) return false
    if (filters.complexities.length > 0 && (!p.complexity || !filters.complexities.includes(p.complexity as any))) return false
    return true
  })

  // Counts for sidebar
  const counts = {
    categories: Object.fromEntries(
      PATTERN_CATEGORIES.map((c) => [c.id, dbPatterns.filter((p) => p.category === c.id).length])
    ),
    domains: Object.fromEntries(
      PATTERN_DOMAINS.map((d) => [d.id, dbPatterns.filter((p) => p.domain === d.id).length])
    ),
    complexities: {
      simple: dbPatterns.filter((p) => p.complexity === 'simple').length,
      intermediate: dbPatterns.filter((p) => p.complexity === 'intermediate').length,
      advanced: dbPatterns.filter((p) => p.complexity === 'advanced').length,
    },
  }

  function handleInsertPattern(pattern: PromptPattern) {
    if (!currentAgent) return
    const { updatedAgent } = insertPatternIntoGraph(currentAgent, pattern, { x: 200, y: 200 })
    onInsertPattern(updatedAgent)
    fetch(`/api/patterns/${pattern.id}/use`, { method: 'POST' }).catch(() => {})
    toast.success(`Pattern "${pattern.name}" inserted`)
  }

  async function handleSavePattern(
    pattern: PromptPattern,
    meta: { name: string; description: string; category: PatternCategory; domain: PatternDomain | null; complexity: PatternComplexity; icon: string; isPublic: boolean }
  ) {
    await fetch('/api/patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...meta,
        nodes: pattern.nodes,
        connections: pattern.connections,
        entryNodeId: pattern.entryNodeId,
        exitNodeIds: pattern.exitNodeIds,
        promptFragment: pattern.promptFragment,
      }),
    })
    setActiveTab(meta.isPublic ? 'community' : 'workspace')
    toast.success('Pattern saved!')
  }

  const TABS = [
    { id: 'builtin' as const, label: 'Built-in' },
    { id: 'workspace' as const, label: 'My Workspace' },
    { id: 'community' as const, label: 'Community' },
  ]

  return (
    <div className="flex flex-col h-full bg-neutral-900">
      {/* Tabs + AI Generate button */}
      <div className="flex items-center justify-between px-5 pt-4 pb-0 border-b border-neutral-700/50">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-neutral-800 text-neutral-100 border-t border-l border-r border-neutral-700/50'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowGenerate(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors mb-2"
        >
          <Sparkles className="h-3 w-3" /> AI Generate
        </button>
      </div>

      {/* Search bar */}
      <div className="px-5 py-3 border-b border-neutral-700/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patterns…"
            className="w-full h-8 pl-9 pr-3 text-sm rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 outline-none focus:border-indigo-500 placeholder-neutral-600"
          />
        </div>
        {!currentAgent && (
          <p className="text-xs text-neutral-500 mt-2">Open an agent to insert patterns</p>
        )}
      </div>

      {/* Sidebar + grid */}
      <div className="flex flex-1 overflow-hidden px-5 py-4 gap-4">
        <PatternFilterSidebar filters={filters} onChange={setFilters} counts={counts} />

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
            </div>
          ) : filteredPatterns.length === 0 ? (
            <p className="text-center text-sm text-neutral-500 py-12">No patterns found.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredPatterns.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  canInsert={!!currentAgent}
                  onPreview={() => { setPreviewPattern(pattern); setShowPreview(true) }}
                  onInsert={() => handleInsertPattern(pattern)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview modal */}
      <PatternPreviewDialog
        pattern={previewPattern}
        open={showPreview}
        onClose={() => setShowPreview(false)}
        canInsert={!!currentAgent}
        onInsert={(p) => { handleInsertPattern(p); setShowPreview(false) }}
        showSaveToWorkspace={activeTab === 'community'}
        onSaveToWorkspace={(p) => handleSavePattern(p, {
          name: p.name,
          description: p.description,
          category: p.category as PatternCategory,
          domain: (p.domain as PatternDomain) ?? null,
          complexity: (p.complexity as PatternComplexity) ?? 'simple',
          icon: p.icon,
          isPublic: false,
        })}
      />

      {/* AI Generate dialog */}
      <PatternGenerateDialog
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        onGenerated={(pattern) => { setPreviewPattern(pattern); setShowPreview(true) }}
      />
    </div>
  )
}

// ── Full-page: Groups ─────────────────────────────────────────────────────────

type GroupDetail = {
  id: string
  name: string
  description: string | null
  createdAt: string
}

type GroupMember = {
  userId: string
  name: string
  email: string
  role: 'owner' | 'editor' | 'viewer'
}

type ApiKeyStatus = {
  provider: string
  isSet: boolean
  maskedKey: string | null
}

type GroupAgent = {
  id: string
  name: string
  description: string | null
  updatedAt: string
  ownerId: string
}

function EditorGroupsPage({ onOpenAgent }: { onOpenAgent?: (id: string) => void }) {
  const { user } = useCurrentUser()
  const [groups, setGroups] = useState<GroupDetail[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [tab, setTab] = useState<'members' | 'prompts' | 'apikeys' | 'info'>('members')
  const [members, setMembers] = useState<GroupMember[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyStatus[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [loadingPrompts, setLoadingPrompts] = useState(false)
  const [groupPrompts, setGroupPrompts] = useState<GroupAgent[]>([])
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([])
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<'editor' | 'viewer' | 'owner'>('editor')
  const [addingMember, setAddingMember] = useState(false)
  const [newKeyValue, setNewKeyValue] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [keyProvider, setKeyProvider] = useState('gemini')
  const [deletingGroup, setDeletingGroup] = useState(false)

  const isAdmin = user?.role === 'admin'
  const canCreateGroup = user?.role !== 'viewer'

  useEffect(() => {
    fetch('/api/groups').then(r => r.json()).then(d => {
      const g: GroupDetail[] = d.groups ?? []
      setGroups(g)
      if (g.length > 0 && !selectedGroupId) setSelectedGroupId(g[0].id)
    })
    if (isAdmin) {
      fetch('/api/users').then(r => r.json()).then(d => setAllUsers(d.users ?? []))
    }
  }, [isAdmin])

  useEffect(() => {
    if (!selectedGroupId) return
    if (tab === 'members') {
      setLoadingMembers(true)
      // GET /api/groups/[id] returns { group, members: [{role, user: {id,name,email}}] }
      fetch(`/api/groups/${selectedGroupId}`).then(r => r.json()).then(d => {
        const raw = d.members ?? []
        setMembers(raw.map((m: { role: string; user: { id: string; name: string; email: string } }) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
        })))
        setLoadingMembers(false)
      })
    } else if (tab === 'apikeys') {
      setLoadingKeys(true)
      fetch(`/api/groups/${selectedGroupId}/api-keys`).then(r => r.json()).then(d => {
        // d.keys is a Record<provider, {set, preview, updatedAt}> — convert to array
        const rec = d.keys ?? {}
        const arr: ApiKeyStatus[] = Object.entries(rec).map(([provider, info]: [string, unknown]) => {
          const ki = info as { set: boolean; preview: string | null }
          return { provider, isSet: ki.set, maskedKey: ki.preview }
        })
        setApiKeys(arr)
        setLoadingKeys(false)
      }).catch(() => setLoadingKeys(false))
    } else if (tab === 'prompts') {
      setLoadingPrompts(true)
      fetch(`/api/agents?group=${selectedGroupId}`).then(r => r.json()).then(d => {
        setGroupPrompts(d.agents ?? [])
        setLoadingPrompts(false)
      }).catch(() => setLoadingPrompts(false))
    }
  }, [selectedGroupId, tab])

  async function handleAddMember() {
    if (!selectedGroupId || !addUserId) return
    setAddingMember(true)
    await fetch(`/api/groups/${selectedGroupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: addUserId, role: addRole }),
    })
    toast.success('Member added')
    setAddUserId('')
    fetch(`/api/groups/${selectedGroupId}`).then(r => r.json()).then(d => {
      const raw = d.members ?? []
      setMembers(raw.map((m: { role: string; user: { id: string; name: string; email: string } }) => ({
        userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role,
      })))
    })
    setAddingMember(false)
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedGroupId) return
    await fetch(`/api/groups/${selectedGroupId}/members/${userId}`, { method: 'DELETE' })
    setMembers(prev => prev.filter(m => m.userId !== userId))
    toast.success('Member removed')
  }

  async function handleChangeRole(userId: string, role: 'owner' | 'editor' | 'viewer') {
    if (!selectedGroupId) return
    const res = await fetch(`/api/groups/${selectedGroupId}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role } : m))
      toast.success('Role updated')
    } else {
      toast.error('Failed to update role')
    }
  }

  async function handleDeleteGroup() {
    if (!selectedGroupId) return
    if (!confirm('Are you sure you want to delete this group? This cannot be undone.')) return
    setDeletingGroup(true)
    const res = await fetch(`/api/groups/${selectedGroupId}`, { method: 'DELETE' })
    setDeletingGroup(false)
    if (res.ok) {
      setGroups(prev => {
        const next = prev.filter(g => g.id !== selectedGroupId)
        setSelectedGroupId(next[0]?.id ?? null)
        return next
      })
      toast.success('Group deleted')
    } else {
      toast.error('Failed to delete group')
    }
  }

  async function handleSaveKey() {
    if (!selectedGroupId || !newKeyValue.trim()) return
    setSavingKey(true)
    await fetch(`/api/groups/${selectedGroupId}/api-keys/${keyProvider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKeyValue.trim() }),
    })
    toast.success(`${keyProvider} API key saved`)
    setNewKeyValue('')
    fetch(`/api/groups/${selectedGroupId}/api-keys`).then(r => r.json()).then(d => {
      const rec = d.keys ?? {}
      setApiKeys(Object.entries(rec).map(([provider, info]: [string, unknown]) => {
        const ki = info as { set: boolean; preview: string | null }
        return { provider, isSet: ki.set, maskedKey: ki.preview }
      }))
    })
    setSavingKey(false)
  }

  const selectedGroup = groups.find(g => g.id === selectedGroupId)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return
    setSavingGroup(true)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() || null }),
      })
      const data = await res.json()
      if (res.ok && data.group) {
        setGroups(prev => [data.group, ...prev])
        setSelectedGroupId(data.group.id)
        setNewGroupName('')
        setNewGroupDesc('')
        setCreatingGroup(false)
        toast.success('Group created')
      } else {
        toast.error(data.error ?? 'Failed to create group')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSavingGroup(false)
    }
  }

  const CreateGroupDialog = () => creatingGroup ? (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setCreatingGroup(false)}>
      <div className="bg-card border border-border/50 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4">Create Group</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Group name <span className="text-destructive">*</span></label>
            <input
              autoFocus
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
              placeholder="e.g. Engineering team"
              className="w-full h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              value={newGroupDesc}
              onChange={e => setNewGroupDesc(e.target.value)}
              placeholder="What does this group work on?"
              className="w-full h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={() => setCreatingGroup(false)} className="flex-1 h-9 rounded-md border border-border text-sm hover:bg-muted transition-colors">Cancel</button>
          <button
            onClick={handleCreateGroup}
            disabled={!newGroupName.trim() || savingGroup}
            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            {savingGroup ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-4">
        <CreateGroupDialog />
        <div className="text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">No groups yet</h3>
          <p className="text-sm text-muted-foreground mb-5">
            {canCreateGroup ? 'Create your first group to collaborate with teammates.' : 'You are not a member of any groups yet.'}
          </p>
          {canCreateGroup && (
            <button
              onClick={() => setCreatingGroup(true)}
              className="h-9 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Create Group
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <CreateGroupDialog />
      {/* Group list sidebar */}
      <aside className="w-56 shrink-0 border-r border-border/50 py-4 flex flex-col">
        <div className="flex items-center justify-between px-4 mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Groups</p>
          {canCreateGroup && (
            <button onClick={() => setCreatingGroup(true)} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Create group">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto space-y-0.5 px-2">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => { setSelectedGroupId(g.id); setTab('members') }}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-sm text-left transition-colors ${
                selectedGroupId === g.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <div className="h-6 w-6 rounded bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                {g.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="truncate">{g.name}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Group detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedGroup && (
          <>
            {/* Group header */}
            <header className="border-b border-border/50 px-6 h-14 flex items-center gap-3 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                {selectedGroup.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-semibold truncate">{selectedGroup.name}</h1>
                {selectedGroup.description && <p className="text-xs text-muted-foreground truncate">{selectedGroup.description}</p>}
              </div>
            </header>

            {/* Tabs */}
            <div className="border-b border-border/50 px-6 flex gap-1">
              {(['members', 'prompts', 'apikeys', 'info'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                    tab === t
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'apikeys' ? 'API Keys' : t === 'prompts' ? 'Prompts' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">

              {/* Members tab */}
              {tab === 'members' && (
                <div className="max-w-2xl space-y-6">
                  {isAdmin && (
                    <div className="rounded-lg border border-border/50 bg-card p-4">
                      <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Add Member</h3>
                      <div className="flex gap-2">
                        <select
                          value={addUserId}
                          onChange={e => setAddUserId(e.target.value)}
                          className="flex-1 h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none"
                        >
                          <option value="">Select user…</option>
                          {allUsers.filter(u => !members.find(m => m.userId === u.id)).map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                          ))}
                        </select>
                        <select
                          value={addRole}
                          onChange={e => setAddRole(e.target.value as 'editor' | 'viewer' | 'owner')}
                          className="h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="owner">Owner</option>
                        </select>
                        <button
                          onClick={handleAddMember}
                          disabled={!addUserId || addingMember}
                          className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {loadingMembers ? 'Loading…' : `${members.length} member${members.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    {members.map(m => (
                      <div key={m.userId} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        </div>
                        {isAdmin && m.userId !== user?.id ? (
                          <select
                            value={m.role}
                            onChange={e => handleChangeRole(m.userId, e.target.value as 'owner' | 'editor' | 'viewer')}
                            className="h-7 px-2 text-xs rounded-md bg-muted border border-border/50 outline-none capitalize"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="owner">Owner</option>
                          </select>
                        ) : (
                          <Badge variant="outline" className="text-xs capitalize shrink-0">{m.role}</Badge>
                        )}
                        {isAdmin && m.userId !== user?.id && (
                          <button
                            onClick={() => handleRemoveMember(m.userId)}
                            className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prompts tab */}
              {tab === 'prompts' && (
                <div className="max-w-2xl space-y-4">
                  {loadingPrompts ? (
                    <div className="text-sm text-muted-foreground">Loading…</div>
                  ) : groupPrompts.length === 0 ? (
                    <div className="rounded-lg border border-border/50 bg-card px-6 py-10 text-center">
                      <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-1">No prompts in this group</p>
                      <p className="text-xs text-muted-foreground">Prompts assigned to this group will appear here.</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {groupPrompts.length} prompt{groupPrompts.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {groupPrompts.map(p => {
                        const diff = Date.now() - new Date(p.updatedAt).getTime()
                        const mins = Math.floor(diff / 60000)
                        const timeAgo = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins/60)}h ago` : `${Math.floor(mins/1440)}d ago`
                        return (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0">
                            <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                              <FileText className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                            </div>
                            <p className="text-xs text-muted-foreground shrink-0">{timeAgo}</p>
                            {onOpenAgent && (
                              <button
                                onClick={() => onOpenAgent(p.id)}
                                title="Open in editor"
                                className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* API Keys tab */}
              {tab === 'apikeys' && (
                <div className="max-w-2xl space-y-6">
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><Key className="h-4 w-4" /> Set API Key</h3>
                    <div className="flex gap-2">
                      <select
                        value={keyProvider}
                        onChange={e => setKeyProvider(e.target.value)}
                        className="h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none"
                      >
                        <option value="gemini">Gemini</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                      </select>
                      <input
                        value={newKeyValue}
                        onChange={e => setNewKeyValue(e.target.value)}
                        placeholder="Paste API key…"
                        type="password"
                        className="flex-1 h-9 px-3 text-sm rounded-md bg-muted border border-border/50 outline-none focus:border-primary/50"
                      />
                      <button
                        onClick={handleSaveKey}
                        disabled={!newKeyValue.trim() || savingKey}
                        className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
                      >
                        {savingKey ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configured Keys</p>
                    </div>
                    {loadingKeys ? (
                      <div className="px-4 py-4 text-sm text-muted-foreground">Loading…</div>
                    ) : apiKeys.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">No API keys configured yet.</div>
                    ) : apiKeys.map(k => (
                      <div key={k.provider} className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0">
                        <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-medium capitalize">{k.provider}</p>
                          <p className="text-xs text-muted-foreground font-mono">{k.maskedKey ?? '—'}</p>
                        </div>
                        <Badge variant={k.isSet ? 'default' : 'secondary'} className="text-xs">
                          {k.isSet ? 'Set' : 'Not set'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info tab */}
              {tab === 'info' && (
                <div className="max-w-2xl space-y-6">
                  <div className="rounded-lg border border-border/50 bg-card divide-y divide-border/50">
                    <div className="px-4 py-3 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Group name</p>
                      <p className="text-sm font-medium">{selectedGroup.name}</p>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="text-sm font-medium">{selectedGroup.description ?? '—'}</p>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="text-sm font-medium">{new Date(selectedGroup.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Group ID</p>
                      <p className="text-xs font-mono text-muted-foreground">{selectedGroup.id}</p>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Members</p>
                      <p className="text-sm font-medium">{members.length}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                      <h3 className="text-sm font-medium text-destructive mb-1">Danger zone</h3>
                      <p className="text-xs text-muted-foreground mb-3">Deleting a group is permanent and cannot be undone. All group API keys will be removed.</p>
                      <button
                        onClick={handleDeleteGroup}
                        disabled={deletingGroup}
                        className="h-8 px-4 rounded-md border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors disabled:opacity-40 flex items-center gap-2"
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                        {deletingGroup ? 'Deleting…' : 'Delete group'}
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  )
}
