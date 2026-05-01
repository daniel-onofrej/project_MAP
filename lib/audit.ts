import { db } from '@/db'
import { auditLog } from '@/db/schema'

type WriteAuditParams = {
  agentId?: string | null
  userId?: string | null
  eventType: string
  diff?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}

export async function writeAuditLog(params: WriteAuditParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      agentId: params.agentId ?? null,
      userId: params.userId ?? null,
      eventType: params.eventType,
      diff: params.diff ?? null,
      metadata: params.metadata ?? {},
    })
  } catch (err) {
    // Never let audit log failures break the main request
    console.error('[audit] Failed to write audit log:', err)
  }
}

// ── Node diff helpers ────────────────────────────────────────────────────────

type NodeLike = { id: string; label?: string; type?: string; config?: unknown }

type NodeDiffResult = {
  type: 'node_added' | 'node_removed' | 'node_updated'
  nodeId: string
  label: string
  diff: { before: NodeLike | null; after: NodeLike | null }
}

export function diffNodes(
  before: NodeLike[],
  after: NodeLike[]
): NodeDiffResult[] {
  const results: NodeDiffResult[] = []
  const beforeMap = new Map(before.map((n) => [n.id, n]))
  const afterMap = new Map(after.map((n) => [n.id, n]))

  // Added nodes
  for (const [id, node] of afterMap) {
    if (!beforeMap.has(id)) {
      results.push({
        type: 'node_added',
        nodeId: id,
        label: node.label ?? id,
        diff: { before: null, after: node },
      })
    }
  }

  // Removed nodes
  for (const [id, node] of beforeMap) {
    if (!afterMap.has(id)) {
      results.push({
        type: 'node_removed',
        nodeId: id,
        label: node.label ?? id,
        diff: { before: node, after: null },
      })
    }
  }

  // Updated nodes
  for (const [id, afterNode] of afterMap) {
    const beforeNode = beforeMap.get(id)
    if (beforeNode) {
      const bStr = JSON.stringify(beforeNode)
      const aStr = JSON.stringify(afterNode)
      if (bStr !== aStr) {
        results.push({
          type: 'node_updated',
          nodeId: id,
          label: afterNode.label ?? id,
          diff: { before: beforeNode, after: afterNode },
        })
      }
    }
  }

  return results
}
