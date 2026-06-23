'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Network, Plus, Search, Globe, Lock,
  MoreHorizontal, Trash2, ExternalLink,
  ChevronRight, UserPlus, Key, Shield, Users as UsersIcon,
  ChevronDown, Rocket, Boxes,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useCurrentUser } from '@/lib/auth/user-context'
import { useWorkspace } from '@/lib/workspace-context'
import { WorkspaceSidebar, type SidebarPanel } from '@/components/workspace-sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DeployAgentDialog } from '@/components/deployments/deploy-agent-dialog'
import { DeploymentsView } from '@/components/deployments/deployments-view'
import { OpenShellConsole } from '@/components/openshell/openshell-console'

// ── Types ────────────────────────────────────────────────────────────────────

type AgentSummary = {
  id: string
  name: string
  description: string | null
  groupId: string | null
  isPublicInOrg: boolean
  ownerId: string
  updatedAt: string
  createdAt: string
  deploymentCount?: number
  latestDeploymentStatus?: string | null
}

type Group = {
  id: string
  name: string
  description: string | null
  createdAt: string
}

type Member = {
  userId: string
  name: string
  email: string
  role: 'owner' | 'editor' | 'viewer'
}

type UserRow = {
  id: string
  email: string
  name: string
  role: 'admin' | 'editor' | 'viewer'
  isActive: boolean
  createdAt: string
  lastLoginAt: string | null
}

type AllUser = { id: string; name: string; email: string }

// ── Main page ────────────────────────────────────────────────────────────────

export default function GraphsPage() {
  const router = useRouter()
  const { user, loading } = useCurrentUser()
  const { activeWorkspace } = useWorkspace()

  const [activePanel, setActivePanel] = useState<SidebarPanel>('graphs')

  // Graphs state
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [search, setSearch] = useState('')
  const [deployAgent, setDeployAgent] = useState<AgentSummary | null>(null)

  const fetchAgents = useCallback(async () => {
    setLoadingAgents(true)
    try {
      const params = new URLSearchParams()
      if (activeWorkspace.id) {
        params.set('group', activeWorkspace.id)
      } else {
        params.set('mine', 'true')
      }
      const res = await fetch(`/api/agents?${params}`)
      const data = await res.json()
      const list: AgentSummary[] = data.agents ?? []
      setAgents(
        activeWorkspace.id === null
          ? list.filter(a => a.groupId === null)
          : list,
      )
    } catch (err) {
      console.error('Failed to load agents:', err)
    } finally {
      setLoadingAgents(false)
    }
  }, [activeWorkspace])

  useEffect(() => {
    if (!loading && user) fetchAgents()
  }, [user, loading, fetchAgents])

  useEffect(() => {
    if (user) fetchAgents()
  }, [activeWorkspace, user, fetchAgents])

  // When workspace switches, go back to graphs panel
  useEffect(() => {
    setActivePanel('graphs')
  }, [activeWorkspace])

  const filtered = agents.filter(a =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description?.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleDelete(id: string) {
    if (!confirm('Delete this agent? This cannot be undone.')) return
    await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    setAgents(prev => prev.filter(a => a.id !== id))
  }

  function handleNewGraph() {
    const url = activeWorkspace.id
      ? `/editor?groupId=${activeWorkspace.id}`
      : '/editor'
    router.push(url)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <WorkspaceSidebar activePanel={activePanel} onPanelChange={setActivePanel} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activePanel === 'graphs' && (
          <GraphsPanel
            activeWorkspaceName={activeWorkspace.name}
            loadingAgents={loadingAgents}
            filtered={filtered}
            search={search}
            setSearch={setSearch}
            user={user}
            handleNewGraph={handleNewGraph}
            handleDelete={handleDelete}
            router={router}
            onDeploy={setDeployAgent}
          />
        )}
        {activePanel === 'deployments' && (
          <DeploymentsView
            initialAgentId={deployAgent?.id ?? null}
            initialAgentName={deployAgent?.name ?? null}
            onOpenAgent={(agentId) => router.push(`/editor?id=${agentId}`)}
          />
        )}
        {activePanel === 'openshell' && <OpenShellConsole />}
        {activePanel === 'wiki' && <WikiPanel />}
        {activePanel === 'members' && <MembersPanel groupId={activeWorkspace.id} groupName={activeWorkspace.name} />}
        {activePanel === 'admin' && <AdminPanel />}
      </div>

      <DeployAgentDialog
        open={!!deployAgent}
        onOpenChange={(open) => {
          if (!open) setDeployAgent(null)
        }}
        agentId={deployAgent?.id ?? null}
        agentName={deployAgent?.name ?? null}
        onCreated={() => {
          fetchAgents()
          setActivePanel('deployments')
        }}
      />
    </div>
  )
}

// ── Graphs Panel ─────────────────────────────────────────────────────────────

function GraphsPanel({
  activeWorkspaceName,
  loadingAgents,
  filtered,
  search,
  setSearch,
  user,
  handleNewGraph,
  handleDelete,
  router,
  onDeploy,
}: {
  activeWorkspaceName: string
  loadingAgents: boolean
  filtered: AgentSummary[]
  search: string
  setSearch: (s: string) => void
  user: { id: string; role: string } | null
  handleNewGraph: () => void
  handleDelete: (id: string) => void
  router: ReturnType<typeof useRouter>
  onDeploy: (agent: AgentSummary) => void
}) {
  return (
    <>
      <header className="border-b border-border/50 bg-background/95 backdrop-blur z-10 shrink-0">
        <div className="px-4 h-14 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search graphs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
          <div className="flex-1" />
          <Button size="sm" onClick={handleNewGraph} className="gap-1">
            <Plus className="h-4 w-4" />
            New Graph
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">{activeWorkspaceName}</h2>
            <p className="text-sm text-muted-foreground">
              {loadingAgents ? 'Loading…' : `${filtered.length} graph${filtered.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {loadingAgents ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <Network className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium mb-1">No graphs yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {search
                  ? 'No results for your search.'
                  : `No graphs in ${activeWorkspaceName} yet. Create one to get started.`}
              </p>
              {!search && (
                <Button onClick={handleNewGraph}>
                  <Plus className="mr-2 h-4 w-4" /> New Graph
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  currentUserId={user?.id ?? ''}
                  isAdmin={user?.role === 'admin'}
                  onDelete={handleDelete}
                  onOpen={() => router.push(`/editor?id=${agent.id}`)}
                  onDeploy={() => onDeploy(agent)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

function AgentCard({
  agent,
  currentUserId,
  isAdmin,
  onDelete,
  onOpen,
  onDeploy,
}: {
  agent: AgentSummary
  currentUserId: string
  isAdmin: boolean
  onDelete: (id: string) => void
  onOpen: () => void
  onDeploy: () => void
}) {
  const isOwner = agent.ownerId === currentUserId
  return (
    <div
      className="group relative flex flex-col gap-2 rounded-lg border border-border/50 bg-card p-4 hover:border-border hover:shadow-sm transition-all cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Network className="h-4 w-4 text-primary shrink-0" />
          <h3 className="font-medium text-sm truncate">{agent.name}</h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
            <DropdownMenuItem onClick={onOpen}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDeploy}>
              <Rocket className="mr-2 h-4 w-4" /> Deploy
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.assign(`/deployments?agentId=${agent.id}&agentName=${encodeURIComponent(agent.name)}`)}>
              <Boxes className="mr-2 h-4 w-4" /> Sandboxes
            </DropdownMenuItem>
            {(isOwner || isAdmin) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={e => { e.stopPropagation(); onDelete(agent.id) }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {agent.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
      )}
      <div className="flex items-center gap-2 mt-auto pt-1">
        {(agent.deploymentCount ?? 0) > 0 && (
          <Badge variant="outline" className="text-xs gap-1 font-normal border-primary/30 text-primary">
            <Boxes className="h-3 w-3" />
            {agent.deploymentCount} {agent.latestDeploymentStatus ?? 'sandbox'}
          </Badge>
        )}
        {agent.isPublicInOrg ? (
          <Badge variant="outline" className="text-xs gap-1 font-normal">
            <Globe className="h-3 w-3" /> Public
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs gap-1 font-normal">
            <Lock className="h-3 w-3" /> Private
          </Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDistanceToNow(new Date(agent.updatedAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  )
}

// ── Wiki Panel ───────────────────────────────────────────────────────────────

const WIKI_SECTIONS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'create-graph', label: 'Creating a Graph' },
  { id: 'node-types', label: 'Node Types' },
  { id: 'actions-permissions', label: 'Actions & Permissions' },
  { id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts' },
]

const NODE_TYPE_INFO = [
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

const PERMISSION_CATS = [
  { icon: '🌐', label: 'API & Integrations', color: 'text-blue-400', desc: 'External HTTP, webhooks, third-party APIs.' },
  { icon: '🗄️', label: 'Data & Storage', color: 'text-cyan-400', desc: 'Databases, files, memory, caches.' },
  { icon: '🗃️', label: 'Logging & Audit', color: 'text-teal-400', desc: 'Audit trails, telemetry, event logs.' },
  { icon: '📧', label: 'User Communication', color: 'text-indigo-400', desc: 'Emails, SMS, Slack, push notifications.' },
  { icon: '💰', label: 'Financial', color: 'text-amber-400', desc: 'Payments, refunds, billing.' },
  { icon: '💻', label: 'System & Infrastructure', color: 'text-red-400', desc: 'Shell, deployments, server access.' },
  { icon: '🔑', label: 'Auth & Permissions', color: 'text-purple-400', desc: 'Auth, tokens, role/permission grants.' },
  { icon: '🤖', label: 'AI & LLM Calls', color: 'text-orange-400', desc: 'LLM models, embeddings, sub-agents.' },
]

const SHORTCUTS = [
  { keys: 'Ctrl/Cmd + S', action: 'Save agent' },
  { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
  { keys: 'Ctrl/Cmd + Y', action: 'Redo' },
  { keys: 'Ctrl/Cmd + C', action: 'Copy selected node' },
  { keys: 'Ctrl/Cmd + V', action: 'Paste node' },
  { keys: 'Ctrl/Cmd + D', action: 'Duplicate node' },
  { keys: 'Delete / Backspace', action: 'Remove selected node or edge' },
  { keys: '?', action: 'Open keyboard shortcuts dialog' },
  { keys: 'Ctrl/Cmd + F', action: 'Open node search' },
  { keys: 'Escape', action: 'Deselect / close panel' },
]

function WikiPanel() {
  const [activeSection, setActiveSection] = useState('getting-started')

  const scrollTo = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Wiki left nav */}
      <aside className="w-48 shrink-0 border-r border-border/50 py-6 px-3 overflow-y-auto">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Wiki</p>
        <nav className="space-y-0.5">
          {WIKI_SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
                activeSection === s.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <ChevronRight className="h-3 w-3 shrink-0" />
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Wiki content */}
      <main className="flex-1 overflow-y-auto py-8 px-8 space-y-16">

        {/* ── Getting Started ── */}
        <section id="getting-started">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Getting Started</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            MAP is a visual AI agent architect. Describe what an agent should do in plain language — MAP turns it into an interactive graph, a structured representation of how the agent thinks and acts.
          </p>
          <div className="grid gap-4 sm:grid-cols-3 mb-8">
            {[
              { step: '1', title: 'Describe your agent', desc: 'Click "+ Generate Graph" and type what your agent should do. Gemini builds the graph in seconds.' },
              { step: '2', title: 'Edit visually', desc: 'Drag nodes, add connections, or chat with the editor: "Add a validation step after intake."' },
              { step: '3', title: 'Export & use', desc: 'Copy the system prompt, export as JSON, or connect via the MCP server from Claude Desktop.' },
            ].map(item => (
              <div key={item.step} className="rounded-lg border border-border/50 bg-card p-4">
                <div className="h-7 w-7 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center mb-3">
                  {item.step}
                </div>
                <h3 className="font-medium text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <h3 className="text-base font-semibold mb-3">Workspaces & Groups</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Your <strong>Personal</strong> workspace is private. <strong>Group</strong> workspaces are shared with group members. Switch using the left sidebar.
          </p>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">How workspaces work</p>
            <ul className="space-y-1 list-disc list-inside text-xs">
              <li>Graphs created in a group workspace are visible only to that group's members.</li>
              <li>Switching workspaces instantly filters the graph list.</li>
              <li>New Graph automatically assigns to your active workspace.</li>
            </ul>
          </div>
        </section>

        {/* ── Creating a Graph ── */}
        <section id="create-graph">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Creating a Graph</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            There are two ways to create a graph: generate one from a text description using AI, or start with a blank canvas.
          </p>

          <div className="space-y-6">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">1</div>
                <div className="w-px bg-border/50 flex-1 mt-2" />
              </div>
              <div className="pb-6 flex-1">
                <h3 className="font-semibold mb-2">Click "+ New Graph"</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  In the top-right of the Graphs panel, click the orange <strong>+ New Graph</strong> button. This opens the editor for the currently active workspace.
                </p>
                <div className="rounded-lg border border-border/50 bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Personal</span>
                    <div className="h-7 px-3 rounded bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1">
                      <span>+</span> New Graph
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    If you're in a Group workspace, the graph will automatically be assigned to that group.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">2</div>
                <div className="w-px bg-border/50 flex-1 mt-2" />
              </div>
              <div className="pb-6 flex-1">
                <h3 className="font-semibold mb-2">Choose: Generate with AI or start blank</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  The editor welcome screen gives you two options.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
                    <div className="text-primary font-semibold text-sm mb-1">✦ Generate Graph</div>
                    <p className="text-xs text-muted-foreground">Describe your agent in plain English. Gemini builds a complete graph with all node types.</p>
                    <div className="mt-2 text-xs bg-muted rounded px-2 py-1 font-mono text-muted-foreground">
                      "A customer support agent that triages tickets..."
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <div className="font-semibold text-sm mb-1 text-muted-foreground">Skip to Editor</div>
                    <p className="text-xs text-muted-foreground">Start with a blank canvas and add nodes manually by dragging from the node palette.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">3</div>
                <div className="w-px bg-border/50 flex-1 mt-2" />
              </div>
              <div className="pb-6 flex-1">
                <h3 className="font-semibold mb-2">Edit the graph visually</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Once generated, you can drag nodes, add connections, and edit labels directly on the canvas.
                </p>
                <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2 text-xs text-muted-foreground">
                  <p>• <strong className="text-foreground">Click a node</strong> — select it to edit its label and description in the Properties panel</p>
                  <p>• <strong className="text-foreground">Drag from a node handle</strong> — draw a connection to another node</p>
                  <p>• <strong className="text-foreground">Right-click / ⋮ menu</strong> — add, duplicate, or delete nodes</p>
                  <p>• <strong className="text-foreground">Chat editor</strong> — type "Add a validation step after intake" to edit via AI</p>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0">4</div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-2">Save and use</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Press <kbd className="px-1.5 py-0.5 rounded border border-border text-xs font-mono bg-muted">Ctrl+S</kbd> to save. Your graph appears in the workspace list. From the toolbar you can:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { icon: '📋', action: 'Show Prompt', desc: 'Copy the generated system prompt' },
                    { icon: '📤', action: 'Export JSON', desc: 'Download the graph as a JSON file' },
                    { icon: '▶', action: 'Simulate', desc: 'Run the agent step-by-step' },
                    { icon: '🔌', action: 'MCP Server', desc: 'Access via Claude Desktop or Cursor' },
                  ].map(item => (
                    <div key={item.action} className="flex gap-2 rounded border border-border/40 bg-card p-2.5">
                      <span>{item.icon}</span>
                      <div>
                        <div className="font-medium text-foreground">{item.action}</div>
                        <div className="text-muted-foreground">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Node Types ── */}
        <section id="node-types">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Node Types</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            There are {NODE_TYPE_INFO.length} core node types. Each controls how an agent step behaves.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {NODE_TYPE_INFO.map(t => (
              <div key={t.type} className="flex items-start gap-3 rounded-lg border border-border/40 bg-card p-3">
                <div
                  className="h-8 w-8 rounded flex items-center justify-center text-sm shrink-0 font-mono"
                  style={{ backgroundColor: t.color + '33', color: t.color }}
                >
                  {t.icon}
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-semibold font-mono" style={{ color: t.color }}>{t.type}</span>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Actions & Permissions ── */}
        <section id="actions-permissions">
          <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-border/50">Actions & Permissions</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Every node that performs a real-world action is classified by category and risk level. The Actions & Permissions panel (right sidebar in the editor) shows what your agent can do and whether actions are protected by a Guard node.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 mb-6">
            {PERMISSION_CATS.map(cat => (
              <div key={cat.label} className="rounded-lg border border-border/40 bg-card p-3 flex gap-3">
                <span className="text-xl shrink-0">{cat.icon}</span>
                <div>
                  <p className={`text-sm font-medium ${cat.color}`}>{cat.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cat.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <h3 className="text-base font-semibold mb-2">Risk Levels</h3>
          <div className="flex gap-4 flex-wrap">
            {(['high', 'medium', 'low'] as const).map(level => (
              <div key={level} className="flex items-center gap-2 text-sm">
                <span className={`h-3 w-3 rounded-full ${
                  level === 'high' ? 'bg-red-500' : level === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                }`} />
                <span className="capitalize font-medium">{level}</span>
                <span className="text-muted-foreground text-xs">—</span>
                <span className="text-muted-foreground text-xs">
                  {level === 'high' ? 'Irreversible or dangerous' : level === 'medium' ? 'Has side effects' : 'Minor impact'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Keyboard Shortcuts ── */}
        <section id="keyboard-shortcuts">
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
                {SHORTCUTS.map(s => (
                  <tr key={s.keys} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <kbd className="px-1.5 py-0.5 rounded border border-border text-xs font-mono bg-muted/50">
                        {s.keys}
                      </kbd>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-sm">{s.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  )
}

// ── Members Panel (Group admin) ───────────────────────────────────────────────

function MembersPanel({ groupId, groupName }: { groupId: string | null; groupName: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [loading, setLoading] = useState(true)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
  const [addMemberForm, setAddMemberForm] = useState({ userId: '', role: 'editor' as Member['role'] })
  const [apiKeyForm, setApiKeyForm] = useState({ provider: 'gemini', key: '' })
  const [saving, setSaving] = useState(false)
  const { user: me } = useCurrentUser()

  const loadMembers = useCallback(async () => {
    if (!groupId) return
    setLoading(true)
    const [membersRes, usersRes] = await Promise.all([
      fetch(`/api/groups/${groupId}`),
      fetch('/api/users'),
    ])
    const membersData = await membersRes.json()
    const usersData = await usersRes.json()
    setMembers(membersData.members ?? [])
    setAllUsers(usersData.users ?? [])
    setLoading(false)
  }, [groupId])

  useEffect(() => { loadMembers() }, [loadMembers])

  const nonMembers = allUsers.filter(u => !members.find(m => m.userId === u.id))

  async function handleAddMember() {
    if (!groupId) return
    setSaving(true)
    const res = await fetch(`/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addMemberForm),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to add member'); setSaving(false); return }
    toast.success('Member added')
    setAddMemberOpen(false)
    setAddMemberForm({ userId: '', role: 'editor' })
    loadMembers()
    setSaving(false)
  }

  async function handleRemoveMember(userId: string) {
    if (!groupId) return
    const res = await fetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Member removed'); loadMembers() }
    else toast.error('Failed to remove member')
  }

  async function handleSaveApiKey() {
    if (!groupId) return
    setSaving(true)
    const res = await fetch(`/api/groups/${groupId}/api-keys/${apiKeyForm.provider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKeyForm.key }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to save key'); setSaving(false); return }
    toast.success(`Key saved — preview: ${data.preview}`)
    setApiKeyOpen(false)
    setApiKeyForm({ provider: 'gemini', key: '' })
    setSaving(false)
  }

  return (
    <>
      <header className="border-b border-border/50 bg-background/95 backdrop-blur z-10 shrink-0">
        <div className="px-4 h-14 flex items-center gap-3">
          <UsersIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">{groupName} — Members</h2>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setApiKeyOpen(true)}>
            <Key className="mr-2 h-4 w-4" /> API Keys
          </Button>
          <Button size="sm" onClick={() => setAddMemberOpen(true)} disabled={nonMembers.length === 0}>
            <UserPlus className="mr-2 h-4 w-4" /> Add Member
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded bg-muted animate-pulse" />)}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">No members yet.</div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members ({members.length})</p>
              </div>
              <div className="divide-y divide-border">
                {members.map(m => (
                  <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">{m.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                    {m.userId !== me?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveMember(m.userId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add member dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Member to {groupName}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select value={addMemberForm.userId} onValueChange={v => setAddMemberForm(f => ({ ...f, userId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a user..." /></SelectTrigger>
                <SelectContent>
                  {nonMembers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={addMemberForm.role} onValueChange={v => setAddMemberForm(f => ({ ...f, role: v as Member['role'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={saving || !addMemberForm.userId}>
              {saving ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Keys dialog */}
      <Dialog open={apiKeyOpen} onOpenChange={setApiKeyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>API Keys — {groupName}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Keys set here override company-wide .env keys for this group's agents.</p>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={apiKeyForm.provider} onValueChange={v => setApiKeyForm(f => ({ ...f, provider: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                value={apiKeyForm.key}
                onChange={e => setApiKeyForm(f => ({ ...f, key: e.target.value }))}
                placeholder="sk-..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveApiKey} disabled={saving || !apiKeyForm.key}>
              {saving ? 'Saving...' : 'Save Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Admin Panel (Users + Groups) ──────────────────────────────────────────────

type AdminTab = 'users' | 'groups'

function AdminPanel() {
  const [tab, setTab] = useState<AdminTab>('users')
  const { user: me } = useCurrentUser()
  const [users, setUsers] = useState<UserRow[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [groupMembers, setGroupMembers] = useState<Member[]>([])
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
  const [userForm, setUserForm] = useState({ email: '', name: '', password: '', role: 'editor' as UserRow['role'] })
  const [groupForm, setGroupForm] = useState({ name: '', description: '' })
  const [addMemberForm, setAddMemberForm] = useState({ userId: '', role: 'editor' as Member['role'] })
  const [apiKeyForm, setApiKeyForm] = useState({ provider: 'gemini', key: '' })
  const [saving, setSaving] = useState(false)

  async function loadUsers() {
    setLoadingUsers(true)
    const res = await fetch('/api/users')
    const data = await res.json()
    setUsers(data.users ?? [])
    setAllUsers(data.users ?? [])
    setLoadingUsers(false)
  }

  async function loadGroups() {
    setLoadingGroups(true)
    const res = await fetch('/api/groups')
    const data = await res.json()
    setGroups(data.groups ?? [])
    setLoadingGroups(false)
  }

  useEffect(() => { loadUsers(); loadGroups() }, [])

  async function loadGroupMembers(groupId: string) {
    const res = await fetch(`/api/groups/${groupId}`)
    const data = await res.json()
    setGroupMembers(data.members ?? [])
  }

  async function handleCreateUser() {
    setSaving(true)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to create user'); setSaving(false); return }
    toast.success(`User ${userForm.email} created`)
    setCreateUserOpen(false)
    setUserForm({ email: '', name: '', password: '', role: 'editor' })
    loadUsers()
    setSaving(false)
  }

  async function handleCreateGroup() {
    setSaving(true)
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groupForm),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to create group'); setSaving(false); return }
    toast.success(`Group "${groupForm.name}" created`)
    setCreateGroupOpen(false)
    setGroupForm({ name: '', description: '' })
    loadGroups()
    setSaving(false)
  }

  async function handleUpdateRole(userId: string, role: UserRow['role']) {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (res.ok) { toast.success('Role updated'); loadUsers() }
    else toast.error('Failed to update role')
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('Delete this group? Graphs in this group will become personal.')) return
    const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Group deleted'); setSelectedGroup(null); loadGroups() }
    else toast.error('Failed to delete group')
  }

  async function handleAddGroupMember() {
    if (!selectedGroup) return
    setSaving(true)
    const res = await fetch(`/api/groups/${selectedGroup.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addMemberForm),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to add member'); setSaving(false); return }
    toast.success('Member added')
    setAddMemberOpen(false)
    setAddMemberForm({ userId: '', role: 'editor' })
    loadGroupMembers(selectedGroup.id)
    setSaving(false)
  }

  async function handleSaveApiKey() {
    if (!selectedGroup) return
    setSaving(true)
    const res = await fetch(`/api/groups/${selectedGroup.id}/api-keys/${apiKeyForm.provider}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKeyForm.key }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to save key'); setSaving(false); return }
    toast.success(`Key saved`)
    setApiKeyOpen(false)
    setSaving(false)
  }

  const nonGroupMembers = allUsers.filter(u => !groupMembers.find(m => m.userId === u.id))

  return (
    <>
      <header className="border-b border-border/50 bg-background/95 backdrop-blur z-10 shrink-0">
        <div className="px-4 h-14 flex items-center gap-3">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Admin</h2>
          <div className="flex gap-1 ml-4">
            {(['users', 'groups'] as AdminTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded text-sm capitalize transition-colors ${
                  tab === t ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {tab === 'users' && (
            <Button size="sm" onClick={() => setCreateUserOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add User
            </Button>
          )}
          {tab === 'groups' && (
            <Button size="sm" onClick={() => setCreateGroupOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Group
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {tab === 'users' && (
          <div className="max-w-4xl mx-auto px-4 py-6">
            {loadingUsers ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded bg-muted animate-pulse" />)}
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs">{u.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">{u.name}</div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            value={u.role}
                            onValueChange={(v) => handleUpdateRole(u.id, v as UserRow['role'])}
                            disabled={u.id === me?.id}
                          >
                            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                              <SelectItem value="viewer">Viewer</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${u.isActive ? 'border-green-500/30 text-green-500' : 'text-muted-foreground'}`}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'groups' && (
          <div className="max-w-4xl mx-auto px-4 py-6 flex gap-6">
            <div className="w-56 shrink-0 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Groups</p>
              {loadingGroups ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)
              ) : groups.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No groups yet</div>
              ) : (
                groups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setSelectedGroup(g); loadGroupMembers(g.id) }}
                    className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                      selectedGroup?.id === g.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <span className="font-medium text-sm truncate">{g.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>

            {selectedGroup ? (
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold">{selectedGroup.name}</h2>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setApiKeyOpen(true)}>
                      <Key className="mr-2 h-4 w-4" /> API Keys
                    </Button>
                    <Button size="sm" onClick={() => setAddMemberOpen(true)} disabled={nonGroupMembers.length === 0}>
                      <UserPlus className="mr-2 h-4 w-4" /> Add Member
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteGroup(selectedGroup.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members ({groupMembers.length})</p>
                  </div>
                  {groupMembers.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">No members yet.</div>
                  ) : (
                    <div className="divide-y divide-border">
                      {groupMembers.map(m => (
                        <div key={m.userId} className="flex items-center gap-3 px-4 py-3">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-xs">{m.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{m.name}</div>
                            <div className="text-xs text-muted-foreground">{m.email}</div>
                          </div>
                          <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a group to manage members and API keys.
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create user dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Temporary password" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={userForm.role} onValueChange={v => setUserForm(f => ({ ...f, role: v as UserRow['role'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — full access</SelectItem>
                  <SelectItem value="editor">Editor — create & edit graphs</SelectItem>
                  <SelectItem value="viewer">Viewer — read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateUserOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={saving || !userForm.email || !userForm.name || !userForm.password}>
              {saving ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create group dialog */}
      <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Group</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Backend Team" />
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={groupForm.description} onChange={e => setGroupForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this group work on?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={saving || !groupForm.name}>
              {saving ? 'Creating...' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add group member dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Member to {selectedGroup?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select value={addMemberForm.userId} onValueChange={v => setAddMemberForm(f => ({ ...f, userId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a user..." /></SelectTrigger>
                <SelectContent>
                  {nonGroupMembers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={addMemberForm.role} onValueChange={v => setAddMemberForm(f => ({ ...f, role: v as Member['role'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button onClick={handleAddGroupMember} disabled={saving || !addMemberForm.userId}>
              {saving ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Keys dialog */}
      <Dialog open={apiKeyOpen} onOpenChange={setApiKeyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>API Keys — {selectedGroup?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={apiKeyForm.provider} onValueChange={v => setApiKeyForm(f => ({ ...f, provider: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input type="password" value={apiKeyForm.key} onChange={e => setApiKeyForm(f => ({ ...f, key: e.target.value }))} placeholder="sk-..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveApiKey} disabled={saving || !apiKeyForm.key}>
              {saving ? 'Saving...' : 'Save Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
