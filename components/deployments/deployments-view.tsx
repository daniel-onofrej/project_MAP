'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Boxes,
  BrainCircuit,
  CheckCircle2,
  CircleStop,
  FileCode2,
  KeyRound,
  Loader2,
  MessageSquare,
  Network,
  Play,
  Plug,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Trash2,
  XCircle,
  Wrench,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { DeployAgentDialog } from './deploy-agent-dialog'
import type { DeploymentDetail, DeploymentStatus, DeploymentSummary } from '@/lib/deployments/types'
import { cleanTerminalOutput } from '@/lib/terminal-output'

type RuntimeChatMessage = DeploymentDetail['messages'][number]

type DeploymentsViewProps = {
  initialAgentId?: string | null
  initialAgentName?: string | null
  onOpenAgent?: (agentId: string) => void
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
  if (status === 'provisioning' || status === 'pending' || status === 'deleting') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" />
  }
  return <CircleStop className="h-3.5 w-3.5" />
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

export function DeploymentsView({
  initialAgentId,
  initialAgentName,
  onOpenAgent,
}: DeploymentsViewProps) {
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DeploymentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deployOpen, setDeployOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [logs, setLogs] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [runtimeEnabled, setRuntimeEnabled] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const selected = useMemo(
    () => deployments.find((deployment) => deployment.id === selectedId) ?? null,
    [deployments, selectedId],
  )

  const contextStats = useMemo(() => {
    const pinnedPrompt = detail?.pinnedPrompt ?? ''
    const runtimePackage = selected?.runtimePackage ?? {}
    const messages = detail?.messages ?? []
    const promptTokens = estimateTokens(pinnedPrompt)
    const packageTokens = estimateTokens(runtimePackage)
    const chatTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0)
    const inputTokens = estimateTokens(chatInput)
    return {
      promptTokens,
      packageTokens,
      chatTokens,
      inputTokens,
      nextRunTokens: promptTokens + inputTokens,
      visibleTokens: promptTokens + packageTokens + chatTokens + inputTokens,
    }
  }, [chatInput, detail?.messages, detail?.pinnedPrompt, selected?.runtimePackage])

  const fetchDeployments = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/deployments')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load deployments')
      const list: DeploymentSummary[] = data.deployments ?? []
      setRuntimeEnabled(data.runtimeEnabled !== false)
      setDeployments(list)
      setSelectedId((current) => current ?? list.find(item => item.agentId === initialAgentId)?.id ?? list[0]?.id ?? null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load deployments')
    } finally {
      setLoading(false)
    }
  }, [initialAgentId])

  const fetchDetail = useCallback(async (id: string | null) => {
    if (!id) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/deployments/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to load deployment')
      setDetail(data.deployment)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load deployment')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeployments()
  }, [fetchDeployments])

  useEffect(() => {
    fetchDetail(selectedId)
  }, [fetchDetail, selectedId])

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
    if (!selectedId) return
    if (!runtimeEnabled) {
      toast.error('OpenShell runtime is disabled in config')
      return
    }
    setBusyAction(action)
    try {
      const url = action === 'delete'
        ? `/api/deployments/${selectedId}`
        : `/api/deployments/${selectedId}/${action}`
      const res = await fetch(url, { method: action === 'delete' ? 'DELETE' : 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Failed to ${action} deployment`)
      toast.success(action === 'delete' ? 'Deployment deleted' : `Deployment ${action} requested`)
      if (action === 'delete') {
        setSelectedId(null)
        setDetail(null)
      }
      await fetchDeployments()
      if (selectedId && action !== 'delete') await fetchDetail(selectedId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} deployment`)
    } finally {
      setBusyAction(null)
    }
  }

  async function sendMessage() {
    if (!selectedId || !chatInput.trim()) return
    if (!runtimeEnabled) {
      toast.error('OpenShell runtime is disabled in config')
      return
    }
    const deploymentId = selectedId
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
      if (!res.ok) throw new Error(data.error ?? 'Chat failed')
      setDetail(data.deployment)
      await fetchDeployments()
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Chat failed'
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

  async function fetchLogs() {
    if (!selectedId) return
    if (!runtimeEnabled) {
      toast.error('OpenShell runtime is disabled in config')
      return
    }
    setBusyAction('logs')
    try {
      const res = await fetch(`/api/deployments/${selectedId}/logs`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch logs')
      setLogs(cleanTerminalOutput(data.logs))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch logs')
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border/50 bg-background/95 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Boxes className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-base font-semibold leading-none">Sandboxes</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? 'Loading...' : `${deployments.length} deployment${deployments.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <Button size="sm" onClick={() => setDeployOpen(true)} disabled={!runtimeEnabled} className="gap-1.5">
            <Rocket className="h-4 w-4" />
            Create Runtime
          </Button>
        </div>
      </header>

      <div className="grid flex-1 min-h-0 grid-cols-[320px_1fr]">
        <aside className="border-r border-border/50 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {!runtimeEnabled && (
                <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                  OpenShell runtime is disabled by config. Existing sandboxes can be inspected, but runtime actions are unavailable.
                </div>
              )}
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-24 rounded-md bg-muted animate-pulse" />
                ))
              ) : deployments.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  <Boxes className="mx-auto mb-3 h-10 w-10 opacity-50" />
                  No sandboxes
                </div>
              ) : deployments.map((deployment) => (
                <button
                  key={deployment.id}
                  onClick={() => setSelectedId(deployment.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedId === deployment.id
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/50 bg-card hover:border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{deployment.name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{deployment.agentName ?? deployment.agentId}</div>
                    </div>
                    <Badge variant="outline" className={`gap-1 text-[10px] ${STATUS_STYLES[deployment.status]}`}>
                      {statusIcon(deployment.status)}
                      {deployment.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{deployment.runtimeKind}</span>
                    <span>{formatDistanceToNow(new Date(deployment.updatedAt), { addSuffix: true })}</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>

        <main className="min-h-0 overflow-hidden">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a sandbox
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-border/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-semibold">{selected.name}</h2>
                      <Badge variant="outline" className={`gap-1 text-[10px] ${STATUS_STYLES[selected.status]}`}>
                        {statusIcon(selected.status)}
                        {selected.status}
                      </Badge>
                    </div>
                    <button
                      className="mt-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => onOpenAgent?.(selected.agentId)}
                    >
                      {selected.agentName ?? selected.agentId}
                    </button>
                  </div>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => runAction('start')} disabled={!!busyAction || !runtimeEnabled}>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Start
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runAction('stop')} disabled={!!busyAction || !runtimeEnabled}>
                    <CircleStop className="mr-1.5 h-3.5 w-3.5" />
                    Stop
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runAction('restart')} disabled={!!busyAction || !runtimeEnabled}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Restart
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => runAction('delete')} disabled={!!busyAction || !runtimeEnabled} className="text-destructive">
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>

              <div className="grid flex-1 min-h-0 grid-cols-[1fr_380px]">
                <section className="flex min-h-0 flex-col">
                  <div className="border-b border-border/50 px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Runtime Chat
                      </div>
                      <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                        prompt ~{formatTokens(contextStats.promptTokens)}
                      </Badge>
                      <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                        package ~{formatTokens(contextStats.packageTokens)}
                      </Badge>
                      <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                        chat ~{formatTokens(contextStats.chatTokens)}
                      </Badge>
                      <Badge variant="outline" className="h-5 border-primary/30 text-[10px] text-primary">
                        next run ~{formatTokens(contextStats.nextRunTokens)}
                      </Badge>
                    </div>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="space-y-3 p-4">
                      {detailLoading && <div className="text-sm text-muted-foreground">Loading...</div>}
                      {detail?.messages.length === 0 && (
                        <div className="text-sm text-muted-foreground">No messages yet</div>
                      )}
                      {detail?.messages.map((message) => {
                        const metaSummary = messageMetaSummary(message)
                        return (
                          <div key={message.id} className={`rounded-md border p-3 ${
                            message.role === 'user'
                              ? 'bg-primary/5 border-primary/20'
                              : message.role === 'tool'
                                ? 'bg-amber-500/5 border-amber-500/30'
                                : message.role === 'thinking'
                                  ? 'bg-sky-500/5 border-sky-500/30'
                                : message.status === 'error'
                                  ? 'bg-destructive/5 border-destructive/30'
                                  : 'bg-card border-border/50'
                          }`}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
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
                            <pre className={`whitespace-pre-wrap break-words text-xs leading-relaxed ${message.status === 'pending' ? 'text-muted-foreground' : ''}`}>
                              {cleanTerminalOutput(message.content)}
                            </pre>
                          </div>
                        )
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  <div className="border-t border-border/50 p-3">
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
                        placeholder="Message runtime..."
                        disabled={!runtimeEnabled}
                      />
                      <Button onClick={sendMessage} disabled={busyAction === 'chat' || !chatInput.trim() || !runtimeEnabled}>
                        {busyAction === 'chat' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span>input ~{formatTokens(contextStats.inputTokens)} tokens</span>
                      <span>prompt+input ~{formatTokens(contextStats.nextRunTokens)}</span>
                      <span>visible context ~{formatTokens(contextStats.visibleTokens)}</span>
                    </div>
                  </div>
                </section>

                <aside className="min-h-0 border-l border-border/50">
                  <ScrollArea className="h-full">
                    <div className="space-y-4 p-4">
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runtime</div>
                        <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                          <div className="mb-1 text-xs text-muted-foreground">{selected.openshellSandboxName}</div>
                          <pre className="whitespace-pre-wrap break-words text-xs">{selected.runtimeCommand}</pre>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <InfoPanel
                          icon={<MessageSquare className="h-3.5 w-3.5" />}
                          title="Context counters"
                          empty="No visible context"
                          items={[
                            `Prompt: ~${formatTokens(contextStats.promptTokens)} tokens`,
                            `Runtime package: ~${formatTokens(contextStats.packageTokens)} tokens`,
                            `Chat history: ~${formatTokens(contextStats.chatTokens)} tokens`,
                            `Next message input: ~${formatTokens(contextStats.inputTokens)} tokens`,
                            `Visible total: ~${formatTokens(contextStats.visibleTokens)} tokens`,
                          ]}
                        />
                        <InfoPanel
                          icon={<Wrench className="h-3.5 w-3.5" />}
                          title="Tools shipped"
                          empty="No packaged tools"
                          items={selected.runtimePackage.tools.map((tool) => `${tool.name}: ${tool.command}${tool.description ? ` — ${tool.description}` : ''}`)}
                        />
                        <InfoPanel
                          icon={<FileCode2 className="h-3.5 w-3.5" />}
                          title="Scripts and files"
                          empty="No packaged scripts or files"
                          items={[
                            ...selected.runtimePackage.scripts.map((script) => `${script.path}${script.runOnStart ? ' (startup)' : ''}`),
                            ...selected.runtimePackage.files.map((file) => file.path),
                          ]}
                        />
                        <InfoPanel
                          icon={<KeyRound className="h-3.5 w-3.5" />}
                          title="Environment"
                          empty="No runtime env variables"
                          items={[
                            ...Object.keys(selected.runtimePackage.env).map((key) => `${key}=${selected.runtimePackage.env[key]}`),
                            ...Object.entries(selected.runtimePackage.secretEnv).map(([runtimeKey, sourceKey]) => `${runtimeKey}=<secret from ${sourceKey}>`),
                          ]}
                        />
                        <InfoPanel
                          icon={<Network className="h-3.5 w-3.5" />}
                          title="Ports"
                          empty="No declared ports"
                          items={selected.runtimePackage.ports.map((port) => `${port.name}: ${port.protocol}/${port.port} (${port.exposure})${port.description ? ` — ${port.description}` : ''}`)}
                        />
                        <InfoPanel
                          icon={<Plug className="h-3.5 w-3.5" />}
                          title="Connections"
                          empty="No declared connections"
                          items={selected.runtimePackage.connections.map((connection) => `${connection.direction}: ${connection.name} -> ${connection.target}${connection.description ? ` — ${connection.description}` : ''}`)}
                        />
                        <InfoPanel
                          icon={<ShieldCheck className="h-3.5 w-3.5" />}
                          title="Security notes"
                          empty="No extra security notes"
                          items={selected.runtimePackage.securityNotes}
                        />
                      </div>

                      <Separator />

                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pinned Prompt</div>
                        <pre className="max-h-56 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                          {detail?.pinnedPrompt ?? ''}
                        </pre>
                      </div>

                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Policy</div>
                        <pre className="max-h-56 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                          {detail?.policyYaml ?? ''}
                        </pre>
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Logs</div>
                          <Button size="sm" variant="outline" onClick={fetchLogs} disabled={busyAction === 'logs' || !runtimeEnabled}>
                            {busyAction === 'logs' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        <pre className="max-h-56 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                          {logs || cleanTerminalOutput(selected.lastLog) || cleanTerminalOutput(selected.lastError) || ''}
                        </pre>
                      </div>
                    </div>
                  </ScrollArea>
                </aside>
              </div>
            </div>
          )}
        </main>
      </div>

      <DeployAgentDialog
        open={deployOpen}
        onOpenChange={setDeployOpen}
        agentId={initialAgentId ?? null}
        agentName={initialAgentName ?? null}
        runtimeEnabled={runtimeEnabled}
        onCreated={(deployment) => {
          setSelectedId(deployment.id)
          fetchDeployments()
        }}
      />
    </div>
  )
}

function InfoPanel({
  icon,
  title,
  empty,
  items,
}: {
  icon: ReactNode
  title: string
  empty: string
  items: string[]
}) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="break-words font-mono text-[11px] leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
