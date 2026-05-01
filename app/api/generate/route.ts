export const dynamic = 'force-dynamic'

/**
 * POST /api/generate
 *
 * Unified generation endpoint that routes to the correct AI provider.
 * Resolves API keys server-side (group key → env fallback) so the client
 * never needs to handle raw keys.
 *
 * Body:
 *   providerConfig: ProviderConfig   — provider, model, temperature, etc.
 *   systemPrompt:   string           — the system/instruction prompt
 *   userPrompt:     string           — the user message (agent description)
 *   groupId?:       string | null    — used for key resolution
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { resolveApiKey } from '@/lib/api-keys'
import { callProvider } from '@/lib/ai/provider-client'
import type { ProviderConfig } from '@/lib/types'

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    providerConfig: ProviderConfig
    systemPrompt: string
    userPrompt: string
    groupId?: string | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { providerConfig, systemPrompt, userPrompt, groupId } = body

  if (!providerConfig?.provider || !systemPrompt || !userPrompt) {
    return NextResponse.json({ error: 'Missing required fields: providerConfig, systemPrompt, userPrompt' }, { status: 400 })
  }

  // Resolve API key server-side
  let apiKey = ''
  try {
    // 'custom' provider uses its own base URL with the stored key
    const providerForKey = providerConfig.provider === 'custom' ? 'custom' : providerConfig.provider
    apiKey = await resolveApiKey(providerForKey as Parameters<typeof resolveApiKey>[0], groupId)
  } catch (err) {
    console.error('[generate] Key resolution failed:', err)
  }

  if (!apiKey && providerConfig.provider !== 'custom') {
    return NextResponse.json(
      { error: `No API key configured for provider "${providerConfig.provider}". Add one in Settings → API Keys.` },
      { status: 422 }
    )
  }

  try {
    const result = await callProvider({
      config: providerConfig,
      apiKey,
      systemPrompt,
      userPrompt,
    })
    return NextResponse.json({ text: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    console.error('[generate] Provider call failed:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
