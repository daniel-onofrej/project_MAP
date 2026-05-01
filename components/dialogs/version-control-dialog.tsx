'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { GitBranch, Clock, RotateCcw, Undo2 } from 'lucide-react';
import {
  getAllVersions,
  saveVersion,
  restoreVersion,
  compareVersions,
  computeNextVersionLabel,
  type AgentVersion,
} from '@/lib/storage/version-control';
import type { AgentConfig } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { VersionBranchTree } from '../graph/version-branch-tree';
import { useCurrentUser } from '@/lib/auth/user-context';

interface VersionControlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentConfig | null;
  onRestore: (agent: AgentConfig) => void;
  onVersionCreated?: (agent: AgentConfig) => void;
}

const BRANCH_COLORS = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6'];

function getBranchColor(rootInt: number) {
  return BRANCH_COLORS[(rootInt - 1) % BRANCH_COLORS.length];
}

export function VersionControlDialog({ open, onOpenChange, agent, onRestore, onVersionCreated }: VersionControlDialogProps) {
  const { user } = useCurrentUser();
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (agent) {
      const v = getAllVersions(agent.id);
      setVersions(v);
      setSelectedId(agent.currentVersionId ?? null);
    }
  }, [agent?.id, open]);

  const handleSaveVersion = () => {
    if (!commitMessage.trim() || !agent) return;
    const newVersion = saveVersion(agent, commitMessage, undefined, user?.name);
    const updatedAgent = { ...agent, currentVersionId: newVersion.id };
    setCommitMessage('');
    setVersions(getAllVersions(agent.id));
    setSelectedId(newVersion.id);
    if (onVersionCreated) onVersionCreated(updatedAgent);
  };

  const handleRestore = (versionId: string) => {
    const restoredAgent = restoreVersion(versionId);
    if (restoredAgent) {
      onRestore(restoredAgent);
      onOpenChange(false);
    }
  };

  const handleSelectFromTree = useCallback((id: string) => {
    setSelectedId(id);
    const el = cardRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const sortedAsc = [...versions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const sortedDesc = [...versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const nextLabel = agent ? computeNextVersionLabel(agent) : '1';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4" />
            Version Control
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-2 border-b border-border shrink-0 flex gap-2 items-center">
          <Label htmlFor="commit-msg" className="text-xs text-muted-foreground whitespace-nowrap">
            v{nextLabel}
          </Label>
          <Input
            id="commit-msg"
            placeholder="Describe your changes…"
            value={commitMessage}
            onChange={e => setCommitMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveVersion()}
            className="h-7 text-xs"
          />
          <Button size="sm" className="h-7 text-xs px-3 shrink-0" onClick={handleSaveVersion} disabled={!commitMessage.trim()}>
            Commit
          </Button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <div className="flex w-full">
            <div className="shrink-0 border-r border-border bg-muted/5">
              <VersionBranchTree
                versions={sortedDesc}
                activeVersionId={agent?.currentVersionId ?? null}
                selectedVersionId={selectedId}
                onSelectVersion={handleSelectFromTree}
              />
            </div>

            <div className="flex-1 overflow-visible">
              {versions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No versions yet. Commit above.</p>
              ) : (
                <div className="divide-y divide-border min-h-full">
                  {sortedDesc.map(version => {
                    const rootInt = parseInt(version.versionLabel.split('.')[0], 10);
                    const color = getBranchColor(rootInt);
                    const isActive = agent?.currentVersionId === version.id;
                    const isSelected = selectedId === version.id;
                    const diff = agent ? compareVersions(version.snapshot, agent) : null;

                    return (
                      <div
                        key={version.id}
                        ref={el => { if (el) cardRefs.current.set(version.id, el); }}
                        onClick={() => setSelectedId(version.id)}
                        className={`px-3 h-10 flex flex-col justify-center cursor-pointer transition-colors hover:bg-muted/40 ${isSelected ? 'bg-muted/60' : ''} border-l-2 ${isActive ? '' : 'border-transparent'}`}
                        style={isActive ? { borderLeftColor: color } : undefined}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: color + '22', color }}
                          >
                            v{version.versionLabel}
                          </span>

                          <span className="text-xs truncate flex-1 min-w-0 text-foreground/80">
                            {version.isRevert && <Undo2 className="inline h-3 w-3 mr-1 text-muted-foreground" />}
                            {version.message}
                          </span>

                          {/* Author avatar */}
                          {version.author && (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Avatar className="h-5 w-5 shrink-0 cursor-default">
                                    <AvatarFallback className="text-[9px]">
                                      {version.author.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  {version.author}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}

                          <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                          </span>

                          {!isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 text-[10px] px-2 shrink-0"
                              onClick={e => { e.stopPropagation(); handleRestore(version.id); }}
                            >
                              <RotateCcw className="h-2.5 w-2.5 mr-1" />
                              Restore
                            </Button>
                          )}
                          {isActive && (
                            <span className="text-[10px] text-muted-foreground shrink-0 italic">active</span>
                          )}
                        </div>

                        {isSelected && diff && (diff.nodesAdded.length > 0 || diff.nodesRemoved.length > 0 || diff.nodesModified.length > 0) && (
                          <div className="mt-1 flex gap-2 text-[10px] pl-10">
                            {diff.nodesAdded.length > 0 && <span className="text-green-500">+{diff.nodesAdded.length} nodes</span>}
                            {diff.nodesRemoved.length > 0 && <span className="text-red-500">-{diff.nodesRemoved.length} nodes</span>}
                            {diff.nodesModified.length > 0 && <span className="text-yellow-500">~{diff.nodesModified.length} modified</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
