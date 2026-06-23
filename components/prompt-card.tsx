'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Lock,
  Globe,
  ExternalLink,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface PromptItem {
  id: string
  name: string
  description: string | null
  updatedAt: string
  groupId: string | null
  isPublicInOrg: boolean
  ownerId: string
  hubMeta?: any
  tags?: string[]
  groups?: { id: string; name: string }[]
  lastComment?: { text: string; author: string; createdAt: string }
  lastChangeSummary?: string
  linkedAgents?: { id: string; name: string }[]
  pullCount?: number
  deploymentCount?: number
  latestDeploymentStatus?: string | null
}

interface VersionEntry {
  id: string
  label: string
  createdAt: string
  promptText?: string
}

interface PromptCardProps {
  prompt: PromptItem
  isExpanded: boolean
  onToggle: () => void
  onDelete: (id: string) => void
  onEditGroups: (id: string, groupIds: string[]) => void
  onEditDetails: (prompt: PromptItem) => void
  onOpenInEditor: (id: string) => void
  availableGroups: { id: string; name: string }[]
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function getVersionsFromStorage(promptId: string): VersionEntry[] {
  try {
    const raw = localStorage.getItem('MAP_versions')
    if (!raw) return []
    const all = JSON.parse(raw) as Record<string, VersionEntry[]>
    return all[promptId] ?? []
  } catch {
    return []
  }
}

export function PromptCard({
  prompt,
  isExpanded,
  onToggle,
  onDelete,
  onEditGroups,
  onEditDetails,
  onOpenInEditor,
  availableGroups,
}: PromptCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAgents, setShowAgents] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [localGroupIds, setLocalGroupIds] = useState<string[]>(
    prompt.groups?.map((g) => g.id) ?? (prompt.groupId ? [prompt.groupId] : [])
  )

  const versions = isExpanded ? getVersionsFromStorage(prompt.id) : []
  const selectedVersion = versions.find((v) => v.id === selectedVersionId)

  const displayGroups = prompt.groups?.length
    ? prompt.groups
    : prompt.groupId
    ? [{ id: prompt.groupId, name: prompt.groupId }]
    : []

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      {/* Compact header */}
      <div
        className="flex cursor-pointer items-start justify-between p-4"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{prompt.name}</span>
            {prompt.isPublicInOrg ? (
              <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>
          {prompt.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {prompt.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {displayGroups.map((g) => (
              <span
                key={g.id}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              >
                <Users className="h-2.5 w-2.5" />
                {g.name}
              </span>
            ))}
            {(prompt.tags ?? []).map((t) => (
              <span
                key={t}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{relativeTime(prompt.updatedAt)}</span>
            <span>{prompt.linkedAgents?.length ?? 0} agents using</span>
            {(prompt.deploymentCount ?? 0) > 0 && (
              <span>
                {prompt.deploymentCount} runtime{prompt.deploymentCount === 1 ? '' : 's'}
                {prompt.latestDeploymentStatus ? ` · ${prompt.latestDeploymentStatus}` : ''}
              </span>
            )}
            {(prompt.pullCount ?? 0) > 0 && <span>{prompt.pullCount} pulls</span>}
          </div>
        </div>

        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenInEditor(prompt.id)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Editor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditDetails(prompt)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit Details
              </DropdownMenuItem>

              {/* Edit Groups sub-menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Users className="mr-2 h-4 w-4" />
                    Edit Groups
                  </DropdownMenuItem>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="left">
                  <DropdownMenuLabel>Assign to groups</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableGroups.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground">No groups</div>
                  ) : (
                    availableGroups.map((g) => (
                      <DropdownMenuCheckboxItem
                        key={g.id}
                        checked={localGroupIds.includes(g.id)}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...localGroupIds, g.id]
                            : localGroupIds.filter((id) => id !== g.id)
                          setLocalGroupIds(next)
                          onEditGroups(prompt.id, next)
                        }}
                      >
                        {g.name}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Inline delete confirmation */}
      {showDeleteConfirm && (
        <div className="border-t bg-destructive/5 px-4 py-3">
          <p className="text-sm">
            Delete <strong>{prompt.name}</strong>? This cannot be undone.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false)
                onDelete(prompt.id)
              }}
            >
              Delete
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Expanded sections */}
      {isExpanded && (
        <div
          className="space-y-4 border-t p-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Version dropdown */}
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Version
            </p>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved versions</p>
            ) : (
              <>
                <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select a version…" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        {v.label} — {relativeTime(v.createdAt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedVersion?.promptText && (
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                    {selectedVersion.promptText}
                  </pre>
                )}
              </>
            )}
          </div>

          {/* Last comment */}
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Last Comment
            </p>
            {prompt.lastComment ? (
              <div className="rounded bg-muted/50 p-2 text-xs">
                <p>{prompt.lastComment.text}</p>
                <p className="mt-1 text-muted-foreground">
                  {prompt.lastComment.author} · {relativeTime(prompt.lastComment.createdAt)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No comments yet</p>
            )}
          </div>

          {/* Last change */}
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Last Change
            </p>
            <p className="text-xs text-muted-foreground">
              {prompt.lastChangeSummary ?? `Updated ${relativeTime(prompt.updatedAt)}`}
            </p>
          </div>

          {/* Linked agents */}
          <div>
            <button
              className="flex w-full items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              onClick={() => setShowAgents((v) => !v)}
            >
              <span>Linked Agents ({prompt.linkedAgents?.length ?? 0})</span>
              {showAgents ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {showAgents && (
              <div className="mt-1 space-y-0.5">
                {(prompt.linkedAgents ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No agents linked</p>
                ) : (
                  prompt.linkedAgents!.map((a) => (
                    <div
                      key={a.id}
                      className="rounded px-2 py-1 text-xs hover:bg-muted"
                    >
                      {a.name}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
