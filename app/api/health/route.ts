import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

// Disable Next.js static caching — this must always be evaluated live
export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 *
 * Used by:
 *  - Docker HEALTHCHECK  (Dockerfile)
 *  - Nginx internal health probe
 *  - Kubernetes liveness & readiness probes
 *
 * Returns 200 when the app and its database connection are healthy.
 * Returns 503 when the database is unreachable so K8s can restart the pod.
 */
export async function GET() {
  try {
    // Lightweight round-trip to confirm the DB connection pool is live
    await db.execute(sql`SELECT 1`)

    return NextResponse.json(
      { status: 'ok', timestamp: new Date().toISOString() },
      { status: 200 }
    )
  } catch {
    return NextResponse.json(
      { status: 'error', reason: 'database unreachable' },
      { status: 503 }
    )
  }
}
