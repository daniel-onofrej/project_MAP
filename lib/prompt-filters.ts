export interface PromptFilters {
  search: string
  groups: string[]
  tags: string[]
  visibility: 'all' | 'public' | 'private'
  owner: 'all' | 'mine' | 'team'
  sortBy: 'updatedAt' | 'pullCount' | 'alpha' | 'leastRecent'
}

export const DEFAULT_FILTERS: PromptFilters = {
  search: '',
  groups: [],
  tags: [],
  visibility: 'all',
  owner: 'all',
  sortBy: 'updatedAt',
}

export function applyFilters<T extends {
  name: string
  description: string | null
  isPublicInOrg: boolean
  ownerId: string
  tags?: string[]
  groups?: { id: string; name: string }[]
  groupId: string | null
  updatedAt: string
  pullCount?: number
  hubMeta?: any
}>(prompts: T[], filters: PromptFilters, currentUserId: string): T[] {
  let result = [...prompts]

  if (filters.search.trim()) {
    const q = filters.search.toLowerCase()
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
    )
  }

  if (filters.groups.length > 0) {
    result = result.filter((p) => {
      const groupIds = p.groups?.map((g) => g.id) ?? (p.groupId ? [p.groupId] : [])
      return filters.groups.some((gid) => groupIds.includes(gid))
    })
  }

  if (filters.tags.length > 0) {
    result = result.filter((p) =>
      filters.tags.some((t) => (p.tags ?? []).includes(t))
    )
  }

  if (filters.visibility === 'public') result = result.filter((p) => p.isPublicInOrg)
  if (filters.visibility === 'private') result = result.filter((p) => !p.isPublicInOrg)

  if (filters.owner === 'mine') result = result.filter((p) => p.ownerId === currentUserId)
  if (filters.owner === 'team') result = result.filter((p) => p.ownerId !== currentUserId)

  if (filters.sortBy === 'updatedAt') {
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  } else if (filters.sortBy === 'leastRecent') {
    result.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
  } else if (filters.sortBy === 'pullCount') {
    result.sort((a, b) => (b.pullCount ?? 0) - (a.pullCount ?? 0))
  } else if (filters.sortBy === 'alpha') {
    result.sort((a, b) => a.name.localeCompare(b.name))
  }

  return result
}

export function extractGroups<T extends {
  groups?: { id: string; name: string }[]
  groupId: string | null
}>(prompts: T[]): { id: string; name: string }[] {
  const map = new Map<string, string>()
  for (const p of prompts) {
    if (p.groups?.length) {
      for (const g of p.groups) map.set(g.id, g.name)
    } else if (p.groupId) {
      map.set(p.groupId, p.groupId)
    }
  }
  return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
}

export function extractTags<T extends { tags?: string[] }>(prompts: T[]): string[] {
  const set = new Set<string>()
  for (const p of prompts) for (const t of p.tags ?? []) set.add(t)
  return Array.from(set).sort()
}
