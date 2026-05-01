'use client';

import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { WorkspaceSelector } from './workspace-selector';
import {
  Plus,
  Play,
  Save,
  AlertTriangle,
  CheckCircle2,
  Settings,
  GitBranch,
  Network,
  Undo,
  Redo,
  RefreshCw,
  FileJson,
  FileOutput,
  Brain,
  Loader2,
  PlusIcon,
  MinusIcon,
  Zap,
  Keyboard,
  Plug,
  Info,
  ArrowLeft,
  Users,
  Shield,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/auth/user-context';
import { NODE_ICONS, type NodeType, type ConflictRule } from '@/lib/types';

interface ToolbarProps {
  agentName: string;
  onAddNode: (type: NodeType) => void;
  onSave: () => void;
  onSimulate: () => void;
  onSettings: () => void;
  onOpenTemplates: () => void;
  onOpenVersions: () => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReSyncRun: () => void;
  onReSyncView: () => void;
  reSyncSummary?: { similarity: number; added: number; removed: number } | null;
  reSyncRunning?: boolean;
  reSyncDirty?: boolean;
  reSyncAutoRun?: boolean;
  onReSyncAutoRunToggle?: () => void;
  onOpenJsonParser: () => void;
  onOpenConflictAnalyzer: () => void;
  onOpenExportJson: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Count of unguarded high-risk actions from background analysis */
  analyzerRiskCount?: number;
  conflictCount: number;
  conflicts?: ConflictRule[];
  onConflictNodeClick?: (nodeId: string) => void;
  hasUnsavedChanges: boolean;
  onOpenShortcuts: () => void;
  onOpenMcpPanel: () => void;
  onOpenGenerator: () => void;
  /** Current group the agent belongs to */
  currentGroupId?: string | null;
  /** Called when user changes the group in the selector */
  onGroupChange?: (groupId: string | null) => void;
}

export function Toolbar({
  agentName,
  onAddNode,
  onSave,
  onSimulate,
  onSettings,
  onOpenTemplates,
  onOpenVersions,
  onAutoLayout,
  onUndo,
  onRedo,
  onReSyncRun,
  onReSyncView,
  reSyncSummary,
  reSyncRunning,
  reSyncDirty,
  reSyncAutoRun,
  onReSyncAutoRunToggle,
  onOpenJsonParser,
  onOpenConflictAnalyzer,
  onOpenExportJson,
  canUndo: canUndoFlag,
  canRedo: canRedoFlag,
  analyzerRiskCount = 0,
  conflictCount,
  conflicts = [],
  onConflictNodeClick,
  hasUnsavedChanges,
  onOpenShortcuts,
  onOpenMcpPanel,
  onOpenGenerator,
  currentGroupId,
  onGroupChange,
}: ToolbarProps) {
  const router = useRouter();
  const { user, logout } = useCurrentUser();

  return (
    <div className="h-11 bg-background border-b border-border flex items-center justify-between px-3">
      <div className="flex items-center gap-3">
        {/* Back to graphs + brand */}
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-chart-1 to-chart-2 flex items-center justify-center">
            <span className="text-white font-bold text-xs">V</span>
          </div>
          <h1 className="text-xs font-semibold text-foreground leading-none max-w-[140px] truncate">
            {agentName || 'Untitled Agent'}
          </h1>
        </div>

        {/* Group / workspace selector */}
        <WorkspaceSelector
          currentGroupId={currentGroupId}
          onGroupChange={onGroupChange}
        />

        <Separator orientation="vertical" className="h-6" />

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs px-2 bg-orange-600 text-white border-orange-500 shadow-sm hover:bg-orange-700 transition-all active:scale-95 flex items-center gap-1.5 font-bold"
            onClick={onOpenGenerator}
            title="Open AI Generator"
          >
            <Plus className="h-3.5 w-3.5" />
            Generate Graph
          </Button>

          <Button size="sm" variant="secondary" className="h-7 text-xs px-2" onClick={onSimulate} title="Simulate">
            <Play className="h-3.5 w-3.5 mr-1" />
            Simulate
          </Button>

          {/* Re-sync group */}
          <div className="flex items-center h-7 rounded-md border border-border overflow-hidden">
            <button
              onClick={onReSyncRun}
              disabled={reSyncRunning}
              title="Re-sync: reconstruct prompt from graph via Gemini"
              className="flex items-center gap-1 px-2 h-full text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {reSyncRunning
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Re-sync
            </button>

            <div className="w-px h-full bg-border" />

            <button
              onClick={onReSyncAutoRunToggle}
              title={reSyncAutoRun ? 'Auto re-sync: ON — click to turn off' : 'Auto re-sync: OFF — click to turn on'}
              className={`flex items-center gap-1 px-2 h-full text-xs font-medium transition-colors ${reSyncAutoRun
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`}
            >
              <Zap className={`h-3.5 w-3.5 ${reSyncAutoRun ? 'fill-primary' : ''}`} />
              Auto
            </button>

            {(reSyncRunning || reSyncSummary) && (
              <>
                <div className="w-px h-full bg-border" />
                <button
                  onClick={onReSyncView}
                  title="View prompt diff"
                  className="flex items-center gap-1 px-2 h-full text-xs font-mono bg-secondary hover:bg-secondary/80 transition-colors"
                  style={{
                    color: reSyncRunning ? 'var(--muted-foreground)' :
                      reSyncDirty ? 'rgb(161 98 7)' :
                        reSyncSummary && reSyncSummary.similarity >= 0.75 ? 'rgb(21 128 61)' :
                          reSyncSummary && reSyncSummary.similarity >= 0.45 ? 'rgb(161 98 7)' :
                            'rgb(185 28 28)',
                  }}
                >
                  {reSyncRunning ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /><span>syncing…</span></>
                  ) : reSyncSummary ? (
                    <>
                      <span>{Math.round(reSyncSummary.similarity * 100)}%</span>
                      {reSyncSummary.added > 0 && (
                        <span className="flex items-center text-green-600 dark:text-green-400">
                          <PlusIcon className="h-2.5 w-2.5" />{reSyncSummary.added}
                        </span>
                      )}
                      {reSyncSummary.removed > 0 && (
                        <span className="flex items-center text-red-600 dark:text-red-400">
                          <MinusIcon className="h-2.5 w-2.5" />{reSyncSummary.removed}
                        </span>
                      )}
                      {reSyncDirty && <span className="opacity-60">~</span>}
                    </>
                  ) : null}
                </button>
              </>
            )}
          </div>

          <Button size="sm" variant="secondary" className="h-7 text-xs px-2" onClick={onOpenJsonParser} title="Import JSON">
            <FileJson className="h-3.5 w-3.5 mr-1" />
            Import JSON
          </Button>

          <Button size="sm" variant="secondary" className="h-7 text-xs px-2" onClick={onOpenExportJson} title="Export JSON">
            <FileOutput className="h-3.5 w-3.5 mr-1" />
            Export JSON
          </Button>

          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs px-2 text-amber-600 dark:text-amber-400 border-amber-300/40 hover:bg-amber-500/10 relative"
            onClick={onOpenConflictAnalyzer}
            title={analyzerRiskCount > 0 ? `AI Analyzer — ${analyzerRiskCount} unguarded risk${analyzerRiskCount > 1 ? 's' : ''} detected` : 'AI Conflict Analyzer — detect logical inconsistencies'}
          >
            <Brain className="h-3.5 w-3.5 mr-1" />
            AI Analyzer
            {analyzerRiskCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-1">
                {analyzerRiskCount}
              </span>
            )}
          </Button>

          <Button size="sm" className="h-7 text-xs px-2" onClick={onSave} disabled={!hasUnsavedChanges}>
            <Save className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {conflictCount > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Badge variant="destructive" className="text-xs cursor-pointer select-none">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {conflictCount} {conflictCount === 1 ? 'Conflict' : 'Conflicts'}
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conflicts</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {conflicts.map((c, i) => {
                  const targetNodeId = c.nodeIds?.[0];
                  const clickable = !!targetNodeId && !!onConflictNodeClick;
                  return (
                    <div
                      key={i}
                      className={`flex gap-2 px-3 py-2.5 border-b border-border last:border-0 ${clickable ? 'cursor-pointer hover:bg-accent' : ''}`}
                      onClick={clickable ? () => onConflictNodeClick!(targetNodeId) : undefined}
                    >
                      {c.type === 'info'
                        ? <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                        : <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${c.type === 'error' ? 'text-destructive' : 'text-yellow-500'}`} />
                      }
                      <p className="text-xs leading-snug">{c.message}</p>
                    </div>
                  );
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/10">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            No Conflicts
          </Badge>
        )}

        <Separator orientation="vertical" className="h-6" />

        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onUndo} disabled={!canUndoFlag} title="Undo (Ctrl+Z)">
          <Undo className="h-3.5 w-3.5" />
        </Button>

        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onRedo} disabled={!canRedoFlag} title="Redo (Ctrl+Y)">
          <Redo className="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onOpenVersions} title="Version Control">
          <GitBranch className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 opacity-50 cursor-not-allowed"
          onClick={() => {
            import('sonner').then(({ toast }) => toast.info('Layout modification is supported by AI only'));
          }}
          title="Layout Options (AI Only)"
        >
          <Network className="h-3.5 w-3.5" />
        </Button>

        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onOpenMcpPanel} title="MCP Server — type /mcp in chat for details">
          <Plug className="h-3.5 w-3.5" />
        </Button>

        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onSettings} title="Settings">
          <Settings className="h-3.5 w-3.5" />
        </Button>

        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onOpenShortcuts} title="Keyboard shortcuts (?)">
          <Keyboard className="h-3.5 w-3.5" />
        </Button>

        {user && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-1.5">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[10px]">
                      {user.name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs hidden sm:block max-w-[80px] truncate">{user.name}</span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user.email}</div>
                <DropdownMenuSeparator />
                {user.role === 'admin' && (
                  <>
                    <DropdownMenuItem onClick={() => router.push('/admin/users')}>
                      <Users className="mr-2 h-4 w-4" /> Manage Users
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/admin/groups')}>
                      <Shield className="mr-2 h-4 w-4" /> Manage Groups
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    </div>
  );
}
