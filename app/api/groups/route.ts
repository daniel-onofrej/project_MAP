export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { groups, groupMembers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, desc } from 'drizzle-orm'

// GET /api/groups — list groups current user belongs to
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let rows
  if (user.role === 'admin') {
    // Admins see all groups
    rows = await db.select().from(groups).orderBy(desc(groups.createdAt))
  } else {
    rows = await db
      .select({ id: groups.id, name: groups.name, description: groups.description, createdAt: groups.createdAt })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, user.id))
      .orderBy(desc(groups.createdAt))
  }

  return NextResponse.json({ groups: rows })
}

// POST /api/groups — create group (admin or editor)
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const [group] = await db
    .insert(groups)
    .values({ name: body.name.trim(), description: body.description, createdBy: user.id })
    .returning()

  // Creator becomes owner
  await db.insert(groupMembers).values({ groupId: group.id, userId: user.id, role: 'owner' })

  return NextResponse.json({ group }, { status: 201 })
}
