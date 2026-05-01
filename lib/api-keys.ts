/**
 * API Key management
 *
 * Two-tier resolution:
 *   1. Group key (stored encrypted in DB) — takes priority
 *   2. .env fallback (GEMINI_API_KEY, OPENAI_API_KEY, etc.)
 *
 * Keys are encrypted with AES-256-GCM using KEY_ENCRYPTION_SECRET.
 * They are NEVER returned in plain text by any API route — only
 * a masked preview (e.g. "sk-...ab12") is exposed to the client.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { db } from '@/db'
import { groupApiKeys, agents } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export type Provider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'custom'

// ── Encryption ───────────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const isProd = process.env.NODE_ENV === 'production'
  const explicit = process.env.KEY_ENCRYPTION_SECRET
  // In production, require a dedicated secret — never share key material with
  // sessions, since rotating/leaking SESSION_SECRET would otherwise expose all
  // stored group API keys.
  if (isProd && !explicit) {
    throw new Error(
      'KEY_ENCRYPTION_SECRET must be set in production. ' +
        'Generate one with: openssl rand -hex 32'
    )
  }
  const secret = explicit ?? process.env.SESSION_SECRET
  if (!secret) {
    throw new Error(
      'KEY_ENCRYPTION_SECRET must be set. Generate one with: openssl rand -hex 32'
    )
  }
  // Derive a 32-byte key from whatever length secret is provided
  return createHash('sha256').update(secret).digest()
}

export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12) // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv(12) + tag(16) + ciphertext — all base64-encoded
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptApiKey(encoded: string): string {
  const key = getEncryptionKey()
  const buf = Buffer.from(encoded, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

/** Returns a safe masked preview: first 4 + last 4 chars, rest as ••• */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return '••••••••'
  return `${plaintext.slice(0, 4)}${'•'.repeat(Math.min(plaintext.length - 8, 16))}${plaintext.slice(-4)}`
}

// ── .env fallback map ────────────────────────────────────────────────────────

const ENV_KEY_MAP: Record<Provider, string[]> = {
  gemini:    ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  openai:    ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  groq:      ['GROQ_API_KEY'],
  custom:    [],
}

function getEnvKey(provider: Provider): string {
  for (const varName of ENV_KEY_MAP[provider] ?? []) {
    const val = process.env[varName]
    if (val) return val
  }
  return ''
}

// ── Key resolution ───────────────────────────────────────────────────────────

/**
 * Resolve the API key for a given provider + optional group.
 *
 * Priority:
 *   1. Group key from DB (if groupId provided and key is set)
 *   2. .env variable fallback
 *
 * Returns empty string if no key is configured anywhere.
 */
export async function resolveApiKey(
  provider: Provider,
  groupId?: string | null
): Promise<string> {
  if (groupId) {
    const [row] = await db
      .select({ keyEnc: groupApiKeys.keyEnc })
      .from(groupApiKeys)
      .where(and(eq(groupApiKeys.groupId, groupId), eq(groupApiKeys.provider, provider)))
      .limit(1)

    if (row?.keyEnc) {
      try {
        return decryptApiKey(row.keyEnc)
      } catch {
        console.error(`[api-keys] Failed to decrypt key for group ${groupId} provider ${provider}`)
      }
    }
  }

  return getEnvKey(provider)
}

/**
 * Resolve the API key for an agent — looks up its group automatically.
 */
export async function resolveApiKeyForAgent(
  provider: Provider,
  agentId: string
): Promise<string> {
  const [agent] = await db
    .select({ groupId: agents.groupId })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1)

  return resolveApiKey(provider, agent?.groupId)
}

/**
 * Check which providers have a key configured for a group.
 * Returns an object with provider → masked preview (or null if not set).
 * Safe to expose to the client.
 */
export async function getGroupKeyStatus(
  groupId: string
): Promise<Record<Provider, { set: boolean; preview: string | null; updatedAt: string | null }>> {
  const rows = await db
    .select({ provider: groupApiKeys.provider, keyEnc: groupApiKeys.keyEnc, updatedAt: groupApiKeys.updatedAt })
    .from(groupApiKeys)
    .where(eq(groupApiKeys.groupId, groupId))

  const result = {} as Record<Provider, { set: boolean; preview: string | null; updatedAt: string | null }>

  const providers: Provider[] = ['gemini', 'openai', 'anthropic', 'groq', 'custom']
  for (const p of providers) {
    const row = rows.find((r) => r.provider === p)
    if (row) {
      let preview: string | null = null
      try {
        preview = maskApiKey(decryptApiKey(row.keyEnc))
      } catch {}
      result[p] = { set: true, preview, updatedAt: row.updatedAt.toISOString() }
    } else {
      // Show whether .env fallback is active
      const envKey = getEnvKey(p)
      result[p] = {
        set: false,
        preview: envKey ? `(from .env) ${maskApiKey(envKey)}` : null,
        updatedAt: null,
      }
    }
  }

  return result
}
