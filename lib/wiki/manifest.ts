import type { ComponentType } from 'react'

export type WikiGroup = 'learn' | 'guides' | 'reference' | 'concepts'

export type WikiPageMeta = {
  slug: string
  title: string
  summary: string
  group: WikiGroup
  order: number
  updated: string
  keywords?: string[]
}

export type WikiPageModule = {
  meta: WikiPageMeta
  default: ComponentType
  toc?: { id: string; label: string; level?: 2 | 3 }[]
}

export const GROUP_META: Record<
  WikiGroup,
  { label: string; tagline: string; icon: string; accent: string }
> = {
  learn: {
    label: 'Learn',
    tagline: 'Step-by-step tutorials for new users',
    icon: '🎓',
    accent: 'text-cyan-400',
  },
  guides: {
    label: 'Guides',
    tagline: 'Task-oriented how-tos',
    icon: '📘',
    accent: 'text-blue-400',
  },
  reference: {
    label: 'Reference',
    tagline: 'Exhaustive lookup for nodes, shortcuts, APIs',
    icon: '📖',
    accent: 'text-indigo-400',
  },
  concepts: {
    label: 'Concepts',
    tagline: 'The mental model behind MAP',
    icon: '💡',
    accent: 'text-amber-400',
  },
}

const LEARN: WikiPageMeta[] = [
  { slug: 'learn/welcome', title: 'Welcome to MAP', summary: 'What MAP is, who it is for, and the 60-second overview.', group: 'learn', order: 1, updated: '2026-04-19' },
  { slug: 'learn/build-your-first-graph', title: 'Build Your First Graph', summary: 'Generate a graph from a prompt, edit nodes, re-sync, save a version. ~5 minutes.', group: 'learn', order: 2, updated: '2026-04-19' },
  { slug: 'learn/editing-nodes-and-edges', title: 'Editing Nodes and Edges', summary: 'Add, connect, delete, re-type, and resolve conflicts on the canvas.', group: 'learn', order: 3, updated: '2026-04-19' },
  { slug: 'learn/versioning', title: 'Versioning Your Agent', summary: 'Snapshots, diffs, rollback, and naming conventions.', group: 'learn', order: 4, updated: '2026-04-19' },
  { slug: 'learn/mcp-quickstart', title: 'Expose a Graph over MCP', summary: 'Enable the MCP server, mint a token, connect Claude Desktop, invoke a graph.', group: 'learn', order: 5, updated: '2026-04-19' },
  { slug: 'learn/collaborate-with-a-team', title: 'Collaborate with a Team', summary: 'Workspaces, groups, roles, sharing, and approval.', group: 'learn', order: 6, updated: '2026-04-19' },
]

const GUIDES: WikiPageMeta[] = [
  { slug: 'guides/import-a-prompt', title: 'Import a Prompt', summary: 'Bring an existing prompt into MAP from a file or paste.', group: 'guides', order: 1, updated: '2026-04-19' },
  { slug: 'guides/convert-graph-to-prompt', title: 'Convert a Graph Back to a Prompt', summary: 'Deterministic graph→prompt reconstruction and the similarity score.', group: 'guides', order: 2, updated: '2026-04-19' },
  { slug: 'guides/use-a-template', title: 'Use a Template', summary: 'Bootstrap a graph from one of the built-in templates.', group: 'guides', order: 3, updated: '2026-04-19' },
  { slug: 'guides/add-an-api-provider', title: 'Add an API Provider', summary: 'Configure Gemini, OpenAI, Anthropic, Groq, or a custom endpoint.', group: 'guides', order: 4, updated: '2026-04-19' },
  { slug: 'guides/rotate-revoke-keys', title: 'Rotate or Revoke API Keys', summary: 'Key storage, masked previews, rotation, and revocation flow.', group: 'guides', order: 5, updated: '2026-04-19' },
  { slug: 'guides/audit-risky-actions', title: 'Audit Risky Actions', summary: 'Use risk categories and the Actions & Permissions panel to find unsafe steps.', group: 'guides', order: 6, updated: '2026-04-19' },
  { slug: 'guides/export-and-share', title: 'Export and Share', summary: 'Export a graph as JSON, share with a group, or publish a read-only link.', group: 'guides', order: 7, updated: '2026-04-19' },
  { slug: 'guides/debug-failed-generation', title: 'Debug a Failed Generation', summary: 'Common errors and exactly how to fix each.', group: 'guides', order: 8, updated: '2026-04-19' },
]

const REFERENCE: WikiPageMeta[] = [
  { slug: 'reference/node-types', title: 'Node Types', summary: 'All 22 node types with taxonomy, colors, icons, and when-to-use.', group: 'reference', order: 1, updated: '2026-04-19' },
  { slug: 'reference/keyboard-shortcuts', title: 'Keyboard Shortcuts', summary: 'Every shortcut, grouped by panel.', group: 'reference', order: 2, updated: '2026-04-19' },
  { slug: 'reference/feature-matrix', title: 'Feature Matrix', summary: 'Shipped features, work in progress, and what each connects to.', group: 'reference', order: 3, updated: '2026-04-19' },
  { slug: 'reference/templates', title: 'Templates Catalog', summary: 'Every built-in template with node composition and typical use.', group: 'reference', order: 4, updated: '2026-04-19' },
  { slug: 'reference/ai-providers', title: 'AI Providers', summary: 'Per-provider setup, models, and environment variables.', group: 'reference', order: 5, updated: '2026-04-19' },
  { slug: 'reference/permissions-and-roles', title: 'Permissions and Roles', summary: 'Risk categories, Guarded vs Unguarded, and the role matrix.', group: 'reference', order: 6, updated: '2026-04-19' },
  { slug: 'reference/mcp-api', title: 'MCP API', summary: 'Every MCP tool the MAP server exposes, with scopes and examples.', group: 'reference', order: 7, updated: '2026-04-19' },
  { slug: 'reference/glossary', title: 'Glossary', summary: 'Alphabetical definitions of every MAP term.', group: 'reference', order: 8, updated: '2026-04-19' },
]

const CONCEPTS: WikiPageMeta[] = [
  { slug: 'concepts/prompt-graph-sync', title: 'Prompt ↔ Graph Bidirectional Sync', summary: 'Why MAP syncs in both directions, how similarity is scored.', group: 'concepts', order: 1, updated: '2026-04-19' },
  { slug: 'concepts/risk-categories', title: 'Risk Categories and Guarded Actions', summary: 'Why actions are classified, how detection works, where it fails.', group: 'concepts', order: 2, updated: '2026-04-19' },
  { slug: 'concepts/mcp-integration-model', title: 'The MCP Integration Model', summary: 'Why MCP, how token scopes work, and the threat model.', group: 'concepts', order: 3, updated: '2026-04-19' },
  { slug: 'concepts/workspaces-and-groups', title: 'Workspaces, Groups, and Roles', summary: 'The permission model, end to end.', group: 'concepts', order: 4, updated: '2026-04-19' },
  { slug: 'concepts/data-privacy', title: 'Data Privacy', summary: 'What leaves the machine, what stays, what is encrypted at rest.', group: 'concepts', order: 5, updated: '2026-04-19' },
]

export const WIKI_PAGES: WikiPageMeta[] = [...LEARN, ...GUIDES, ...REFERENCE, ...CONCEPTS]

export const WIKI_GROUPS: { group: WikiGroup; pages: WikiPageMeta[] }[] = (
  ['learn', 'guides', 'reference', 'concepts'] as WikiGroup[]
).map((g) => ({
  group: g,
  pages: WIKI_PAGES.filter((p) => p.group === g).sort((a, b) => a.order - b.order),
}))

export function getPageMeta(slug: string): WikiPageMeta | undefined {
  return WIKI_PAGES.find((p) => p.slug === slug)
}

export function getAdjacentPages(slug: string): {
  prev?: WikiPageMeta
  next?: WikiPageMeta
} {
  const idx = WIKI_PAGES.findIndex((p) => p.slug === slug)
  if (idx === -1) return {}
  return {
    prev: idx > 0 ? WIKI_PAGES[idx - 1] : undefined,
    next: idx < WIKI_PAGES.length - 1 ? WIKI_PAGES[idx + 1] : undefined,
  }
}

export const POPULAR_PAGES = [
  'learn/build-your-first-graph',
  'learn/mcp-quickstart',
  'reference/node-types',
  'concepts/prompt-graph-sync',
]

export const RECENTLY_UPDATED = [
  'reference/mcp-api',
  'concepts/risk-categories',
  'reference/templates',
  'learn/welcome',
]
