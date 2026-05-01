'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useCurrentUser } from '@/lib/auth/user-context'

export type Workspace = { id: string | null; name: string }

type WorkspaceContextValue = {
  activeWorkspace: Workspace
  setActiveWorkspace: (w: Workspace) => void
  workspaces: Workspace[]
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  activeWorkspace: { id: null, name: 'Personal' },
  setActiveWorkspace: () => {},
  workspaces: [{ id: null, name: 'Personal' }],
})

const STORAGE_KEY = 'verto_active_workspace'

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUser()
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace>(
    { id: null, name: 'Personal' }
  )

  // Restore persisted workspace from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try { setActiveWorkspaceState(JSON.parse(stored)) } catch {}
    }
  }, [])

  // Fetch groups whenever the user changes
  useEffect(() => {
    if (!user) return
    fetch('/api/groups')
      .then(r => r.json())
      .then(data => setGroups(data.groups ?? []))
      .catch(() => {})
  }, [user])

  const setActiveWorkspace = useCallback((w: Workspace) => {
    setActiveWorkspaceState(w)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w))
    }
  }, [])

  const workspaces: Workspace[] = [
    { id: null, name: 'Personal' },
    ...groups.map(g => ({ id: g.id, name: g.name })),
  ]

  return (
    <WorkspaceContext.Provider value={{ activeWorkspace, setActiveWorkspace, workspaces }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
