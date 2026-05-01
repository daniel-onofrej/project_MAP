export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { promptAgentLinks } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { and, eq } from 'drizzle-orm'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ promptId: string; agentId: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { promptId, agentId } = await params

  await db
    .delete(promptAgentLinks)
    .where(
      and(
        eq(promptAgentLinks.promptAgentId, promptId),
        eq(promptAgentLinks.consumerAgentId, agentId),
      )
    )

  return NextResponse.json({ unlinked: true })
}
