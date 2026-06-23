import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { OpenShellPageShell } from '@/components/openshell/openshell-page-shell'

export const dynamic = 'force-dynamic'

export default async function OpenShellPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return <OpenShellPageShell />
}
