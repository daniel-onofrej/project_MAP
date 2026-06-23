'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DeploymentsView } from '@/components/deployments/deployments-view'
import { WorkspaceSidebar, type SidebarPanel } from '@/components/workspace-sidebar'

type DeploymentsPageShellProps = {
  initialAgentId?: string | null
  initialAgentName?: string | null
}

export function DeploymentsPageShell({
  initialAgentId,
  initialAgentName,
}: DeploymentsPageShellProps) {
  const router = useRouter()
  const [activePanel, setActivePanel] = useState<SidebarPanel>('deployments')

  function handlePanelChange(panel: SidebarPanel) {
    setActivePanel(panel)
    if (panel === 'graphs') router.push('/graphs')
    if (panel === 'wiki') router.push('/wiki')
    if (panel === 'deployments') router.push('/deployments')
    if (panel === 'openshell') router.push('/openshell')
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <WorkspaceSidebar activePanel={activePanel} onPanelChange={handlePanelChange} />
      <div className="flex-1 min-w-0">
        <DeploymentsView
          initialAgentId={initialAgentId}
          initialAgentName={initialAgentName}
          onOpenAgent={(agentId) => router.push(`/editor?id=${agentId}`)}
        />
      </div>
    </div>
  )
}
