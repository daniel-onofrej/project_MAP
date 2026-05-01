export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { patterns, groupMembers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, and, or, ilike, inArray, SQL } from 'drizzle-orm'

// GET /api/patterns
// Query params: tab=builtin|workspace|community, category=, domain=, complexity=, search=
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tab = searchParams.get('tab') ?? 'builtin'
  const category = searchParams.get('category')
  const domain = searchParams.get('domain')
  const complexity = searchParams.get('complexity')
  const search = searchParams.get('search')

  const userGroupIds = (
    await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id))
  ).map((r) => r.groupId)

  const conditions: SQL[] = []

  if (tab === 'builtin') {
    conditions.push(eq(patterns.isBuiltIn, true))
  } else if (tab === 'workspace') {
    conditions.push(eq(patterns.isBuiltIn, false))
    conditions.push(eq(patterns.isPublic, false))
    if (userGroupIds.length > 0) {
      conditions.push(
        or(
          eq(patterns.ownerId, user.id),
          inArray(patterns.groupId, userGroupIds)
        )!
      )
    } else {
      conditions.push(eq(patterns.ownerId, user.id))
    }
  } else if (tab === 'community') {
    conditions.push(eq(patterns.isBuiltIn, false))
    conditions.push(eq(patterns.isPublic, true))
  }

  if (category) conditions.push(eq(patterns.category, category))
  if (domain) conditions.push(eq(patterns.domain, domain))
  if (complexity) conditions.push(eq(patterns.complexity, complexity))
  if (search) {
    conditions.push(
      or(
        ilike(patterns.name, `%${search}%`),
        ilike(patterns.description, `%${search}%`)
      )!
    )
  }

  const rows = await db
    .select()
    .from(patterns)
    .where(and(...conditions))
    .orderBy(patterns.createdAt)

  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    category: r.category,
    domain: r.domain,
    complexity: r.complexity,
    icon: r.icon,
    tags: r.tags ?? [],
    nodes: r.templateNodes as any[],
    connections: r.templateConnections as any[],
    entryNodeId: r.entryNodeId,
    exitNodeIds: r.exitNodeIds ?? [],
    promptFragment: r.promptFragment,
    isBuiltIn: r.isBuiltIn,
    isPublic: r.isPublic,
    ownerId: r.ownerId,
    groupId: r.groupId,
    usageCount: r.usageCount,
    createdAt: r.createdAt?.toISOString(),
  }))

  return NextResponse.json({ patterns: result })
}

// POST /api/patterns
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    name, description, category, domain, complexity, icon, tags,
    nodes, connections, entryNodeId, exitNodeIds, promptFragment,
    groupId, isPublic,
  } = body

  if (!name || !category || !nodes || !connections || !entryNodeId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const id = crypto.randomUUID()

  const [created] = await db.insert(patterns).values({
    id,
    name,
    description: description ?? null,
    category,
    domain: domain ?? null,
    complexity: complexity ?? 'simple',
    icon: icon ?? '🔧',
    tags: tags ?? [],
    templateNodes: nodes,
    templateConnections: connections,
    entryNodeId,
    exitNodeIds: exitNodeIds ?? [],
    promptFragment: promptFragment ?? null,
    ownerId: user.id,
    groupId: groupId ?? null,
    isPublic: isPublic ?? false,
    isBuiltIn: false,
  }).returning()

  return NextResponse.json({ pattern: created }, { status: 201 })
}
