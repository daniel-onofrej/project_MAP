export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'
import { db } from '@/db'
import { mcpTokens, groupMembers } from '@/db/schema'
import { getSessionUser } from '@/lib/auth/session'
import { eq, desc } from 'drizzle-orm'

function syncTokenToLocalDev(rawToken: string) {
  try {
    // 1. Write MCP_AUTH_TOKEN to mcp-server/.env
    const envPath = resolve(process.cwd(), 'mcp-server/.env')
    let envContent = ''
    try { envContent = readFileSync(envPath, 'utf8') } catch {}
    if (/^MCP_AUTH_TOKEN=/m.test(envContent)) {
      envContent = envContent.replace(/^MCP_AUTH_TOKEN=.*/m, `MCP_AUTH_TOKEN=${rawToken}`)
    } else {
      envContent = envContent.trimEnd() + `\nMCP_AUTH_TOKEN=${rawToken}\n`
    }
    writeFileSync(envPath, envContent, 'utf8')

    // 2. Update ~/.claude/.mcp.json with the token as a header
    const mcpJsonPath = resolve(homedir(), '.claude/.mcp.json')
    let mcpJson: any = {}
    try { mcpJson = JSON.parse(readFileSync(mcpJsonPath, 'utf8')) } catch {}
    mcpJson.mcpServers = mcpJson.mcpServers ?? {}
    mcpJson.mcpServers.MAP = {
      command: 'npx',
      args: ['-y', 'mcp-remote', 'http://localhost:3100/mcp', '--allow-http', '--header', `Authorization: Bearer ${rawToken}`],
    }
    writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2) + '\n', 'utf8')
  } catch (err) {
    // Non-fatal — log but don't fail the token creation
    console.warn('[mcp-tokens] Failed to sync token to local dev files:', err)
  }
}

// GET /api/mcp-tokens — list tokens
// Admin: all tokens. Editor: own tokens only.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let rows
  if (user.role === 'admin') {
    rows = await db
      .select()
      .from(mcpTokens)
      .orderBy(desc(mcpTokens.createdAt))
  } else {
    rows = await db
      .select()
      .from(mcpTokens)
      .where(eq(mcpTokens.createdBy, user.id))
      .orderBy(desc(mcpTokens.createdAt))
  }

  // Never return tokenHash
  const safe = rows.map(({ tokenHash: _omit, ...rest }) => rest)
  return NextResponse.json({ tokens: safe })
}

// POST /api/mcp-tokens — create token
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { name, scopes, expiresAt } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return NextResponse.json({ error: 'scopes must be a non-empty array of group IDs' }, { status: 400 })
  }

  // Editors can only scope to groups they belong to
  if (user.role !== 'admin') {
    const memberships = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id))
    const memberGroupIds = memberships.map(m => m.groupId)
    const invalid = (scopes as string[]).filter(s => !memberGroupIds.includes(s))
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'You are not a member of some requested groups' }, { status: 403 })
    }
  }

  // Generate token: verto_ + 32 hex chars
  const rawToken = 'verto_' + randomBytes(16).toString('hex')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const tokenPrefix = rawToken.slice(0, 8)

  const [created] = await db
    .insert(mcpTokens)
    .values({
      name: name.trim(),
      tokenHash,
      tokenPrefix,
      scopes: scopes as string[],
      createdBy: user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning()

  const { tokenHash: _omit, ...meta } = created

  // Sync token to local dev files (mcp-server/.env + ~/.claude/.mcp.json)
  syncTokenToLocalDev(rawToken)

  // Return raw token ONCE — never stored again
  return NextResponse.json({ token: rawToken, ...meta }, { status: 201 })
}
