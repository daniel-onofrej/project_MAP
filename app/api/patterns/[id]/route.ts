export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { patterns } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await db
    .select()
    .from(patterns)
    .where(and(eq(patterns.id, id), eq(patterns.ownerId, user.id)))
    .limit(1)

  if (existing.length === 0)
    return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 })

  if (existing[0].isBuiltIn)
    return NextResponse.json({ error: 'Cannot modify built-in patterns' }, { status: 403 })

  const body = await request.json()
  const { name, description, category, domain, complexity, icon, tags, isPublic } = body

  const [updated] = await db
    .update(patterns)
    .set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(category !== undefined && { category }),
      ...(domain !== undefined && { domain }),
      ...(complexity !== undefined && { complexity }),
      ...(icon !== undefined && { icon }),
      ...(tags !== undefined && { tags }),
      ...(isPublic !== undefined && { isPublic }),
      updatedAt: new Date(),
    })
    .where(eq(patterns.id, id))
    .returning()

  return NextResponse.json({ pattern: updated })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await db
    .select()
    .from(patterns)
    .where(and(eq(patterns.id, id), eq(patterns.ownerId, user.id)))
    .limit(1)

  if (existing.length === 0)
    return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 })

  if (existing[0].isBuiltIn)
    return NextResponse.json({ error: 'Cannot delete built-in patterns' }, { status: 403 })

  await db.delete(patterns).where(eq(patterns.id, id))

  return NextResponse.json({ success: true })
}
