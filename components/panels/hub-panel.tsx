'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  Activity,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Terminal,
  Trash2,
  TrendingUp,
  Wifi,
  Wrench,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DeployAgentDialog } from '@/components/deployments/deploy-agent-dialog'
import { cn } from '@/lib/utils'
import type { DeploymentDetail, DeploymentStatus, DeploymentSummary } from '@/lib/deployments/types'
import { cleanTerminalOutput } from '@/lib/terminal-output'

// ── Types ─────────────────────────────────────────────────────────────────────

type RuntimeRow = Pick<
  DeploymentSummary,
  | 'id'
  | 'name'
  | 'agentId'
  | 'status'
  | 'openshellSandboxName'
  | 'runtimeKind'
  | 'runtimeCommand'
  | 'lastError'
  | 'lastLog'
  | 'deployedAt'
  | 'stoppedAt'
  | 'createdAt'
  | 'updatedAt'
>

type RuntimeChatMessage = DeploymentDetail['messages'][number]

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
  runtimeCount: number
  activeRuntimeCount: number
  runtimes: RuntimeRow[]
}

interface HubStats {
  totalPrompts: number
  totalAgents: number
  agentsLinked: number
  totalPulls: number
  totalDeployments: number
  activeDeployments: number
  errorDeployments: number
  runtimeEnabled: boolean
}

interface HubPanelProps {
  onOpenAgent: (agentId: string) => void
  onGoToPrompts: () => void
  mcpServerUrl?: string
}

const STATUS_STYLES: Record<DeploymentStatus, string> = {
  pending: 'border-slate-400/40 text-slate-600 dark:text-slate-300',
  provisioning: 'border-blue-400/40 text-blue-600 dark:text-blue-300',
  ready: 'border-green-500/40 text-green-700 dark:text-green-300',
  stopped: 'border-zinc-400/40 text-zinc-600 dark:text-zinc-300',
  error: 'border-red-500/40 text-red-700 dark:text-red-300',
  deleting: 'border-yellow-500/40 text-yellow-700 dark:text-yellow-300',
}

function statusIcon(status: DeploymentStatus) {
  if (status === 'ready') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (status === 'error') return <XCircle className="h-3.5 w-3.5" />
  if (status === 'pending' || status === 'provisioning' || status === 'deleting') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" />
  }
  return <CircleStop className="h-3.5 w-3.5" />
}

function runtimeActivity(runtime: RuntimeRow | null, prompt: PromptRow): string {
  const timestamp = runtime?.updatedAt ?? prompt.lastPulledAt ?? prompt.updatedAt
  return timestamp ? formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : 'Never'
}

function copyCommand(command: string) {
  navigator.clipboard.writeText(command).then(
    () => toast.success('Command copied'),
    () => toast.error('Could not copy command'),
  )
}

function estimateTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  const clean = text.trim()
  return clean ? Math.ceil(clean.length / 4) : 0
}

function formatTokens(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k` : count.toLocaleString()
}

function metadataNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function messageTokenCount(message: RuntimeChatMessage): number {
  const metadata = metadataRecord(message.metadata)
  const estimated = metadataRecord(metadata?.estimatedTokens)
  return metadataNumber(estimated?.output)
    ?? metadataNumber(estimated?.input)
    ?? estimateTokens(message.content)
}

function messageMetaSummary(message: RuntimeChatMessage): string | null {
  const metadata = metadataRecord(message.metadata)
  if (!metadata) return null

  if (message.role === 'tool') {
    const toolName = typeof metadata.toolName === 'string' ? metadata.toolName : null
    const sourcePath = typeof metadata.sourcePath === 'string' ? metadata.sourcePath : null
    const command = typeof metadata.command === 'string' ? metadata.command : null
    return [toolName, sourcePath ?? command].filter(Boolean).join(' · ') || null
  }

  if (message.role === 'thinking') {
    const traceType = typeof metadata.traceType === 'string' ? metadata.traceType : null
    const toolName = typeof metadata.toolName === 'string' ? metadata.toolName : null
    const durationMs = metadataNumber(metadata.durationMs)
    return [
      traceType,
      toolName,
      durationMs !== null ? `${Math.round(durationMs)}ms` : null,
    ].filter(Boolean).join(' · ') || null
  }

  const estimated = metadataRecord(metadata.estimatedTokens)
  const input = metadataNumber(estimated?.input)
  const output = metadataNumber(estimated?.output)
  const durationMs = metadataNumber(metadata.durationMs)
  const pieces = [
    input !== null ? `in ~${formatTokens(input)}` : null,
    output !== null ? `out ~${formatTokens(output)}` : null,
    durationMs !== null ? `${Math.round(durationMs)}ms` : null,
  ]
  return pieces.filter(Boolean).join(' · ') || null
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/50 bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function RuntimeBadge({ status }: { status: DeploymentStatus }) {
  return (
    <Badge variant="outline" className={cn('gap-1 text-[10px]', STATUS_STYLES[status])}>
      {statusIcon(status)}
      {status}
    </Badge>
  )
}

// ── PromptRowItem ─────────────────────────────────────────────────────────────

function PromptRowItem({
  prompt,
  onOpenAgent,
  onDeployPrompt,
  onRefresh,
  runtimeEnabled,
}: {
  prompt: PromptRow
  onOpenAgent: (id: string) => void
  onDeployPrompt: (prompt: PromptRow) => void
  onRefresh: () => Promise<void>
  runtimeEnabled: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [selectedRuntimeId, setSelectedRuntimeId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DeploymentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [logs, setLogs] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const selectedRuntime = prompt.runtimes.find((runtime) => runtime.id === selectedRuntimeId) ?? prompt.runtimes[0] ?? null
  const lastPull = prompt.lastPulledAt
    ? [formatDistanceToNow(new Date(prompt.lastPulledAt), { addSuffix: true }), prompt.lastPulledBy].filter(Boolean).join(' · ')
    : 'Never'
  const promptTokens = estimateTokens(detail?.pinnedPrompt ?? prompt.contentPreview)
  const packageTokens = estimateTokens(detail?.runtimePackage ?? {})
  const chatTokens = (detail?.messages ?? []).reduce((sum, message) => sum + estimateTokens(message.content), 0)
  const inputTokens = estimateTokens(chatInput)
  const nextRunTokens = promptTokens + inputTokens

  const fetchDetail = useCallback(async (deploymentId: string | null) => {
    if (!deploymentId) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/deployments/${deploymentId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load runtime')
      setDetail(data.deployment)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load runtime')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!expanded) return
    if (selectedRuntimeId && prompt.runtimes.some((runtime) => runtime.id === selectedRuntimeId)) return
    setSelectedRuntimeId(prompt.runtimes[0]?.id ?? null)
  }, [expanded, prompt.runtimes, selectedRuntimeId])

  useEffect(() => {
    if (!expanded) return
    setLogs('')
    fetchDetail(selectedRuntime?.id ?? null)
  }, [expanded, selectedRuntime?.id, fetchDetail])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [detail?.messages.length, busyAction])

  function optimisticChatMessage(role: RuntimeChatMessage['role'], content: string, status: RuntimeChatMessage['status'] = 'success'): RuntimeChatMessage {
    return {
      id: `optimistic-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      status,
      metadata: {},
      createdAt: new Date().toISOString(),
    }
  }

  async function runAction(action: 'start' | 'stop' | 'restart' | 'delete') {
    if (!selectedRuntime) return
    if (!runtimeEnabled) {
      toast.error('OpenShell runtime is disabled in config')
      return
    }
    setBusyAction(action)
    try {
      const url = action === 'delete'
        ? `/api/deployments/${selectedRuntime.id}`
        : `/api/deployments/${selectedRuntime.id}/${action}`
      const res = await fetch(url, { method: action === 'delete' ? 'DELETE' : 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action} runtime`)
      toast.success(action === 'delete' ? 'Runtime deleted' : `Runtime ${action} requested`)
      if (action === 'delete') {
        setSelectedRuntimeId(null)
        setDetail(null)
        setLogs('')
      }
      await onRefresh()
      if (action !== 'delete') await fetchDetail(selectedRuntime.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} runtime`)
    } finally {
      setBusyAction(null)
    }
  }

  async function fetchLogs() {
    if (!selectedRuntime) return
    if (!runtimeEnabled) {
      toast.error('OpenShell runtime is disabled in config')
      return
    }
    setBusyAction('logs')
    try {
      const res = await fetch(`/api/deployments/${selectedRuntime.id}/logs`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch logs')
      setLogs(data.logs ?? '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch logs')
    } finally {
      setBusyAction(null)
    }
  }

  async function sendMessage() {
    if (!selectedRuntime || !chatInput.trim()) return
    if (!runtimeEnabled) {
      toast.error('OpenShell runtime is disabled in config')
      return
    }
    const deploymentId = selectedRuntime.id
    const message = chatInput.trim()
    const pendingAssistant = optimisticChatMessage('assistant', 'Waiting for runtime response...', 'pending')
    setChatInput('')
    setDetail((current) => current?.id === deploymentId
      ? {
          ...current,
          messages: [
            ...current.messages,
            optimisticChatMessage('user', message),
            pendingAssistant,
          ],
        }
      : current)
    setBusyAction('chat')
    try {
      const res = await fetch(`/api/deployments/${deploymentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Runtime chat failed')
      setDetail(data.deployment)
      await onRefresh()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Runtime chat failed'
      setDetail((current) => current?.id === deploymentId
        ? {
            ...current,
            messages: current.messages.map((item) => item.id === pendingAssistant.id
              ? { ...item, content: error, status: 'error' }
              : item),
          }
        : current)
      toast.error(error)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-card">
      <div
        className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium">{prompt.name}</span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              prompt.status === 'active'
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-muted text-muted-foreground',
            )}>
              {prompt.status}
            </span>
          </div>
          {prompt.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{prompt.description}</p>
          )}
        </div>

        <div className="w-44 shrink-0">
          {prompt.runtimeCount === 0 ? (
            <span className="text-xs text-muted-foreground">No agent runtime</span>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tabular-nums">
                {prompt.activeRuntimeCount}/{prompt.runtimeCount} running
              </span>
              <div className="flex gap-1">
                {prompt.runtimes.slice(0, 2).map((runtime) => (
                  <span
                    key={runtime.id}
                    className={cn(
                      'h-1.5 w-6 rounded-full',
                      runtime.status === 'ready' && 'bg-green-500',
                      runtime.status === 'provisioning' && 'bg-blue-500',
                      runtime.status === 'error' && 'bg-red-500',
                      runtime.status === 'stopped' && 'bg-muted-foreground/50',
                      (runtime.status === 'pending' || runtime.status === 'deleting') && 'bg-yellow-500',
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-32 shrink-0 text-sm">
          {prompt.agentCount === 0 ? (
            <span className="text-xs text-muted-foreground">-</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {prompt.agents.slice(0, 2).map((agent) => (
                <span
                  key={agent.id}
                  className="max-w-[70px] truncate rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  {agent.name}
                </span>
              ))}
              {prompt.agentCount > 2 && (
                <span className="text-[10px] text-muted-foreground">+{prompt.agentCount - 2}</span>
              )}
            </div>
          )}
        </div>

        <div className="w-40 shrink-0 truncate text-xs text-muted-foreground">
          {runtimeActivity(selectedRuntime, prompt)}
        </div>

        <div className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {prompt.pullCount > 0 ? `${prompt.pullCount} pull${prompt.pullCount !== 1 ? 's' : ''}` : ''}
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 border-t border-border/30 bg-muted/20 px-4 py-4">
          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Boxes className="h-3.5 w-3.5" />
                  OpenShell agent runtimes
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!runtimeEnabled}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeployPrompt(prompt)
                  }}
                >
                  <Rocket className="h-3.5 w-3.5" />
                  Create agent
                </Button>
              </div>

              <div className="space-y-2">
                {prompt.runtimes.length === 0 ? (
                  <div className="rounded-md border border-border/50 bg-background p-3 text-xs text-muted-foreground">
                    No OpenShell agent runtime is pinned to this prompt.
                  </div>
                ) : prompt.runtimes.map((runtime) => (
                  <button
                    key={runtime.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedRuntimeId(runtime.id)
                    }}
                    className={cn(
                      'w-full rounded-md border p-3 text-left transition-colors',
                      selectedRuntime?.id === runtime.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/50 bg-background hover:border-border',
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{runtime.name}</div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {runtime.openshellSandboxName}
                        </div>
                      </div>
                      <RuntimeBadge status={runtime.status} />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>agent: {runtime.runtimeKind}</span>
                      <span>{formatDistanceToNow(new Date(runtime.updatedAt), { addSuffix: true })}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-md border border-border/50 bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Terminal className="h-3.5 w-3.5" />
                    OpenShell CLI
                  </div>
                  <button
                    title="Copy command"
                    onClick={(event) => {
                      event.stopPropagation()
                      copyCommand('openshell term')
                    }}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <code className="block overflow-hidden text-ellipsis whitespace-nowrap rounded bg-muted px-2 py-1.5 font-mono text-xs">
                  openshell term
                </code>
              </div>
            </section>

            <section className="min-w-0 space-y-3">
              {!selectedRuntime ? (
                <div className="space-y-3">
                  {prompt.agents.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Agents using this prompt</p>
                      <div className="flex flex-wrap gap-1.5">
                        {prompt.agents.map((agent) => (
                          <button
                            key={agent.id}
                            onClick={(event) => {
                              event.stopPropagation()
                              onOpenAgent(agent.id)
                            }}
                            className="flex items-center gap-1 rounded-md border border-border/50 bg-background px-2 py-1 text-xs transition-colors hover:border-primary/50 hover:text-primary"
                          >
                            {agent.name}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Prompt preview</p>
                    <pre className="max-h-40 overflow-auto rounded-md border border-border/30 bg-background p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                      {prompt.contentPreview || 'No prompt preview'}
                    </pre>
                  </div>
                  {prompt.lastPulledAt && (
                    <p className="text-xs text-muted-foreground">Last pulled {lastPull}</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-background px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <RuntimeBadge status={selectedRuntime.status} />
                        <span className="truncate text-sm font-medium">{selectedRuntime.name}</span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {selectedRuntime.openshellSandboxName}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => runAction('start')} disabled={!!busyAction || !runtimeEnabled}>
                      <Play className="h-3.5 w-3.5" />
                      Start
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runAction('stop')} disabled={!!busyAction || !runtimeEnabled}>
                      <CircleStop className="h-3.5 w-3.5" />
                      Kill
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => runAction('restart')} disabled={!!busyAction || !runtimeEnabled}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Restart
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => runAction('delete')} disabled={!!busyAction || !runtimeEnabled} className="text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Agent runtime command</p>
                      <pre className="max-h-32 overflow-auto rounded-md border border-border/30 bg-background p-2 font-mono text-xs whitespace-pre-wrap">
                        {selectedRuntime.runtimeCommand}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Pinned prompt</p>
                      <pre className="max-h-32 overflow-auto rounded-md border border-border/30 bg-background p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                        {detailLoading ? 'Loading...' : detail?.pinnedPrompt ?? prompt.contentPreview}
                      </pre>
                    </div>
                  </div>

                  <div className="grid min-h-[320px] gap-3 xl:grid-cols-2">
                    <div className="flex min-h-0 flex-col rounded-md border border-border/50 bg-background">
                      <div className="flex flex-wrap items-center gap-2 border-b border-border/30 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Agent runtime chat
                        </div>
                        <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                          prompt ~{formatTokens(promptTokens)}
                        </Badge>
                        <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                          package ~{formatTokens(packageTokens)}
                        </Badge>
                        <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                          chat ~{formatTokens(chatTokens)}
                        </Badge>
                      </div>
                      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                        {detailLoading && <div className="text-xs text-muted-foreground">Loading...</div>}
                        {detail && detail.messages.length === 0 && (
                          <div className="text-xs text-muted-foreground">No messages yet</div>
                        )}
                        {detail?.messages.map((message) => {
                          const metaSummary = messageMetaSummary(message)
                          return (
                            <div
                              key={message.id}
                              className={cn(
                                'rounded-md border p-2',
                                message.role === 'user'
                                  ? 'border-primary/20 bg-primary/5'
                                  : message.role === 'tool'
                                    ? 'border-amber-500/30 bg-amber-500/5'
                                    : message.role === 'thinking'
                                      ? 'border-sky-500/30 bg-sky-500/5'
                                    : message.status === 'error'
                                      ? 'border-destructive/30 bg-destructive/5'
                                      : 'border-border/40 bg-muted/30',
                              )}
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="inline-flex min-w-0 items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground">
                                  {message.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
                                  {message.role === 'tool' && <Wrench className="h-3 w-3 text-amber-500" />}
                                  {message.role === 'thinking' && <BrainCircuit className="h-3 w-3 text-sky-500" />}
                                  <span>{message.role}</span>
                                  <Badge variant="outline" className="h-4 px-1 text-[9px] normal-case text-muted-foreground">
                                    ~{formatTokens(messageTokenCount(message))} tokens
                                  </Badge>
                                </span>
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                                </span>
                              </div>
                              {metaSummary && (
                                <div className="mb-2 truncate text-[10px] text-muted-foreground">{metaSummary}</div>
                              )}
                              <pre className={cn('whitespace-pre-wrap break-words text-xs leading-relaxed', message.status === 'pending' && 'text-muted-foreground')}>
                                {cleanTerminalOutput(message.content)}
                              </pre>
                            </div>
                          )
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                      <div className="border-t border-border/30 p-2">
                        <div className="flex gap-2">
                          <Input
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault()
                                void sendMessage()
                              }
                            }}
                            placeholder="Send CLI input..."
                            className="h-8 text-xs"
                            disabled={!runtimeEnabled}
                          />
                          <Button size="sm" onClick={sendMessage} disabled={busyAction === 'chat' || !chatInput.trim() || !runtimeEnabled}>
                            {busyAction === 'chat' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send'}
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                          <span>input ~{formatTokens(inputTokens)} tokens</span>
                          <span>next run ~{formatTokens(nextRunTokens)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex min-h-0 flex-col rounded-md border border-border/50 bg-background">
                      <div className="flex items-center justify-between gap-2 border-b border-border/30 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Terminal className="h-3.5 w-3.5" />
                          Sandbox logs
                        </div>
                        <Button size="sm" variant="outline" onClick={fetchLogs} disabled={busyAction === 'logs' || !runtimeEnabled}>
                          {busyAction === 'logs'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </div>
                      <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                        {logs || selectedRuntime.lastLog || selectedRuntime.lastError || 'No logs loaded'}
                      </pre>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
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
  const [deployTarget, setDeployTarget] = useState<PromptRow | null>(null)
  const runtimeEnabled = stats?.runtimeEnabled !== false

  const fetchData = useCallback(async () => {
    setLoading(true)
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
    } catch {
      toast.error('Failed to load Agent Hub')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${mcpServerUrl}/api/sessions`)
      if (res.ok) {
        const data = await res.json()
        setActiveSessions((data.active ?? []).length)
      }
    } catch { /* MCP server can be unavailable in partial local stacks. */ }
  }, [mcpServerUrl])

  useEffect(() => {
    fetchData()
    fetchSessions()
    const interval = setInterval(() => {
      fetchData()
      fetchSessions()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchData, fetchSessions])

  const filtered = prompts.filter((prompt) =>
    !search ||
    prompt.name.toLowerCase().includes(search.toLowerCase()) ||
    (prompt.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
    prompt.runtimes.some((runtime) =>
      runtime.name.toLowerCase().includes(search.toLowerCase()) ||
      runtime.openshellSandboxName.toLowerCase().includes(search.toLowerCase())
    )
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-6">
          <h1 className="text-base font-semibold">Agent Hub</h1>
          <div className="flex-1" />
          <div className="hidden items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2.5 py-1.5 font-mono text-xs md:flex">
            <Terminal className="h-3.5 w-3.5 text-primary" />
            <span>openshell term</span>
            <button
              title="Copy command"
              onClick={() => copyCommand('openshell term')}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={onGoToPrompts}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            + New Prompt
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={FileText} label="Total Prompts" value={stats?.totalPrompts ?? '-'} />
          <StatCard
            icon={Boxes}
            label="OpenShell Agents"
            value={stats?.totalDeployments ?? '-'}
            sub={stats ? (runtimeEnabled ? `${stats.errorDeployments} errors` : 'runtime disabled') : undefined}
          />
          <StatCard
            icon={Activity}
            label="Running"
            value={stats?.activeDeployments ?? '-'}
            sub="agent runtimes"
          />
          <StatCard icon={TrendingUp} label="Total Pulls" value={stats?.totalPulls ?? '-'} sub="all time" />
          <StatCard icon={Wifi} label="Active Clients" value={activeSessions} sub="connected now" />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search prompts or agent runtimes..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        {!runtimeEnabled && (
          <div className="rounded-md border border-border/50 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            OpenShell runtime is disabled by config. Prompts and existing runtime records remain visible, but create/chat/log/start/kill/restart/delete actions are unavailable.
          </div>
        )}

        <div className="flex items-center gap-4 border-b border-border/30 px-4 pb-2 text-xs font-medium text-muted-foreground">
          <span className="w-4 shrink-0" />
          <span className="flex-1">Prompt</span>
          <span className="w-44 shrink-0">OpenShell agents</span>
          <span className="w-32 shrink-0">Agents using</span>
          <span className="w-40 shrink-0">Last activity</span>
          <span className="w-16 shrink-0 text-right">Pulls</span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-1 font-medium">
              {search ? 'No prompts or runtimes match your search' : 'No prompts yet'}
            </h3>
            {!search && (
              <p className="mb-4 text-sm text-muted-foreground">
                Create a prompt in the Prompts panel.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((prompt) => (
              <PromptRowItem
                key={prompt.id}
                prompt={prompt}
                onOpenAgent={onOpenAgent}
                onDeployPrompt={setDeployTarget}
                onRefresh={fetchData}
                runtimeEnabled={runtimeEnabled}
              />
            ))}
          </div>
        )}
      </div>

      <DeployAgentDialog
        open={!!deployTarget}
        onOpenChange={(open) => {
          if (!open) setDeployTarget(null)
        }}
        agentId={deployTarget?.id ?? null}
        agentName={deployTarget?.name ?? null}
        runtimeEnabled={runtimeEnabled}
        onCreated={() => {
          setDeployTarget(null)
          fetchData()
        }}
      />
    </div>
  )
}
