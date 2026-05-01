import { notFound } from 'next/navigation'
import type { WikiPageMeta } from '@/lib/wiki/manifest'
import { getPageMeta } from '@/lib/wiki/manifest'

type LoadedPage = {
  meta: WikiPageMeta
  Component: React.ComponentType
  toc: { id: string; label: string; level: 2 | 3 }[]
}

// Server-only dynamic import map. Explicit entries keep Next tracing happy and avoid
// dynamic-require issues in the standalone build.
const LOADERS: Record<string, () => Promise<any>> = {
  // Learn
  'learn/welcome': () => import('@/content/wiki/learn/welcome'),
  'learn/build-your-first-graph': () => import('@/content/wiki/learn/build-your-first-graph'),
  'learn/editing-nodes-and-edges': () => import('@/content/wiki/learn/editing-nodes-and-edges'),
  'learn/versioning': () => import('@/content/wiki/learn/versioning'),
  'learn/mcp-quickstart': () => import('@/content/wiki/learn/mcp-quickstart'),
  'learn/collaborate-with-a-team': () => import('@/content/wiki/learn/collaborate-with-a-team'),
  // Guides
  'guides/import-a-prompt': () => import('@/content/wiki/guides/import-a-prompt'),
  'guides/convert-graph-to-prompt': () => import('@/content/wiki/guides/convert-graph-to-prompt'),
  'guides/use-a-template': () => import('@/content/wiki/guides/use-a-template'),
  'guides/add-an-api-provider': () => import('@/content/wiki/guides/add-an-api-provider'),
  'guides/rotate-revoke-keys': () => import('@/content/wiki/guides/rotate-revoke-keys'),
  'guides/audit-risky-actions': () => import('@/content/wiki/guides/audit-risky-actions'),
  'guides/export-and-share': () => import('@/content/wiki/guides/export-and-share'),
  'guides/debug-failed-generation': () => import('@/content/wiki/guides/debug-failed-generation'),
  // Reference
  'reference/node-types': () => import('@/content/wiki/reference/node-types'),
  'reference/keyboard-shortcuts': () => import('@/content/wiki/reference/keyboard-shortcuts'),
  'reference/feature-matrix': () => import('@/content/wiki/reference/feature-matrix'),
  'reference/templates': () => import('@/content/wiki/reference/templates'),
  'reference/ai-providers': () => import('@/content/wiki/reference/ai-providers'),
  'reference/permissions-and-roles': () => import('@/content/wiki/reference/permissions-and-roles'),
  'reference/mcp-api': () => import('@/content/wiki/reference/mcp-api'),
  'reference/glossary': () => import('@/content/wiki/reference/glossary'),
  // Concepts
  'concepts/prompt-graph-sync': () => import('@/content/wiki/concepts/prompt-graph-sync'),
  'concepts/risk-categories': () => import('@/content/wiki/concepts/risk-categories'),
  'concepts/mcp-integration-model': () => import('@/content/wiki/concepts/mcp-integration-model'),
  'concepts/workspaces-and-groups': () => import('@/content/wiki/concepts/workspaces-and-groups'),
  'concepts/data-privacy': () => import('@/content/wiki/concepts/data-privacy'),
}

export async function loadWikiPage(slug: string): Promise<LoadedPage> {
  const meta = getPageMeta(slug)
  const load = LOADERS[slug]
  if (!meta || !load) notFound()
  const mod = await load()
  return {
    meta,
    Component: mod.default,
    toc: mod.toc ?? [],
  }
}

export function getAllSlugs(): string[] {
  return Object.keys(LOADERS)
}
