'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  FileText, ChevronDown, ChevronRight, ExternalLink,
  TrendingUp, Users, Wifi, Search,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromptRow {
  id: string
  name: string
  description: string | null
  contentPreview: string
  status: 'active' | 'draft'
  pullCount: number
  lastPulledAt: string | null
  lastPulledBy: string | null
  updatedAt: string
  agentCount: number
  agents: Array<{ id: string; name: string }>
}

interface HubStats {
  totalPrompts: number
  totalAgents: number
  agentsLinked: number
  totalPulls: number
}

interface HubPanelProps {
  onOpenAgent: (agentId: string) => void
  onGoToPrompts: () => void
  mcpServerUrl?: string
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/50 bg-card px-4 py-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

// ── PromptRowItem ─────────────────────────────────────────────────────────────

function PromptRowItem({ prompt, onOpenAgent }: {
  prompt: PromptRow
  onOpenAgent: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const lastPull = prompt.lastPulledAt
    ? `${formatDistanceToNow(new Date(prompt.lastPulledAt), { addSuffix: true })} · ${prompt.lastPulledBy ?? ''}`
    : 'Never'

  return (
    <div className="border border-border/50 rounded-lg bg-card overflow-hidden">
      {/* Main row */}
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Expand icon */}
        <span className="text-muted-foreground shrink-0">
          {expanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />
          }
        </span>

        {/* Name + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm font-medium truncate">{prompt.name}</span>
          </div>
          {prompt.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{prompt.description}</p>
          )}
        </div>

        {/* Agents using it */}
        <div className="shrink-0 w-32 text-sm">
          {prompt.agentCount === 0 ? (
            <span className="text-muted-foreground text-xs">—</span>
          ) : (
            <div className="flex items-center gap-1 flex-wrap">
              {prompt.agents.slice(0, 2).map(a => (
                <span
                  key={a.id}
                  className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium truncate max-w-[70px]"
                >
                  {a.name}
                </span>
              ))}
              {prompt.agentCount > 2 && (
                <span className="text-[10px] text-muted-foreground">+{prompt.agentCount - 2}</span>
              )}
            </div>
          )}
        </div>

        {/* Last pulled */}
        <div className="shrink-0 w-40 text-xs text-muted-foreground truncate">
          {lastPull}
        </div>

        {/* Status */}
        <div className="shrink-0 w-20">
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            prompt.status === 'active'
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-muted text-muted-foreground'
          )}>
            {prompt.status}
          </span>
        </div>

        {/* Pull count */}
        <div className="shrink-0 w-16 text-xs text-muted-foreground text-right tabular-nums">
          {prompt.pullCount > 0 ? `${prompt.pullCount} pull${prompt.pullCount !== 1 ? 's' : ''}` : ''}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-border/30 px-4 py-3 bg-muted/20 space-y-3">
          {/* Agent list */}
          {prompt.agents.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Agents using this prompt</p>
              <div className="flex flex-wrap gap-1.5">
                {prompt.agents.map(a => (
                  <button
                    key={a.id}
                    onClick={e => { e.stopPropagation(); onOpenAgent(a.id) }}
                    className="flex items-center gap-1 rounded-md bg-background border border-border/50 px-2 py-1 text-xs hover:border-primary/50 hover:text-primary transition-colors"
                  >
                    {a.name}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No agents are using this prompt yet.</p>
          )}

          {/* Content preview */}
          {prompt.contentPreview && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Preview</p>
              <pre className="text-xs text-muted-foreground bg-background border border-border/30 rounded p-2 line-clamp-3 whitespace-pre-wrap font-mono">
                {prompt.contentPreview}
              </pre>
            </div>
          )}

          {/* Last pull info */}
          {prompt.lastPulledAt && (
            <p className="text-xs text-muted-foreground">
              Last pulled {lastPull}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── HubPanel ──────────────────────────────────────────────────────────────────

export function HubPanel({ onOpenAgent, onGoToPrompts, mcpServerUrl = 'http://localhost:3100' }: HubPanelProps) {
  const [stats, setStats] = useState<HubStats | null>(null)
  const [prompts, setPrompts] = useState<PromptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeSessions, setActiveSessions] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, promptsRes] = await Promise.all([
        fetch('/api/hub/stats'),
        fetch('/api/hub/prompts'),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (promptsRes.ok) {
        const data = await promptsRes.json()
        setPrompts(data.prompts ?? [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${mcpServerUrl}/api/sessions`)
      if (res.ok) {
        const data = await res.json()
        setActiveSessions((data.active ?? []).length)
      }
    } catch { /* ignore */ }
  }, [mcpServerUrl])

  useEffect(() => {
    fetchData()
    fetchSessions()
    const interval = setInterval(fetchSessions, 10000)
    return () => clearInterval(interval)
  }, [fetchData, fetchSessions])

  const filtered = prompts.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur shrink-0">
        <div className="px-6 h-14 flex items-center gap-3">
          <h1 className="text-base font-semibold">Agent Hub</h1>
          <div className="flex-1" />
          <button
            onClick={onGoToPrompts}
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            + New Prompt
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard icon={FileText} label="Total Prompts" value={stats?.totalPrompts ?? '—'} />
          <StatCard
            icon={Users}
            label="Agents Linked"
            value={stats?.agentsLinked ?? '—'}
            sub={stats ? `of ${stats.totalAgents} agents` : undefined}
          />
          <StatCard icon={TrendingUp} label="Total Pulls" value={stats?.totalPulls ?? '—'} sub="all time" />
          <StatCard
            icon={Wifi}
            label="Active Clients"
            value={activeSessions}
            sub="connected now"
          />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search prompts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table header */}
        <div className="flex items-center gap-4 px-4 text-xs font-medium text-muted-foreground border-b border-border/30 pb-2">
          <span className="w-4 shrink-0" />
          <span className="flex-1">Prompt</span>
          <span className="w-32 shrink-0">Agents using</span>
          <span className="w-40 shrink-0">Last pulled</span>
          <span className="w-20 shrink-0">Status</span>
          <span className="w-16 shrink-0 text-right">Pulls</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-1">
              {search ? 'No prompts match your search' : 'No prompts yet'}
            </h3>
            {!search && (
              <p className="text-sm text-muted-foreground mb-4">
                Create a prompt in the Prompts panel — it will appear here once created.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <PromptRowItem key={p.id} prompt={p} onOpenAgent={onOpenAgent} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
