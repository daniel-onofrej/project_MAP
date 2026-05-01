'use client'

import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DEFAULT_FILTERS, PromptFilters } from '@/lib/prompt-filters'

interface PromptFilterBarProps {
  filters: PromptFilters
  availableGroups: { id: string; name: string }[]
  availableTags: string[]
  onChange: (filters: PromptFilters) => void
}

export function PromptFilterBar({
  filters,
  availableGroups,
  availableTags,
  onChange,
}: PromptFilterBarProps) {
  const set = (partial: Partial<PromptFilters>) => onChange({ ...filters, ...partial })

  const activeChips: { label: string; clear: () => void }[] = []

  if (filters.groups.length > 0) {
    const names = filters.groups.map(
      (id) => availableGroups.find((g) => g.id === id)?.name ?? id
    )
    activeChips.push({ label: `Group: ${names.join(', ')}`, clear: () => set({ groups: [] }) })
  }
  if (filters.tags.length > 0) {
    activeChips.push({ label: `Tags: ${filters.tags.join(', ')}`, clear: () => set({ tags: [] }) })
  }
  if (filters.visibility !== 'all') {
    activeChips.push({
      label: `Visibility: ${filters.visibility}`,
      clear: () => set({ visibility: 'all' }),
    })
  }
  if (filters.owner !== 'all') {
    activeChips.push({
      label: `Owner: ${filters.owner}`,
      clear: () => set({ owner: 'all' }),
    })
  }
  if (filters.sortBy !== 'updatedAt') {
    const labels: Record<string, string> = {
      pullCount: 'Most Pulled',
      alpha: 'Alphabetical',
      leastRecent: 'Least Recent',
    }
    activeChips.push({
      label: `Sort: ${labels[filters.sortBy]}`,
      clear: () => set({ sortBy: 'updatedAt' }),
    })
  }

  const hasActiveFilters = activeChips.length > 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search prompts..."
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          className="h-8 w-48"
        />

        {/* Group */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              Group {filters.groups.length > 0 && `(${filters.groups.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Group</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableGroups.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">No groups</div>
            )}
            {availableGroups.map((g) => (
              <DropdownMenuCheckboxItem
                key={g.id}
                checked={filters.groups.includes(g.id)}
                onCheckedChange={(checked) =>
                  set({
                    groups: checked
                      ? [...filters.groups, g.id]
                      : filters.groups.filter((id) => id !== g.id),
                  })
                }
              >
                {g.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tags */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              Tags {filters.tags.length > 0 && `(${filters.tags.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Tags</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableTags.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">No tags</div>
            )}
            {availableTags.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={filters.tags.includes(t)}
                onCheckedChange={(checked) =>
                  set({
                    tags: checked
                      ? [...filters.tags, t]
                      : filters.tags.filter((tag) => tag !== t),
                  })
                }
              >
                {t}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              Visibility:{' '}
              {filters.visibility === 'all'
                ? 'All'
                : filters.visibility === 'public'
                ? 'Public'
                : 'Private'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Visibility</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.visibility}
              onValueChange={(v) => set({ visibility: v as PromptFilters['visibility'] })}
            >
              <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="public">Public</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="private">Private</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Owner */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              Owner:{' '}
              {filters.owner === 'all' ? 'All' : filters.owner === 'mine' ? 'Mine' : 'Team'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Owner</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.owner}
              onValueChange={(v) => set({ owner: v as PromptFilters['owner'] })}
            >
              <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="mine">Mine</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="team">Team</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              Sort:{' '}
              {filters.sortBy === 'updatedAt'
                ? 'Recently Updated'
                : filters.sortBy === 'pullCount'
                ? 'Most Pulled'
                : filters.sortBy === 'alpha'
                ? 'A–Z'
                : 'Least Recent'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={filters.sortBy}
              onValueChange={(v) => set({ sortBy: v as PromptFilters['sortBy'] })}
            >
              <DropdownMenuRadioItem value="updatedAt">Recently Updated</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="pullCount">Most Pulled</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="alpha">Alphabetical (A–Z)</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="leastRecent">Least Recently Updated</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1">
          {activeChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              {chip.label}
              <button onClick={chip.clear} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
