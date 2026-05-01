export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { getRedis } from '@/lib/redis'
import { agentChannel, type SSEEvent } from '@/lib/realtime/publisher'
import { db } from '@/db'
import { nodeLocks, users } from '@/db/schema'
import { eq, gt } from 'drizzle-orm'

type Params = { id: string }

// GET /api/agents/[id]/stream — SSE endpoint for real-time graph events
// Nginx config MUST have proxy_buffering off for this route.
export async function GET(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id: agentId } = await params

  // Create a Redis subscriber (each SSE connection needs its own sub connection)
  const sub = getRedis().duplicate()
  const channel = agentChannel(agentId)

  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      // Send current presence on connect
      const now = new Date()
      const activeLocks = await db
        .select({ nodeId: nodeLocks.nodeId, lockedBy: nodeLocks.lockedBy, expiresAt: nodeLocks.expiresAt })
        .from(nodeLocks)
        .where(eq(nodeLocks.agentId, agentId))

      const initialEvent: SSEEvent = {
        type: 'presence_update',
        users: [{ id: user.id, name: user.name, avatarUrl: user.avatarUrl, joinedAt: Date.now() }],
      }
      enqueue(controller, initialEvent)

      // Send existing node locks
      for (const lock of activeLocks) {
        if (lock.expiresAt > now) {
          // We don't have the locker's full info here — client handles it
          enqueue(controller, {
            type: 'node_locked',
            nodeId: lock.nodeId,
            by: { id: lock.lockedBy, name: '', avatarUrl: null },
            expiresAt: lock.expiresAt.toISOString(),
          })
        }
      }

      // Subscribe to Redis channel
      await sub.subscribe(channel)
      sub.on('message', (_ch: string, message: string) => {
        if (closed) return
        try {
          const event = JSON.parse(message) as SSEEvent
          enqueue(controller, event)
        } catch {
          // Ignore malformed messages
        }
      })

      // Keepalive ping every 25s to prevent Nginx/proxy timeout
      const pingInterval = setInterval(() => {
        if (closed) {
          clearInterval(pingInterval)
          return
        }
        try {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'))
        } catch {
          clearInterval(pingInterval)
        }
      }, 25_000)

      // Cleanup when client disconnects
      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(pingInterval)
        sub.unsubscribe(channel).catch(() => {})
        sub.disconnect()
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function enqueue(controller: ReadableStreamDefaultController, event: SSEEvent) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  controller.enqueue(new TextEncoder().encode(data))
}
