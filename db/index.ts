import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Singleton pattern for Next.js — prevent multiple connections in dev due to hot reload
const globalForDb = globalThis as unknown as { _pgClient: postgres.Sql | undefined }

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  return postgres(url, {
    max: 10,           // max pool size
    idle_timeout: 30,  // close idle connections after 30s
    connect_timeout: 10,
  })
}

const client = globalForDb._pgClient ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb._pgClient = client
}

export const db = drizzle(client, { schema })
export type Db = typeof db
