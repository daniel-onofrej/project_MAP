import { DeploymentsPageShell } from '@/components/deployments/deployments-page-shell'

type DeploymentsPageProps = {
  searchParams: Promise<{
    agentId?: string
    agentName?: string
  }>
}

export default async function DeploymentsPage({ searchParams }: DeploymentsPageProps) {
  const params = await searchParams
  return (
    <DeploymentsPageShell
      initialAgentId={params.agentId ?? null}
      initialAgentName={params.agentName ?? null}
    />
  )
}
