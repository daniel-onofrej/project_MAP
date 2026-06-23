'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { OpenShellConsole } from '@/components/openshell/openshell-console'
import { WorkspaceSidebar, type SidebarPanel } from '@/components/workspace-sidebar'

export function OpenShellPageShell() {
  const router = useRouter()
  const [activePanel, setActivePanel] = useState<SidebarPanel>('openshell')

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
        <OpenShellConsole />
      </div>
    </div>
  )
}
