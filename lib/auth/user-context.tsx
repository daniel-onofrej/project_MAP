'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type CurrentUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'editor' | 'viewer'
  avatarUrl: string | null
}

type UserContextValue = {
  user: CurrentUser | null
  loading: boolean
  logout: () => Promise<void>
  refetch: () => Promise<void>
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  logout: async () => {},
  refetch: async () => {},
})

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    window.location.href = '/login'
  }, [])

  return (
    <UserContext.Provider value={{ user, loading, logout, refetch: fetchUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useCurrentUser(): UserContextValue {
  return useContext(UserContext)
}

export function useRequireRole(minRole: 'admin' | 'editor' | 'viewer'): boolean {
  const { user } = useCurrentUser()
  if (!user) return false
  const order = { viewer: 0, editor: 1, admin: 2 }
  return order[user.role] >= order[minRole]
}
