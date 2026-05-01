export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth/session'

export async function POST() {
  try {
    await deleteSession()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[auth/logout]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
