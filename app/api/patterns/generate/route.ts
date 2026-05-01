export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { promptToGraph } from '@/lib/prompt-to-graph/v1/prompt-to-graph'
import { graphToPrompt } from '@/lib/graph/graph-to-prompt'
import { suggestComplexity } from '@/lib/subgraph-to-prompt'
import type { PromptPattern } from '@/lib/types'

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, apiKey } = await request.json()

  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  // Use server-side env key if available, fall back to client-supplied key
  const resolvedKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || apiKey

  if (!resolvedKey) {
    return NextResponse.json({ error: 'No Gemini API key configured' }, { status: 400 })
  }

  try {
    const agentConfig = await promptToGraph(prompt, { apiKey: resolvedKey })

    // Determine entry node: first node with no incoming connections
    const hasIncoming = new Set(agentConfig.connections.map((c) => c.target))
    const entryNode = agentConfig.nodes.find((n) => !hasIncoming.has(n.id)) ?? agentConfig.nodes[0]

    // Determine exit nodes: nodes with no outgoing connections
    const hasOutgoing = new Set(agentConfig.connections.map((c) => c.source))
    const exitNodes = agentConfig.nodes.filter((n) => !hasOutgoing.has(n.id))

    // Generate prompt fragment
    const promptFragment = graphToPrompt(agentConfig)

    const pattern: PromptPattern = {
      id: crypto.randomUUID(),
      name: agentConfig.name || 'Generated Pattern',
      description: agentConfig.description || prompt.slice(0, 120),
      category: 'reasoning',
      icon: '✨',
      tags: [],
      nodes: agentConfig.nodes,
      connections: agentConfig.connections,
      entryNodeId: entryNode?.id ?? '',
      exitNodeIds: exitNodes.map((n) => n.id),
      promptFragment,
      complexity: suggestComplexity(agentConfig.nodes.length),
      isBuiltIn: false,
      isPublic: false,
    }

    return NextResponse.json({ pattern })
  } catch (e: any) {
    console.error('[POST /api/patterns/generate]', e)
    return NextResponse.json({ error: e.message ?? 'Generation failed' }, { status: 500 })
  }
}
