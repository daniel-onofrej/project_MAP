'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Copy, Check, Trash2, Plus, Eye, EyeOff, Key } from 'lucide-react';

interface McpControlPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpServerUrl?: string;
  activeAgentName?: string | null;
}

interface ServerStatus {
  status: string;
  uptime: number;
  port: number;
  version: string;
  agentCount: number;
}

interface SessionInfo {
  id: string;
  clientName?: string;
  connectedAt: string;
  toolCalls: number;
}

interface LogEntry {
  id: string;
  tool?: string;
  timestamp: string;
  duration?: number;
  status?: 'success' | 'error';
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
}

interface ToolStats {
  totalCalls: number;
  byTool: Record<string, number>;
  avgDuration: number;
  errorRate: number;
}

interface TokenMeta {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Group {
  id: string;
  name: string;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}

function formatDate(ts: string | null): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleDateString();
}

// ── Copy button ───────────────────────────────────────────────
function CopyButton({ text, size = 'sm' }: { text: string; size?: 'sm' | 'icon' }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  if (size === 'icon') {
    return (
      <button onClick={copy} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    );
  }
  return (
    <Button size="sm" variant="ghost" onClick={copy}>
      {copied ? 'Copied!' : 'Copy'}
    </Button>
  );
}

// ── Create Token Dialog ───────────────────────────────────────
function CreateTokenDialog({
  open,
  onOpenChange,
  groups,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: Group[];
  onCreated: (rawToken: string, meta: TokenMeta) => void;
}) {
  const [name, setName] = useState('');
  const [personalSelected, setPersonalSelected] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setName('');
    setPersonalSelected(false);
    setSelectedGroups(new Set());
    setError('');
  }

  function toggleGroup(id: string) {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    const scopes: string[] = [];
    if (personalSelected) scopes.push('personal');
    selectedGroups.forEach(id => scopes.push(id));

    if (!name.trim()) { setError('Name is required'); return; }
    if (scopes.length === 0) { setError('Select at least one scope'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/mcp-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create token'); return; }
      onCreated(data.token, {
        id: data.id,
        name: data.name,
        tokenPrefix: data.tokenPrefix,
        scopes: data.scopes,
        isActive: data.isActive,
        lastUsedAt: data.lastUsedAt,
        createdAt: data.createdAt,
      });
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New API Token</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Token name</Label>
            <Input
              placeholder="e.g. Claude Code local"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div className="space-y-2">
            <Label>Scopes</Label>
            <p className="text-xs text-muted-foreground">Select what this token can access</p>

            <div className="flex items-center gap-2 py-0.5">
              <Checkbox
                id="scope-personal"
                checked={personalSelected}
                onCheckedChange={v => setPersonalSelected(v === true)}
              />
              <label htmlFor="scope-personal" className="text-sm cursor-pointer select-none">
                Personal workspace
              </label>
            </div>

            {groups.length > 0 && (
              <div className="space-y-1 border rounded-md p-2 max-h-40 overflow-y-auto">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center gap-2 py-0.5">
                    <Checkbox
                      id={`scope-${g.id}`}
                      checked={selectedGroups.has(g.id)}
                      onCheckedChange={() => toggleGroup(g.id)}
                    />
                    <label htmlFor={`scope-${g.id}`} className="text-sm cursor-pointer select-none">
                      {g.name}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { reset(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create token'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Token Reveal Dialog ───────────────────────────────────────
function TokenRevealDialog({
  rawToken,
  onClose,
}: {
  rawToken: string;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(rawToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open={!!rawToken} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-4 h-4" /> Token created
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Copy this token now. <strong>It will not be shown again.</strong>
          </p>
          <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
            <code className="flex-1 text-xs font-mono break-all select-all">
              {visible ? rawToken : '•'.repeat(Math.min(rawToken.length, 40))}
            </code>
            <button
              onClick={() => setVisible(v => !v)}
              className="shrink-0 p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
            >
              {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={copy}
              className="shrink-0 p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Add to Claude Code:</p>
            <code className="block bg-muted rounded px-2 py-1.5 text-[10px] break-all">
              {`{ "headers": { "Authorization": "Bearer ${rawToken}" } }`}
            </code>
          </div>
          <Button className="w-full" size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────
export function McpControlPanel({
  open,
  onOpenChange,
  mcpServerUrl = 'http://localhost:3100',
  activeAgentName,
}: McpControlPanelProps) {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [serverError, setServerError] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<ToolStats | null>(null);

  // Tokens state
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRawToken, setNewRawToken] = useState('');
  const [configCopyTarget, setConfigCopyTarget] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${mcpServerUrl}/api/status`);
      if (!res.ok) throw new Error('bad response');
      setServerStatus(await res.json());
      setServerError(false);
    } catch {
      setServerStatus(null);
      setServerError(true);
    }
  }, [mcpServerUrl]);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${mcpServerUrl}/api/sessions`);
      const data = await res.json();
      setSessions(data.active || []);
    } catch { /* ignore */ }
  }, [mcpServerUrl]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${mcpServerUrl}/api/history?limit=50`);
      const data = await res.json();
      setHistory(data.calls || []);
    } catch { /* ignore */ }
  }, [mcpServerUrl]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${mcpServerUrl}/api/stats`);
      setStats(await res.json());
    } catch { /* ignore */ }
  }, [mcpServerUrl]);

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp-tokens');
      if (!res.ok) return;
      const data = await res.json();
      setTokens(data.tokens || []);
    } catch { /* ignore */ }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups');
      if (!res.ok) return;
      const data = await res.json();
      setGroups(data.groups || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchStatus();
    fetchSessions();
    fetchHistory();
    fetchStats();
    fetchTokens();
    fetchGroups();
    const interval = setInterval(() => {
      fetchStatus();
      fetchSessions();
    }, 5000);
    return () => clearInterval(interval);
  }, [open, fetchStatus, fetchSessions, fetchHistory, fetchStats, fetchTokens, fetchGroups]);

  async function revokeToken(id: string) {
    const res = await fetch(`/api/mcp-tokens/${id}`, { method: 'DELETE' });
    if (res.ok) setTokens(prev => prev.filter(t => t.id !== id));
  }

  function handleTokenCreated(rawToken: string, meta: TokenMeta) {
    setTokens(prev => [meta, ...prev]);
    setNewRawToken(rawToken);
  }

  function scopeLabel(scope: string): string {
    if (scope === 'personal') return 'Personal';
    const g = groups.find(gr => gr.id === scope);
    return g ? g.name : scope.slice(0, 8) + '…';
  }

  const claudeDesktopConfig = JSON.stringify(
    { mcpServers: { MAP: { type: 'http', url: `${mcpServerUrl}/mcp` } } },
    null, 2
  );

  const claudeCodeConfig = JSON.stringify(
    {
      mcpServers: {
        MAP: {
          type: 'http',
          url: `${mcpServerUrl}/mcp`,
          headers: { Authorization: 'Bearer <your-token>' },
        },
      },
    },
    null, 2
  );

  const cursorConfig = JSON.stringify(
    { mcpServers: { MAP: { url: `${mcpServerUrl}/mcp` } } },
    null, 2
  );

  const chartData = stats
    ? Object.entries(stats.byTool).map(([name, count]) => ({ name, count }))
    : [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              MCP Server
              <span className={`inline-block w-2 h-2 rounded-full ${serverError ? 'bg-red-500' : 'bg-green-500'}`} />
              <span className="text-sm font-normal text-muted-foreground">
                {serverError ? 'Not running' : `Running on :${serverStatus?.port ?? 3100}`}
              </span>
            </DialogTitle>
          </DialogHeader>

          {activeAgentName && (
            <div className="flex items-center gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Active agent:</span>
              <span className="font-medium text-primary">{activeAgentName}</span>
            </div>
          )}

          {serverStatus && (
            <div className="flex gap-4 text-sm text-muted-foreground border-b pb-3">
              <span>Uptime: <strong>{formatUptime(serverStatus.uptime)}</strong></span>
              <span>Agents: <strong>{serverStatus.agentCount}</strong></span>
              <span>v{serverStatus.version}</span>
            </div>
          )}

          <Tabs defaultValue="sessions" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="w-full">
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="tokens">
                Tokens
                {tokens.length > 0 && (
                  <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">{tokens.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
            </TabsList>

            {/* Sessions tab */}
            <TabsContent value="sessions" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                {sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">No active sessions.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">Session ID</th>
                        <th className="py-2 pr-4">Client</th>
                        <th className="py-2 pr-4">Connected</th>
                        <th className="py-2">Tool Calls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map(s => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-mono text-xs">{s.id.slice(0, 8)}…</td>
                          <td className="py-2 pr-4">{s.clientName || '—'}</td>
                          <td className="py-2 pr-4">{formatTimestamp(s.connectedAt)}</td>
                          <td className="py-2">{s.toolCalls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
            </TabsContent>

            {/* History tab */}
            <TabsContent value="history" className="flex-1 overflow-hidden">
              <ScrollArea className="h-[340px]">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">No tool calls recorded yet.</p>
                ) : (
                  <div className="space-y-1 p-1">
                    {history.map(entry => (
                      <div key={entry.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted text-sm">
                        <Badge variant={entry.status === 'error' ? 'destructive' : 'secondary'} className="shrink-0 mt-0.5">
                          {entry.status ?? 'ok'}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <span className="font-mono font-medium">{entry.tool}</span>
                          {entry.inputSummary && (
                            <span className="text-muted-foreground ml-2 truncate">{entry.inputSummary}</span>
                          )}
                        </div>
                        <div className="shrink-0 text-xs text-muted-foreground text-right">
                          {entry.duration != null && <div>{entry.duration}ms</div>}
                          <div>{formatTimestamp(entry.timestamp)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Stats tab */}
            <TabsContent value="stats" className="flex-1 overflow-hidden">
              {!stats || stats.totalCalls === 0 ? (
                <p className="text-sm text-muted-foreground p-4">No calls recorded yet.</p>
              ) : (
                <div className="space-y-4 p-2">
                  <div className="flex gap-6 text-sm">
                    <div>
                      <div className="text-muted-foreground">Total calls</div>
                      <div className="text-2xl font-bold">{stats.totalCalls}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg duration</div>
                      <div className="text-2xl font-bold">{stats.avgDuration}ms</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Error rate</div>
                      <div className="text-2xl font-bold">{(stats.errorRate * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  {chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 40, left: 0 }}>
                        <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Tokens tab */}
            <TabsContent value="tokens" className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-1 py-2">
                <p className="text-sm text-muted-foreground">
                  API tokens for remote MCP access
                </p>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> New Token
                </Button>
              </div>
              <ScrollArea className="flex-1">
                {tokens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <Key className="w-8 h-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No tokens yet</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Create a token and add it to Claude Code or other MCP clients to authenticate remote connections.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 p-1">
                    {tokens.map(t => (
                      <div key={t.id} className="flex items-start gap-3 rounded-md border px-3 py-2.5">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{t.name}</span>
                            <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {t.tokenPrefix}…
                            </code>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {t.scopes.map(s => (
                              <Badge key={s} variant="secondary" className="text-xs py-0 px-1.5">
                                {scopeLabel(s)}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Created {formatDate(t.createdAt)}
                            {t.lastUsedAt && ` · Last used ${formatDate(t.lastUsedAt)}`}
                          </p>
                        </div>
                        <button
                          onClick={() => revokeToken(t.id)}
                          className="shrink-0 p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Revoke token"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Config tab */}
            <TabsContent value="config" className="flex-1 overflow-hidden">
              <ScrollArea className="h-[340px]">
                <div className="space-y-4 p-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium">Claude Desktop</p>
                        <p className="text-xs text-muted-foreground">No auth (localhost only)</p>
                      </div>
                      <CopyButton text={claudeDesktopConfig} />
                    </div>
                    <pre className="text-xs bg-muted rounded-md p-3 overflow-auto">{claudeDesktopConfig}</pre>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium">Claude Code / remote</p>
                        <p className="text-xs text-muted-foreground">With Bearer token auth</p>
                      </div>
                      <CopyButton text={claudeCodeConfig} />
                    </div>
                    <pre className="text-xs bg-muted rounded-md p-3 overflow-auto">{claudeCodeConfig}</pre>
                    {tokens.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Quick copy with existing token:</p>
                        {tokens.slice(0, 3).map(t => {
                          const snippet = JSON.stringify(
                            {
                              mcpServers: {
                                MAP: {
                                  type: 'http',
                                  url: `${mcpServerUrl}/mcp`,
                                  headers: { Authorization: `Bearer ${t.tokenPrefix}…` },
                                },
                              },
                            },
                            null, 2
                          );
                          return (
                            <div key={t.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                              <span className="flex-1 font-medium truncate">{t.name}</span>
                              <code className="text-muted-foreground font-mono">{t.tokenPrefix}…</code>
                              <span className="text-muted-foreground text-[10px]">(replace … with full token)</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-medium">Cursor / VS Code</p>
                        <p className="text-xs text-muted-foreground">No auth (localhost only)</p>
                      </div>
                      <CopyButton text={cursorConfig} />
                    </div>
                    <pre className="text-xs bg-muted rounded-md p-3 overflow-auto">{cursorConfig}</pre>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groups={groups}
        onCreated={handleTokenCreated}
      />

      {newRawToken && (
        <TokenRevealDialog
          rawToken={newRawToken}
          onClose={() => setNewRawToken('')}
        />
      )}
    </>
  );
}
