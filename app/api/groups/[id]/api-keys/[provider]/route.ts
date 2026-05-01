export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { groupMembers, groupApiKeys } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { encryptApiKey, maskApiKey, type Provider } from '@/lib/api-keys'
import { eq, and } from 'drizzle-orm'

type Params = { id: string; provider: string }

const VALID_PROVIDERS: Provider[] = ['gemini', 'openai', 'anthropic', 'groq', 'custom']

async function isGroupAdminOrOrgAdmin(groupId: string, userId: string, role: string) {
  if (role === 'admin') return true
  const [m] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1)
  return m?.role === 'owner'
}

// PUT /api/groups/[id]/api-keys/[provider]
// Set or update the API key for a provider. Body: { key: "sk-..." }
export async function PUT(request: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId, provider } = await params

  if (!VALID_PROVIDERS.includes(provider as Provider)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
      { status: 400 }
    )
  }

  const allowed = await isGroupAdminOrOrgAdmin(groupId, user.id, user.role)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const key: string = body.key?.trim()

  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })
  if (key.length < 8) return NextResponse.json({ error: 'key is too short' }, { status: 400 })

  const keyEnc = encryptApiKey(key)

  await db
    .insert(groupApiKeys)
    .values({ groupId, provider, keyEnc, updatedBy: user.id })
    .onConflictDoUpdate({
      target: [groupApiKeys.groupId, groupApiKeys.provider],
      set: { keyEnc, updatedBy: user.id, updatedAt: new Date() },
    })

  return NextResponse.json({
    ok: true,
    provider,
    preview: maskApiKey(key),   // show masked version so UI can confirm it was saved
  })
}

// DELETE /api/groups/[id]/api-keys/[provider]
// Remove the key — group will fall back to .env
export async function DELETE(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId, provider } = await params

  const allowed = await isGroupAdminOrOrgAdmin(groupId, user.id, user.role)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await db
    .delete(groupApiKeys)
    .where(and(eq(groupApiKeys.groupId, groupId), eq(groupApiKeys.provider, provider as Provider)))

  return NextResponse.json({ ok: true, fallback: '.env' })
}
