const DEFAULT_WORKER_URL = 'http://localhost:3200'

export type WorkerResult<T = unknown> = {
  ok: boolean
  data?: T
  error?: string
}

function workerUrl(): string {
  return (process.env.DEPLOYMENT_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/$/, '')
}

export async function callDeploymentWorker<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<WorkerResult<T>> {
  try {
    const res = await fetch(`${workerUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: data.error ?? `Worker request failed with ${res.status}` }
    }
    return { ok: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deployment worker is unavailable'
    return { ok: false, error: message }
  }
}
