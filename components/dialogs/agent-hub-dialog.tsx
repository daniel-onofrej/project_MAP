'use client';

import { useState, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import {
  Search,
  Globe,
  Lock,
  GitFork,
  TrendingUp,
  X,
  Plus,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { AgentConfig } from '@/lib/types';
import { TEMPLATE_CATEGORIES } from '@/lib/templates';
import {
  MOCK_COMMUNITY_AGENTS,
  getTrendingAgents,
  getAllTags,
} from '@/lib/hub-mock';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentHubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myAgents: AgentConfig[];
  onSelectAgent: (agent: AgentConfig) => void;
  onForkAgent: (agent: AgentConfig) => void;
  onTogglePublic: (agentId: string) => void;
  onUpdateTags?: (agentId: string, tags: string[]) => void;
}

type SortKey = 'forks' | 'newest' | 'az';

// ── Helpers ──────────────────────────────────────────────────────────────────

function complexityLabel(nodeCount: number): { label: string; color: string } {
  if (nodeCount <= 6)
    return { label: 'simple', color: 'bg-emerald-500/15 text-emerald-400' };
  if (nodeCount <= 12)
    return { label: 'moderate', color: 'bg-amber-500/15 text-amber-400' };
  if (nodeCount <= 20)
    return { label: 'complex', color: 'bg-orange-500/15 text-orange-400' };
  return { label: 'very complex', color: 'bg-red-500/15 text-red-400' };
}

// ── TagEditor ────────────────────────────────────────────────────────────────

interface TagEditorProps {
  tags: string[];
  allTags: string[];
  onUpdate: (tags: string[]) => void;
}

function TagEditor({ tags, allTags, onUpdate }: TagEditorProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    if (!input.trim()) return [];
    const lower = input.toLowerCase();
    return allTags
      .filter((t) => t.includes(lower) && !tags.includes(t))
      .slice(0, 5);
  }, [input, allTags, tags]);

  const normalizeTag = (raw: string) =>
    raw.trim().toLowerCase().replace(/\s+/g, '-');

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || tags.includes(tag) || tags.length >= 8) return;
    onUpdate([...tags, tag]);
    setInput('');
    setShowSuggestions(false);
  };

  const removeTag = (tag: string) => {
    onUpdate(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {/* Existing tag chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-primary/60 hover:text-primary"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input + suggestions */}
      {tags.length < 8 && (
        <div className="relative">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
            <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setShowSuggestions(true);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Add tag…"
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={() => addTag(s)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tags.length >= 8 && (
        <p className="text-xs text-muted-foreground">Maximum 8 tags reached.</p>
      )}
    </div>
  );
}

// ── TrendingSection ───────────────────────────────────────────────────────────

interface TrendingSectionProps {
  agents: AgentConfig[];
  onFork: (agent: AgentConfig) => void;
}

function TrendingSection({ agents, onFork }: TrendingSectionProps) {
  const trending = getTrendingAgents(agents, 3);
  if (trending.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        Trending
      </div>
      <div className="grid grid-cols-3 gap-3">
        {trending.map((agent) => {
          const { label, color } = complexityLabel(agent.nodes.length);
          const forkCount = agent.hubMeta?.forkCount ?? 0;
          return (
            <div
              key={agent.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-3"
            >
              <div className="flex flex-wrap items-start gap-1.5">
                <span className="line-clamp-2 flex-1 text-xs font-semibold leading-snug">
                  {agent.name}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    color,
                  )}
                >
                  {label}
                </span>
              </div>
              {agent.author && (
                <p className="text-[11px] text-muted-foreground">
                  by {agent.author}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <GitFork className="h-3 w-3" />
                  {forkCount}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => onFork(agent)}
                >
                  Fork
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AgentCard ─────────────────────────────────────────────────────────────────

interface AgentCardProps {
  agent: AgentConfig;
  mode: 'my' | 'community';
  allTags: string[];
  onSelect?: () => void;
  onFork?: () => void;
  onTogglePublic?: () => void;
  onUpdateTags?: (tags: string[]) => void;
}

function AgentCard({
  agent,
  mode,
  allTags,
  onSelect,
  onFork,
  onTogglePublic,
  onUpdateTags,
}: AgentCardProps) {
  const [showTagEditor, setShowTagEditor] = useState(false);

  const { label: complexLabel, color: complexColor } = complexityLabel(
    agent.nodes.length,
  );
  const tags = agent.hubMeta?.tags ?? [];
  const visibleTags = tags.slice(0, 5);
  const hiddenCount = tags.length - visibleTags.length;
  const forkCount = agent.hubMeta?.forkCount ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50">
      {/* Row 1: name + badges */}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{agent.name}</h3>
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            complexColor,
          )}
        >
          {complexLabel}
        </span>
        {mode === 'my' && agent.isPublic && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            Public
          </Badge>
        )}
      </div>

      {/* Author */}
      {agent.author && (
        <p className="mb-1 text-xs text-muted-foreground">by {agent.author}</p>
      )}

      {/* Description */}
      {agent.description && (
        <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
          {agent.description}
        </p>
      )}

      {/* Tags row */}
      {visibleTags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              +{hiddenCount} more
            </span>
          )}
        </div>
      )}

      {/* Stats + actions row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {agent.nodes.length} nodes · {agent.connections.length} connections
          {forkCount > 0 && (
            <>
              {' '}
              ·{' '}
              <span className="inline-flex items-center gap-0.5">
                <GitFork className="inline h-2.5 w-2.5" />
                {forkCount}
              </span>
            </>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          {/* My Agents: Globe/Lock toggle */}
          {mode === 'my' && onTogglePublic && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title={agent.isPublic ? 'Make private' : 'Make public'}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePublic();
              }}
            >
              {agent.isPublic ? (
                <Globe className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          )}

          {/* My Agents: Tags button (public agents only) */}
          {mode === 'my' && agent.isPublic && onUpdateTags && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setShowTagEditor((v) => !v);
              }}
            >
              Tags
            </Button>
          )}

          {/* Community: Fork button */}
          {mode === 'community' && onFork && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onFork();
              }}
            >
              <GitFork className="h-3 w-3" />
              Fork
            </Button>
          )}

          {/* My Agents: Load button */}
          {mode === 'my' && onSelect && (
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              Load
            </Button>
          )}
        </div>
      </div>

      {/* Inline TagEditor */}
      {mode === 'my' && showTagEditor && onUpdateTags && (
        <TagEditor
          tags={tags}
          allTags={allTags}
          onUpdate={(newTags) => {
            onUpdateTags(newTags);
          }}
        />
      )}
    </div>
  );
}

// ── AgentHubDialog ────────────────────────────────────────────────────────────

const SORT_LABELS: Record<SortKey, string> = {
  forks: 'Most Forked',
  newest: 'Newest',
  az: 'A-Z',
};

export function AgentHubDialog({
  open,
  onOpenChange,
  myAgents,
  onSelectAgent,
  onForkAgent,
  onTogglePublic,
  onUpdateTags,
}: AgentHubDialogProps) {
  const [tab, setTab] = useState<'community' | 'my'>('community');
  const [category, setCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('forks');

  const communityAgents = MOCK_COMMUNITY_AGENTS;
  const allTags = useMemo(
    () => getAllTags([...myAgents, ...communityAgents]),
    [myAgents, communityAgents],
  );

  // Source agents depend on the active tab
  const sourceAgents = tab === 'community' ? communityAgents : myAgents;

  const filteredAgents = useMemo(() => {
    let result = [...sourceAgents];

    // Category filter
    if (category !== 'all') {
      result = result.filter((a) => a.hubMeta?.category === category);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description?.toLowerCase().includes(q) ?? false) ||
          (a.hubMeta?.tags?.some((t) => t.toLowerCase().includes(q)) ?? false),
      );
    }

    // Sort
    switch (sort) {
      case 'forks':
        result.sort(
          (a, b) => (b.hubMeta?.forkCount ?? 0) - (a.hubMeta?.forkCount ?? 0),
        );
        break;
      case 'newest': {
        const ts = (a: AgentConfig) => {
          const t = new Date(a.createdAt).getTime();
          return isNaN(t) ? 0 : t;
        };
        result.sort((a, b) => ts(b) - ts(a));
        break;
      }
      case 'az':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return result;
  }, [sourceAgents, category, searchQuery, sort]);

  // Reset filters when switching tabs
  const handleTabChange = (newTab: 'community' | 'my') => {
    setTab(newTab);
    setCategory('all');
    setSearchQuery('');
    setSort('forks');
  };

  const handleSelect = (agent: AgentConfig) => {
    onSelectAgent(agent);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex sm:max-w-[860px] w-[860px] h-[88vh] max-h-[88vh] flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="border-b border-border px-6 pb-0 pt-4">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base font-semibold">
                Agent Hub
              </DialogTitle>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                WIP
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => handleTabChange('community')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  tab === 'community'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Community
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('my')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  tab === 'my'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                My Agents
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col px-6 py-4 overflow-hidden">
          {/* Trending (Community tab only) */}
          {tab === 'community' && (
            <TrendingSection agents={communityAgents} onFork={onForkAgent} />
          )}

          {/* Category filter bar */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                category === 'all'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              All
            </button>
            {TEMPLATE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  category === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                )}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>

          {/* Search + Sort row */}
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, description or tag…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shrink-0 gap-1.5 text-xs">
                  {SORT_LABELS[sort]}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => setSort('forks')}>
                  Most Forked
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort('newest')}>
                  Newest
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort('az')}>
                  A-Z
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Agent list */}
          <div className="relative flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-3 pr-4">
                {filteredAgents.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    {searchQuery
                      ? 'No agents match your search.'
                      : tab === 'my'
                        ? 'No agents yet. Create one to get started.'
                        : 'No agents in this category.'}
                  </div>
                ) : (
                  filteredAgents.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      mode={tab === 'community' ? 'community' : 'my'}
                      allTags={allTags}
                      onSelect={
                        tab === 'my' ? () => handleSelect(agent) : undefined
                      }
                      onFork={
                        tab === 'community' ? () => onForkAgent(agent) : undefined
                      }
                      onTogglePublic={
                        tab === 'my'
                          ? () => onTogglePublic(agent.id)
                          : undefined
                      }
                      onUpdateTags={
                        tab === 'my' && onUpdateTags
                          ? (tags) => onUpdateTags(agent.id, tags)
                          : undefined
                      }
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Coming Soon Overlay for Community */}
            {tab === 'community' && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-[1px] pointer-events-none">
                <div className="bg-amber-600/90 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl border border-amber-400/50 flex items-center gap-2">
                  <Globe className="h-4 w-4 animate-pulse" />
                  Hub Community Coming Soon (Preview Only)
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
