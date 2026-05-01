import { NextResponse } from 'next/server'
import { getSessionUser, type SessionUser } from './session'

type RouteHandler<T extends Record<string, string>> = (
  request: Request,
  context: { params: T; user: SessionUser }
) => Promise<NextResponse> | NextResponse

/**
 * Wraps a route handler with session validation.
 * Returns 401 if not authenticated.
 */
export function withAuth<T extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<T>
) {
  return async (request: Request, context: { params: Promise<T> }) => {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const params = await context.params
    return handler(request, { params, user })
  }
}

/**
 * Wraps a route handler and requires admin role.
 */
export function withAdmin<T extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<T>
) {
  return withAuth<T>(async (request, context) => {
    if (context.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }
    return handler(request, context)
  })
}

/**
 * Wraps a route handler and requires editor or admin role.
 */
export function withEditor<T extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<T>
) {
  return withAuth<T>(async (request, context) => {
    if (context.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden — editor or admin required' }, { status: 403 })
    }
    return handler(request, context)
  })
}
