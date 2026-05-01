export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { mcpTokens } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'

// PATCH /api/mcp-tokens/[id] — rename token
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Admin can rename any; others can only rename their own
  const whereClause = user.role === 'admin'
    ? eq(mcpTokens.id, id)
    : and(eq(mcpTokens.id, id), eq(mcpTokens.createdBy, user.id))

  const [updated] = await db
    .update(mcpTokens)
    .set({ name: body.name.trim() })
    .where(whereClause!)
    .returning()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { tokenHash: _omit, ...safe } = updated
  return NextResponse.json({ token: safe })
}

// DELETE /api/mcp-tokens/[id] — revoke (soft delete)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const whereClause = user.role === 'admin'
    ? eq(mcpTokens.id, id)
    : and(eq(mcpTokens.id, id), eq(mcpTokens.createdBy, user.id))

  const [revoked] = await db
    .update(mcpTokens)
    .set({ isActive: false })
    .where(whereClause!)
    .returning()

  if (!revoked) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
