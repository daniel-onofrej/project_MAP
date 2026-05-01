import { getRedisPub } from '@/lib/redis'

export type SSEEventType =
  | 'graph_update'
  | 'node_locked'
  | 'node_unlocked'
  | 'presence_update'
  | 'comment_added'
  | 'comment_resolved'

export type UserSummary = {
  id: string
  name: string
  avatarUrl: string | null
}

export type SSEEvent =
  | { type: 'graph_update'; payload: Record<string, unknown>; by: UserSummary }
  | { type: 'node_locked'; nodeId: string; by: UserSummary; expiresAt: string }
  | { type: 'node_unlocked'; nodeId: string; by: UserSummary }
  | { type: 'presence_update'; users: PresenceUser[] }
  | { type: 'comment_added'; comment: Record<string, unknown> }
  | { type: 'comment_resolved'; commentId: string; by: UserSummary }

export type PresenceUser = UserSummary & { joinedAt: number }

export function agentChannel(agentId: string): string {
  return `agent:${agentId}`
}

/**
 * Publish an event to all SSE subscribers of an agent.
 * Silently no-ops if Redis is unavailable.
 */
export async function publishAgentEvent(agentId: string, event: SSEEvent): Promise<void> {
  try {
    const pub = getRedisPub()
    await pub.publish(agentChannel(agentId), JSON.stringify(event))
  } catch (err) {
    console.error('[publisher] Failed to publish event:', err)
  }
}
