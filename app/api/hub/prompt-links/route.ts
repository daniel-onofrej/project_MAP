export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { promptAgentLinks } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { promptId, agentId } = body

  if (!promptId || !agentId) {
    return NextResponse.json({ error: 'promptId and agentId required' }, { status: 400 })
  }

  await db
    .insert(promptAgentLinks)
    .values({ promptAgentId: promptId, consumerAgentId: agentId })
    .onConflictDoNothing()

  return NextResponse.json({ linked: true })
}
