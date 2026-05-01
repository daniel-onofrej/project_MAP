export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { comments, users } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, desc } from 'drizzle-orm'
import { publishAgentEvent } from '@/lib/realtime/publisher'

type Params = { id: string }

// GET /api/agents/[id]/comments
export async function GET(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: agentId } = await params

  const rows = await db
    .select({
      id: comments.id,
      nodeId: comments.nodeId,
      content: comments.content,
      resolvedAt: comments.resolvedAt,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      author: { id: users.id, name: users.name, avatarUrl: users.avatarUrl },
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(eq(comments.agentId, agentId))
    .orderBy(desc(comments.createdAt))

  return NextResponse.json({ comments: rows })
}

// POST /api/agents/[id]/comments
export async function POST(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: agentId } = await params
  const body = await request.json()

  if (!body.content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const [comment] = await db
    .insert(comments)
    .values({
      agentId,
      nodeId: body.nodeId ?? null,
      content: body.content.trim(),
      authorId: user.id,
    })
    .returning()

  const commentWithAuthor = {
    ...comment,
    author: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
  }

  await publishAgentEvent(agentId, {
    type: 'comment_added',
    comment: commentWithAuthor as Record<string, unknown>,
  })

  return NextResponse.json({ comment: commentWithAuthor }, { status: 201 })
}
