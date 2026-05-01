export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

// No session auth — called by MCP server (service-to-service)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const clientName: string = body.clientName ?? 'unknown'

  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      originalPrompt: agents.originalPrompt,
      editedPrompt: agents.editedPrompt,
    })
    .from(agents)
    .where(eq(agents.id, id))

  if (!agent) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 })
  }

  await db
    .update(agents)
    .set({
      pullCount: sql`${agents.pullCount} + 1`,
      lastPulledAt: new Date(),
      lastPulledBy: clientName,
    })
    .where(eq(agents.id, id))

  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    content: agent.editedPrompt ?? agent.originalPrompt ?? '',
  })
}
