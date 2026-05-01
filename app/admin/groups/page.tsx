'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from '@/lib/auth/user-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Plus, MoreHorizontal, Shield, Users, LogOut, ChevronRight, Trash2, UserPlus, Key } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

type Group = {
  id: string
  name: string
  description: string | null
  createdAt: string
  memberCount?: number
}

type Member = {
  userId: string
  name: string
  email: string
  role: 'owner' | 'editor' | 'viewer'
}

type AllUser = { id: string; name: string; email: string }

export default function AdminGroupsPage() {
  const router = useRouter()
  const { user: me, logout } = useCurrentUser()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [allUsers, setAllUsers] = useState<AllUser[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
  const [groupForm, setGroupForm] = useState({ name: '', description: '' })
  const [addMemberForm, setAddMemberForm] = useState({ userId: '', role: 'editor' as Member['role'] })
  const [apiKeyForm, setApiKeyForm] = useState({ provider: 'gemini', key: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (me && me.role !== 'admin') { router.replace('/graphs'); return }
    if (me) { loadGroups(); loadAllUsers() }
  }, [me])

  async function loadGroups() {
    setLoading(true)
    const res = await fetch('/api/groups')
    const data = await res.json()
    setGroups(data.groups ?? [])
    setLoading(false)
  }

  async function loadAllUsers() {
    const res = await fetch('/api/users')
    const data = await res.json()
    setAllUsers(data.users ?? [])
  }

  async function loadMembers(groupId: string) {
    const res = await fetch(`/api/groups/${groupId}`)
    const data = await res.json()
    setMembers(data.members ?? [])
  }

  async function handleSelectGroup(g: Group) {
    setSelectedGroup(g)
    await loadMembers(g.id)
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
    setCreateOpen(false)
    setGroupForm({ name: '', description: '' })
    loadGroups()
    setSaving(false)
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('Delete this group? Graphs in this group will become personal.')) return
    const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Group deleted'); setSelectedGroup(null); loadGroups() }
    else toast.error('Failed to delete group')
  }

  async function handleAddMember() {
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
    loadMembers(selectedGroup.id)
    setSaving(false)
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedGroup) return
    const res = await fetch(`/api/groups/${selectedGroup.id}/members/${userId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Member removed'); loadMembers(selectedGroup.id) }
    else toast.error('Failed to remove member')
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
    toast.success(`Key saved — preview: ${data.preview}`)
    setApiKeyOpen(false)
    setApiKeyForm({ provider: 'gemini', key: '' })
    setSaving(false)
  }

  const nonMembers = allUsers.filter(u => !members.find(m => m.userId === u.id))

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/graphs')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">Manage Groups</span>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/users')}>
            <Users className="mr-2 h-4 w-4" /> Users
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Group
          </Button>
          {me && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 px-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">{me.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">{me.email}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
        {/* Group list */}
        <div className="w-64 shrink-0 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Groups</p>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)
          ) : groups.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No groups yet</div>
          ) : (
            groups.map(g => (
              <button
                key={g.id}
                onClick={() => handleSelectGroup(g)}
                className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                  selectedGroup?.id === g.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/50'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{g.name}</div>
                  {g.description && <div className="text-xs text-muted-foreground truncate">{g.description}</div>}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))
          )}
        </div>

        {/* Group detail */}
        {selectedGroup ? (
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{selectedGroup.name}</h2>
                {selectedGroup.description && (
                  <p className="text-sm text-muted-foreground">{selectedGroup.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setApiKeyOpen(true)}>
                  <Key className="mr-2 h-4 w-4" /> API Keys
                </Button>
                <Button size="sm" onClick={() => setAddMemberOpen(true)} disabled={nonMembers.length === 0}>
                  <UserPlus className="mr-2 h-4 w-4" /> Add Member
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDeleteGroup(selectedGroup.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete Group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Members ({members.length})</p>
              </div>
              {members.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">No members yet. Add someone to get started.</div>
              ) : (
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
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a group to manage its members and API keys.
          </div>
        )}
      </div>

      {/* Create group dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={saving || !groupForm.name}>
              {saving ? 'Creating...' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add member dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Member to {selectedGroup?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>User</Label>
              <Select value={addMemberForm.userId} onValueChange={v => setAddMemberForm(f => ({ ...f, userId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {nonMembers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role in group</Label>
              <Select value={addMemberForm.role} onValueChange={v => setAddMemberForm(f => ({ ...f, role: v as Member['role'] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner — manage members & keys</SelectItem>
                  <SelectItem value="editor">Editor — create & edit graphs</SelectItem>
                  <SelectItem value="viewer">Viewer — read only</SelectItem>
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

      {/* API Key dialog */}
      <Dialog open={apiKeyOpen} onOpenChange={setApiKeyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>API Keys — {selectedGroup?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Keys set here override the company-wide .env keys for this group's agents. Keys are encrypted before storage and never returned in plain text.
          </p>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={apiKeyForm.provider} onValueChange={v => setApiKeyForm(f => ({ ...f, provider: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
    </div>
  )
}
