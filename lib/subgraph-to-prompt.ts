import type { NodeData, Connection, AgentConfig } from './types'
import { graphToPrompt } from './graph/graph-to-prompt'

/**
 * Given all nodes and connections in a graph, plus a set of selected node IDs,
 * produces a coherent prompt fragment describing only the selected subgraph.
 *
 * Dangling edges (connections that cross the selection boundary) are noted as
 * context placeholders on entry/exit nodes so the prompt reads naturally.
 */
export function subgraphToPromptFragment(
  allNodes: NodeData[],
  allConnections: Connection[],
  selectedNodeIds: string[]
): string {
  const selectedSet = new Set(selectedNodeIds)

  // Filter to only selected nodes
  const subNodes = allNodes.filter((n) => selectedSet.has(n.id))

  // Only keep connections where BOTH ends are selected
  const subConnections = allConnections.filter(
    (c) => selectedSet.has(c.source) && selectedSet.has(c.target)
  )

  if (subNodes.length === 0) return ''

  // Find entry nodes: no incoming edges within subgraph
  const hasIncoming = new Set(subConnections.map((c) => c.target))
  const entryNodes = subNodes.filter((n) => !hasIncoming.has(n.id))

  // Find exit nodes: no outgoing edges within subgraph
  const hasOutgoing = new Set(subConnections.map((c) => c.source))
  const exitNodes = subNodes.filter((n) => !hasOutgoing.has(n.id))

  // Check for dangling incoming edges (external → selected)
  const hasExternalIncoming = allConnections.some(
    (c) => !selectedSet.has(c.source) && selectedSet.has(c.target)
  )
  // Check for dangling outgoing edges (selected → external)
  const hasExternalOutgoing = allConnections.some(
    (c) => selectedSet.has(c.source) && !selectedSet.has(c.target)
  )

  // Annotate entry/exit nodes with context hints via logicSnippet
  const annotatedNodes = subNodes.map((n) => {
    const isEntry = entryNodes.some((e) => e.id === n.id)
    const isExit = exitNodes.some((e) => e.id === n.id)

    const baseSnippet = (n.config?.logicSnippet as string) ?? n.description ?? n.label ?? ''
    let snippet = baseSnippet

    if (isEntry && hasExternalIncoming) {
      snippet = `[Receives input from graph] ${snippet}`.trim()
    }
    if (isExit && hasExternalOutgoing) {
      snippet = `${snippet} [Continues in graph]`.trim()
    }

    return {
      ...n,
      config: {
        ...n.config,
        logicSnippet: snippet || n.label,
        order: subNodes.indexOf(n),
      },
    }
  })

  // Build a minimal AgentConfig for graphToPrompt
  const minimalAgent: AgentConfig = {
    id: 'subgraph-preview',
    name: 'Pattern Preview',
    description: '',
    nodes: annotatedNodes,
    connections: subConnections,
    version: '1.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return graphToPrompt(minimalAgent)
}

/**
 * Auto-suggest a complexity level based on node count.
 */
export function suggestComplexity(nodeCount: number): 'simple' | 'intermediate' | 'advanced' {
  if (nodeCount <= 2) return 'simple'
  if (nodeCount <= 4) return 'intermediate'
  return 'advanced'
}

/**
 * Auto-suggest a pattern name from selected node labels.
 * Takes up to 3 dominant words from node labels.
 */
export function suggestPatternName(nodes: NodeData[]): string {
  const words = nodes
    .map((n) => n.label ?? '')
    .join(' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3)
  return words.join(' ') || 'New Pattern'
}
