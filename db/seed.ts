import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import * as schema from './schema'
import { patterns } from './schema'
import { BUILT_IN_PATTERNS } from '../lib/patterns'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL not set')

  const client = postgres(url, { max: 1 })
  const db = drizzle(client, { schema })

  console.log('Seeding built-in patterns...')

  for (const pattern of BUILT_IN_PATTERNS) {
    const existing = await db
      .select({ id: patterns.id })
      .from(patterns)
      .where(eq(patterns.id, pattern.id))
      .limit(1)

    if (existing.length > 0) {
      console.log(`  "${pattern.name}" already exists, skipping.`)
      continue
    }

    await db.insert(patterns).values({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      category: pattern.category,
      domain: null,
      complexity: 'simple',
      icon: pattern.icon,
      tags: pattern.tags,
      templateNodes: pattern.nodes as any,
      templateConnections: pattern.connections as any,
      entryNodeId: pattern.entryNodeId,
      exitNodeIds: pattern.exitNodeIds,
      promptFragment: null,
      ownerId: null,
      groupId: null,
      isPublic: false,
      isBuiltIn: true,
      usageCount: 0,
    })

    console.log(`  Seeded: ${pattern.name}`)
  }

  console.log('Done.')
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
