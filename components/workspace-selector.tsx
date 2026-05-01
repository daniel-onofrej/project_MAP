'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import {
  Popover, PopoverContent, PopoverTrigger,
} from './ui/popover'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select'
import {
  ChevronDown, Plus, Users, Settings, UserPlus, Trash2, Check, Search, X, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

type Group = { id: string; name: string; description?: string | null }
type Member = { userId: string; name: string; email: string; role: string }
type User = { id: string; name: string; email: string }

interface WorkspaceSelectorProps {
  currentGroupId?: string | null
  onGroupChange?: (groupId: string | null) => void
}

export function WorkspaceSelector({ currentGroupId, onGroupChange }: WorkspaceSelectorProps) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null)

  // sub-dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  // create group form
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [creating, setCreating] = useState(false)

  // manage members
  const [members, setMembers] = useState<Member[]>([])

  // invite
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteResults, setInviteResults] = useState<User[]>([])
  const [inviteRole, setInviteRole] = useState<'owner' | 'editor' | 'viewer'>('editor')
  const [inviting, setInviting] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // load groups on mount
  useEffect(() => {
    fetch('/api/groups')
      .then(r => r.ok ? r.json() : { groups: [] })
      .then(d => {
        const list: Group[] = d.groups ?? []
        setGroups(list)
        if (currentGroupId) {
          setCurrentGroup(list.find(g => g.id === currentGroupId) ?? null)
        }
      })
  }, [currentGroupId])

  function handleSelect(groupId: string | null) {
    const g = groupId ? groups.find(g => g.id === groupId) ?? null : null
    setCurrentGroup(g)
    onGroupChange?.(groupId)
    setOpen(false)
  }

  async function handleCreate() {
    if (!newGroupName.trim()) return
    setCreating(true)
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to create group'); setCreating(false); return }
    const newGroup: Group = data.group ?? { id: data.id, name: newGroupName.trim() }
    setGroups(prev => [...prev, newGroup])
    setNewGroupName('')
    setNewGroupDesc('')
    setCreating(false)
    setCreateOpen(false)
    toast.success(`Group "${newGroup.name}" created`)
    // auto-select the new group
    handleSelect(newGroup.id)
  }

  async function openManage() {
    if (!currentGroup) return
    setManageOpen(true)
    await refreshMembers(currentGroup.id)
  }

  async function refreshMembers(groupId: string) {
    const res = await fetch(`/api/groups/${groupId}`)
    const data = await res.json()
    // API returns { role, user: { id, name, email } } — normalise to flat shape
    const raw: { role: string; user: { id: string; name: string; email: string } }[] = data.members ?? []
    setMembers(raw.map(m => ({ userId: m.user.id, name: m.user.name, email: m.user.email, role: m.role })))
  }

  async function handleRemoveMember(userId: string) {
    if (!currentGroup) return
    const res = await fetch(`/api/groups/${currentGroup.id}/members/${userId}`, { method: 'DELETE' })
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.userId !== userId))
      toast.success('Member removed')
    } else {
      toast.error('Failed to remove member')
    }
  }

  // live search users as user types
  function handleInviteSearchChange(val: string) {
    setInviteSearch(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!val.trim()) { setInviteResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      const res = await fetch(`/api/users?search=${encodeURIComponent(val)}`)
      if (!res.ok) return
      const data = await res.json()
      // filter out existing members
      const memberIds = new Set(members.map(m => m.userId))
      setInviteResults((data.users ?? []).filter((u: User) => !memberIds.has(u.id)))
    }, 250)
  }

  async function handleInvite(u: User) {
    if (!currentGroup) return
    setInviting(true)
    const res = await fetch(`/api/groups/${currentGroup.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id, role: inviteRole }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to add member'); setInviting(false); return }
    setMembers(prev => [...prev, { userId: u.id, name: u.name, email: u.email, role: inviteRole }])
    setInviteResults(prev => prev.filter(r => r.id !== u.id))
    setInviting(false)
    toast.success(`${u.name} added to ${currentGroup.name}`)
  }

  const label = currentGroup?.name ?? 'Personal'

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-dashed max-w-[160px]"
          >
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground ml-auto" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          {/* Personal */}
          <button
            onClick={() => handleSelect(null)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            {!currentGroupId && <Check className="h-3.5 w-3.5 text-primary" />}
            {currentGroupId && <span className="w-3.5" />}
            Personal
          </button>

          {/* Group list */}
          {groups.length > 0 && (
            <>
              <div className="my-1 h-px bg-border" />
              <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Workspaces</p>
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleSelect(g.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  {currentGroupId === g.id
                    ? <Check className="h-3.5 w-3.5 text-primary" />
                    : <span className="w-3.5" />
                  }
                  <span className="truncate flex-1 text-left">{g.name}</span>
                </button>
              ))}
            </>
          )}

          <div className="my-1 h-px bg-border" />

          {/* Actions */}
          <button
            onClick={() => { setOpen(false); setCreateOpen(true) }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Create group
          </button>

          {currentGroup && (
            <>
              <button
                onClick={async () => { setOpen(false); await refreshMembers(currentGroup.id); setInviteOpen(true) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                Invite to {currentGroup.name}
              </button>
              <button
                onClick={() => { setOpen(false); openManage() }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                Manage members
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Create group dialog ─────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Group name</Label>
              <Input
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="e.g. Backend Team"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                value={newGroupDesc}
                onChange={e => setNewGroupDesc(e.target.value)}
                placeholder="What does this group work on?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newGroupName.trim()}>
              {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite dialog ───────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { setInviteOpen(v); if (!v) { setInviteSearch(''); setInviteResults([]) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite to {currentGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as typeof inviteRole)}>
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

            <div className="space-y-1.5">
              <Label>Search users</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8"
                  placeholder="Type a name or email..."
                  value={inviteSearch}
                  onChange={e => handleInviteSearchChange(e.target.value)}
                  autoFocus
                />
                {inviteSearch && (
                  <button
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    onClick={() => { setInviteSearch(''); setInviteResults([]) }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Results */}
              {inviteSearch && (
                <div className="border border-border rounded-md overflow-hidden">
                  {inviteResults.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground text-center">No users found</div>
                  ) : (
                    inviteResults.map(u => (
                      <button
                        key={u.id}
                        disabled={inviting}
                        onClick={() => handleInvite(u)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors border-b border-border last:border-0"
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="text-[11px]">{u.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-medium truncate">{u.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                        <span className="text-xs text-primary shrink-0">Add</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Current members */}
            {members.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Current members</Label>
                <div className="space-y-1">
                  {members.map(m => (
                    <div key={m.userId} className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-muted/50">
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-[10px]">{m.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm truncate">{m.name}</span>
                      <Badge variant="outline" className="text-xs capitalize shrink-0">{m.role}</Badge>
                      <button
                        onClick={() => handleRemoveMember(m.userId)}
                        className="text-muted-foreground hover:text-destructive ml-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage members dialog ───────────────────────────── */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Members — {currentGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>
            ) : (
              <div className="space-y-1">
                {members.map(m => (
                  <div key={m.userId} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">{m.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">{m.role}</Badge>
                    <button
                      onClick={() => handleRemoveMember(m.userId)}
                      className="text-muted-foreground hover:text-destructive ml-1 shrink-0"
                      title="Remove member"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setManageOpen(false); setInviteOpen(true) }}>
              <UserPlus className="mr-2 h-4 w-4" /> Invite more
            </Button>
            <Button onClick={() => setManageOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
