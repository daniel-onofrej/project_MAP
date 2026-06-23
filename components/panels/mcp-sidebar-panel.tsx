'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, Copy, Check, ChevronDown, ChevronRight, Key, Trash2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'

interface SessionInfo {
  id: string
  clientName?: string
  connectedAt: string
  toolCalls: number
}

interface ToolStats {
  totalCalls: number
  byTool: Record<string, number>
  avgDuration: number
  errorRate: number
}

interface LogEntry {
  id: string
  tool?: string
  timestamp: string
  duration?: number
  status?: 'success' | 'error'
  inputSummary?: string
}

interface McpTokenMeta {
  id: string
  name: string
  tokenPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  isActive: boolean
  createdAt: string
}

interface GroupOption {
  id: string
  name: string
}

interface McpSidebarPanelProps {
  mcpServerUrl?: string
}

const LOCAL_SECRETS_KEY = 'verto_mcp_client_secrets'

function loadSecrets(): Record<string, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SECRETS_KEY) ?? '{}')
  } catch { return {} }
}

function saveSecrets(data: Record<string, Record<string, string>>) {
  localStorage.setItem(LOCAL_SECRETS_KEY, JSON.stringify(data))
}

function Section({ title, children, defaultOpen = true }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {title}
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

export function McpSidebarPanel({ mcpServerUrl = 'http://localhost:3100' }: McpSidebarPanelProps) {
  const [online, setOnline] = useState(false)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [stats, setStats] = useState<ToolStats | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [copied, setCopied] = useState(false)
  const [secrets, setSecrets] = useState<Record<string, Record<string, string>>>({})
  const [newKeyInputs, setNewKeyInputs] = useState<Record<string, { k: string; v: string }>>({})

  // Token state
  const [tokens, setTokens] = useState<McpTokenMeta[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [newToken, setNewToken] = useState<{ name: string; scopes: string[]; expiresAt: string }>({ name: '', scopes: [], expiresAt: '' })
  const [createdRawToken, setCreatedRawToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [tokenFormOpen, setTokenFormOpen] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)

  useEffect(() => { setSecrets(loadSecrets()) }, [])

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, sessionsRes, statsRes, logsRes] = await Promise.all([
        fetch(`${mcpServerUrl}/api/status`).catch(() => null),
        fetch(`${mcpServerUrl}/api/sessions`).catch(() => null),
        fetch(`${mcpServerUrl}/api/stats`).catch(() => null),
        fetch(`${mcpServerUrl}/api/history?limit=20`).catch(() => null),
      ])
      setOnline(!!statusRes?.ok)
      if (sessionsRes?.ok) {
        const d = await sessionsRes.json()
        setSessions(d.active ?? [])
      }
      if (statsRes?.ok) setStats(await statsRes.json())
      if (logsRes?.ok) {
        const d = await logsRes.json()
        setLogs(d.calls ?? [])
      }
    } catch { setOnline(false) }
  }, [mcpServerUrl])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [fetchAll])

  // Fetch tokens and groups on mount
  useEffect(() => {
    fetch('/api/mcp-tokens')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.tokens && setTokens(d.tokens))
      .catch(() => {})
    fetch('/api/groups')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.groups && setGroups(d.groups))
      .catch(() => {})
  }, [])

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const addSecret = (clientName: string) => {
    const inp = newKeyInputs[clientName]
    if (!inp?.k.trim()) return
    const updated = {
      ...secrets,
      [clientName]: { ...(secrets[clientName] ?? {}), [inp.k.trim()]: inp.v },
    }
    setSecrets(updated)
    saveSecrets(updated)
    setNewKeyInputs(prev => ({ ...prev, [clientName]: { k: '', v: '' } }))
  }

  const removeSecret = (clientName: string, key: string) => {
    const updated = { ...secrets, [clientName]: { ...secrets[clientName] } }
    delete updated[clientName][key]
    setSecrets(updated)
    saveSecrets(updated)
  }

  const createToken = async () => {
    if (!newToken.name.trim() || newToken.scopes.length === 0) return
    setTokenLoading(true)
    try {
      const res = await fetch('/api/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newToken.name.trim(),
          scopes: newToken.scopes,
          expiresAt: newToken.expiresAt || null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setCreatedRawToken(data.token)
        setTokens(prev => [{
          id: data.id,
          name: data.name,
          tokenPrefix: data.tokenPrefix,
          scopes: data.scopes,
          lastUsedAt: data.lastUsedAt,
          expiresAt: data.expiresAt,
          isActive: data.isActive,
          createdAt: data.createdAt,
        }, ...prev])
        setNewToken({ name: '', scopes: [], expiresAt: '' })
        setTokenFormOpen(false)
      }
    } finally {
      setTokenLoading(false)
    }
  }

  const revokeToken = async (id: string) => {
    const token = tokens.find(t => t.id === id)
    if (!confirm(`Remove API token "${token?.name ?? 'this token'}" forever? Clients using it will stop authenticating immediately.`)) return
    const res = await fetch(`/api/mcp-tokens/${id}`, { method: 'DELETE' })
    if (res.ok) setTokens(prev => prev.filter(t => t.id !== id))
  }

  const copyCreatedToken = () => {
    if (!createdRawToken) return
    navigator.clipboard.writeText(createdRawToken)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  const chartData = stats
    ? Object.entries(stats.byTool).map(([name, count]) => ({ name, count }))
    : []

  const mcpEndpoint = `${mcpServerUrl}/mcp`

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur shrink-0">
        <div className="px-6 h-14 flex items-center gap-3">
          <h1 className="text-base font-semibold">MCP Server</h1>
          <span className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium',
            online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          )}>
            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {online ? 'Online' : 'Offline'}
          </span>
          {!online && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              Set <code className="bg-muted px-1 rounded">MCP_ENABLED=true</code> in <code className="bg-muted px-1 rounded">.env</code>
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto divide-y divide-border/30">
        {/* Connection */}
        <Section title="Connection">
          <p className="text-xs text-muted-foreground mb-2">MCP endpoint</p>
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted px-3 py-1.5">
            <code className="text-xs flex-1 truncate">{mcpEndpoint}</code>
            <button onClick={() => copy(mcpEndpoint)} className="shrink-0 text-muted-foreground hover:text-foreground">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Add to Claude Code: <code>{`{ "mcpServers": { "MAP": { "type": "http", "url": "${mcpEndpoint}" } } }`}</code>
          </p>
        </Section>

        {/* API Tokens */}
        <Section title="API Tokens">
          {/* One-time token reveal banner */}
          {createdRawToken && (
            <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-[10px] font-medium text-amber-400 mb-1.5">Copy this token now — it won&apos;t be shown again</p>
              <div className="flex items-center gap-2 rounded border border-border/40 bg-muted px-2 py-1">
                <code className="text-[10px] flex-1 truncate text-foreground">{createdRawToken}</code>
                <button onClick={copyCreatedToken} className="shrink-0 text-muted-foreground hover:text-foreground">
                  {tokenCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <button onClick={() => setCreatedRawToken(null)} className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground">
                Dismiss
              </button>
            </div>
          )}

          {/* Token list */}
          {tokens.length === 0 && !tokenFormOpen && (
            <p className="text-xs text-muted-foreground mb-2">No tokens yet.</p>
          )}
          <div className="space-y-1.5 mb-2">
            {tokens.map(t => (
              <div key={t.id} className="flex items-start gap-2 rounded-md border border-border/40 bg-background p-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-medium truncate">{t.name}</span>
                    <code className="text-[10px] bg-muted rounded px-1 text-muted-foreground">{t.tokenPrefix}…</code>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {t.scopes.map(s => {
                      const g = groups.find(g => g.id === s)
                      return (
                        <span key={s} className="text-[9px] bg-primary/15 text-primary rounded-full px-1.5 py-0.5">
                          {g?.name ?? s.slice(0, 8)}
                        </span>
                      )
                    })}
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {t.lastUsedAt ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                    {t.expiresAt ? ` · Expires ${new Date(t.expiresAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => revokeToken(t.id)}
                  className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-destructive/40 px-1.5 py-1 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                  title="Remove token forever"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Create form */}
          {tokenFormOpen ? (
            <div className="space-y-2 rounded-md border border-border/40 bg-background p-3">
              <input
                placeholder="Token name (e.g. Cursor - Work)"
                value={newToken.name}
                onChange={e => setNewToken(p => ({ ...p, name: e.target.value }))}
                className="w-full h-7 text-xs bg-muted rounded px-2 border-0 outline-none"
              />
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Group access</p>
                <div className="space-y-1">
                  {groups.map(g => (
                    <label key={g.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newToken.scopes.includes(g.id)}
                        onChange={e => setNewToken(p => ({
                          ...p,
                          scopes: e.target.checked ? [...p.scopes, g.id] : p.scopes.filter(s => s !== g.id)
                        }))}
                        className="accent-primary"
                      />
                      {g.name}
                    </label>
                  ))}
                  {groups.length === 0 && <p className="text-[10px] text-muted-foreground">No groups available.</p>}
                </div>
              </div>
              <input
                type="date"
                value={newToken.expiresAt}
                onChange={e => setNewToken(p => ({ ...p, expiresAt: e.target.value }))}
                className="w-full h-7 text-xs bg-muted rounded px-2 border-0 outline-none text-muted-foreground"
              />
              <div className="flex gap-2">
                <button
                  onClick={createToken}
                  disabled={tokenLoading || !newToken.name.trim() || newToken.scopes.length === 0}
                  className="flex-1 h-7 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                >
                  {tokenLoading ? 'Generating…' : 'Generate Token'}
                </button>
                <button onClick={() => setTokenFormOpen(false)} className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setTokenFormOpen(true)}
              className="w-full h-7 text-xs border border-dashed border-border/50 rounded hover:border-primary/50 hover:text-primary text-muted-foreground transition-colors"
            >
              + New Token
            </button>
          )}
        </Section>

        {/* Connected Clients */}
        <Section title={`Connected Clients (${sessions.length})`}>
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No clients connected.</p>
          ) : sessions.map(s => {
            const clientName = s.clientName ?? s.id.slice(0, 8)
            const clientSecrets = secrets[clientName] ?? {}
            const newInp = newKeyInputs[clientName] ?? { k: '', v: '' }
            return (
              <div key={s.id} className="mb-3 last:mb-0 rounded-md border border-border/40 bg-background p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-xs font-medium">{clientName}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{s.toolCalls} calls</span>
                </div>

                {/* Secrets */}
                <div className="mt-2">
                  <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 mb-1.5">
                    <Key className="h-2.5 w-2.5" /> Secrets
                  </p>
                  {Object.entries(clientSecrets).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1 mb-1">
                      <code className="text-[10px] bg-muted rounded px-1 py-0.5 flex-1 truncate">{k}</code>
                      <code className="text-[10px] text-muted-foreground">{'•'.repeat(Math.min(v.length, 8))}</code>
                      <button onClick={() => removeSecret(clientName, k)} className="text-muted-foreground hover:text-destructive text-[10px]">×</button>
                    </div>
                  ))}
                  <div className="flex gap-1 mt-1">
                    <input
                      placeholder="KEY"
                      value={newInp.k}
                      onChange={e => setNewKeyInputs(p => ({ ...p, [clientName]: { ...newInp, k: e.target.value } }))}
                      className="flex-1 h-6 text-[10px] bg-muted rounded px-1.5 border-0 outline-none min-w-0"
                    />
                    <input
                      placeholder="value"
                      type="password"
                      value={newInp.v}
                      onChange={e => setNewKeyInputs(p => ({ ...p, [clientName]: { ...newInp, v: e.target.value } }))}
                      className="flex-1 h-6 text-[10px] bg-muted rounded px-1.5 border-0 outline-none min-w-0"
                    />
                    <button
                      onClick={() => addSecret(clientName)}
                      className="h-6 px-1.5 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </Section>

        {/* Tool Usage */}
        {chartData.length > 0 && (
          <Section title="Tool Usage" defaultOpen={false}>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {/* Recent Logs */}
        <Section title="Recent Calls" defaultOpen={false}>
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tool calls recorded yet.</p>
          ) : (
            <div className="space-y-1">
              {logs.map(l => (
                <div key={l.id} className="flex items-center gap-2 text-[10px]">
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    l.status === 'error' ? 'bg-red-400' : 'bg-emerald-400'
                  )} />
                  <span className="font-mono font-medium truncate flex-1">{l.tool}</span>
                  {l.inputSummary && (
                    <span className="text-muted-foreground truncate max-w-[120px]">{l.inputSummary}</span>
                  )}
                  {l.duration != null && (
                    <span className="text-muted-foreground shrink-0">{l.duration}ms</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
