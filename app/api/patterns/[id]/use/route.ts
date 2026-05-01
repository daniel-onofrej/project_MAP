export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { patterns } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, sql } from 'drizzle-orm'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await db
    .update(patterns)
    .set({
      usageCount: sql`${patterns.usageCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(eq(patterns.id, id))

  return NextResponse.json({ success: true })
}
