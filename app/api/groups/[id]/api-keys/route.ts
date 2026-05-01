export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { groupMembers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { getGroupKeyStatus } from '@/lib/api-keys'
import { eq, and } from 'drizzle-orm'

type Params = { id: string }

async function isGroupAdminOrOrgAdmin(groupId: string, userId: string, role: string) {
  if (role === 'admin') return true
  const [m] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1)
  return m?.role === 'owner'
}

// GET /api/groups/[id]/api-keys
// Returns which providers have keys set + masked previews. Never returns plain text.
export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId } = await params

  const allowed = await isGroupAdminOrOrgAdmin(groupId, user.id, user.role)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const status = await getGroupKeyStatus(groupId)
  return NextResponse.json({ keys: status })
}
