'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type { SSEEvent, PresenceUser } from '@/lib/realtime/publisher'

type StreamState = {
  presenceUsers: PresenceUser[]
  nodeLocks: Map<string, { by: { id: string; name: string; avatarUrl: string | null }; expiresAt: string }>
  connected: boolean
}

type StreamHandlers = {
  onGraphUpdate?: (payload: Record<string, unknown>, by: { id: string; name: string }) => void
  onCommentAdded?: (comment: Record<string, unknown>) => void
  onCommentResolved?: (commentId: string) => void
}

export function useAgentStream(agentId: string | null, handlers?: StreamHandlers) {
  const [state, setState] = useState<StreamState>({
    presenceUsers: [],
    nodeLocks: new Map(),
    connected: false,
  })

  const esRef = useRef<EventSource | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const sendHeartbeat = useCallback(async () => {
    if (!agentId) return
    try {
      await fetch(`/api/agents/${agentId}/heartbeat`, { method: 'POST' })
    } catch {
      // Ignore heartbeat failures
    }
  }, [agentId])

  useEffect(() => {
    if (!agentId) return

    // Establish SSE connection
    const es = new EventSource(`/api/agents/${agentId}/stream`)
    esRef.current = es

    es.onopen = () => {
      setState((s) => ({ ...s, connected: true }))
    }

    es.onerror = () => {
      setState((s) => ({ ...s, connected: false }))
      // EventSource auto-reconnects
    }

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as SSEEvent

        switch (msg.type) {
          case 'presence_update':
            setState((s) => ({ ...s, presenceUsers: msg.users }))
            break

          case 'node_locked':
            setState((s) => {
              const newLocks = new Map(s.nodeLocks)
              newLocks.set(msg.nodeId, { by: msg.by, expiresAt: msg.expiresAt })
              return { ...s, nodeLocks: newLocks }
            })
            break

          case 'node_unlocked':
            setState((s) => {
              const newLocks = new Map(s.nodeLocks)
              newLocks.delete(msg.nodeId)
              return { ...s, nodeLocks: newLocks }
            })
            break

          case 'graph_update':
            handlersRef.current?.onGraphUpdate?.(msg.payload, msg.by)
            break

          case 'comment_added':
            handlersRef.current?.onCommentAdded?.(msg.comment)
            break

          case 'comment_resolved':
            handlersRef.current?.onCommentResolved?.(msg.commentId)
            break
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Start heartbeat (every 15s to keep presence alive and extend locks)
    sendHeartbeat()
    heartbeatRef.current = setInterval(sendHeartbeat, 15_000)

    return () => {
      es.close()
      esRef.current = null
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      setState({ presenceUsers: [], nodeLocks: new Map(), connected: false })
    }
  }, [agentId, sendHeartbeat])

  const acquireLock = useCallback(
    async (nodeId: string): Promise<boolean> => {
      if (!agentId) return false
      const res = await fetch(`/api/agents/${agentId}/nodes/${nodeId}/lock`, { method: 'POST' })
      return res.ok
    },
    [agentId]
  )

  const releaseLock = useCallback(
    async (nodeId: string): Promise<void> => {
      if (!agentId) return
      await fetch(`/api/agents/${agentId}/nodes/${nodeId}/lock`, { method: 'DELETE' })
    },
    [agentId]
  )

  return { ...state, acquireLock, releaseLock }
}
