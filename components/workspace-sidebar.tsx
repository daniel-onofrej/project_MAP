'use client'

import { useState, useEffect } from 'react'
import {
  Network, ChevronDown, ChevronLeft, ChevronRight,
  LayoutDashboard, Users, Settings, BookOpen,
  Shield, LogOut, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace-context'
import { useCurrentUser } from '@/lib/auth/user-context'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'

const COLLAPSED_KEY = 'verto_sidebar_collapsed'

export type SidebarPanel = 'graphs' | 'wiki' | 'members' | 'admin'

interface NavItemProps {
  icon: React.ElementType
  label: string
  collapsed: boolean
  active: boolean
  onClick: () => void
}

function NavItem({ icon: Icon, label, collapsed, active, onClick }: NavItemProps) {
  const el = (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </button>
  )

  if (!collapsed) return el
  return (
    <Tooltip>
      <TooltipTrigger asChild>{el}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

interface WorkspaceSidebarProps {
  activePanel: SidebarPanel
  onPanelChange: (panel: SidebarPanel) => void
}

export function WorkspaceSidebar({ activePanel, onPanelChange }: WorkspaceSidebarProps) {
  const { activeWorkspace, setActiveWorkspace, workspaces } = useWorkspace()
  const { user, logout } = useCurrentUser()

  const [collapsed, setCollapsed] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)

  // Read localStorage on client only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === 'true')
    }
  }, [])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== 'undefined') {
      localStorage.setItem(COLLAPSED_KEY, String(next))
    }
  }

  const isGroupWorkspace = activeWorkspace.id !== null
  const isAdmin = user?.role === 'admin'

  const mainNav: { panel: SidebarPanel; icon: React.ElementType; label: string; show: boolean }[] = [
    { panel: 'graphs', icon: LayoutDashboard, label: 'Graphs', show: true },
    { panel: 'members', icon: Users, label: 'Members', show: isGroupWorkspace && isAdmin },
    { panel: 'admin', icon: Settings, label: 'Settings', show: isGroupWorkspace && isAdmin },
  ]

  const bottomNav: { panel: SidebarPanel; icon: React.ElementType; label: string; show: boolean }[] = [
    { panel: 'wiki', icon: BookOpen, label: 'Wiki', show: true },
    { panel: 'admin', icon: Shield, label: 'Admin', show: isAdmin && !isGroupWorkspace },
  ]

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col h-full bg-background border-r border-border/50 transition-all duration-200 shrink-0 overflow-hidden',
          collapsed ? 'w-12' : 'w-56',
        )}
      >
        {/* Logo + collapse toggle */}
        <div className={cn(
          'flex items-center h-14 border-b border-border/50 px-3',
          collapsed ? 'justify-center' : 'justify-between',
        )}>
          {!collapsed && (
            <button
              onClick={() => onPanelChange('graphs')}
              className="flex items-center gap-2"
            >
              <Network className="h-5 w-5 text-primary shrink-0" />
              <span className="font-semibold text-sm">MAP</span>
            </button>
          )}
          {collapsed && (
            <button onClick={toggleCollapse} title="Expand sidebar">
              <Network className="h-5 w-5 text-primary" />
            </button>
          )}
          {!collapsed && (
            <button
              onClick={toggleCollapse}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Workspace switcher */}
        <div className="border-b border-border/50">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="w-full flex justify-center py-2.5">
                  <div className="h-6 w-6 rounded bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {activeWorkspace.name.slice(0, 1).toUpperCase()}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{activeWorkspace.name}</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <button
                onClick={() => setSwitcherOpen(o => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted transition-colors text-left"
              >
                <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                  {activeWorkspace.name.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-sm font-medium truncate flex-1">{activeWorkspace.name}</span>
                <ChevronDown className={cn(
                  'h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0',
                  switcherOpen && 'rotate-180',
                )} />
              </button>

              {switcherOpen && (
                <div className="pb-1 px-1">
                  {workspaces.map(ws => (
                    <button
                      key={ws.id ?? 'personal'}
                      onClick={() => {
                        setActiveWorkspace(ws)
                        setSwitcherOpen(false)
                        onPanelChange('graphs')
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm text-left"
                    >
                      <div className="h-4 w-4 rounded bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                        {ws.name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="truncate flex-1">{ws.name}</span>
                      {ws.id === activeWorkspace.id && (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex-1 py-2 px-1 space-y-0.5 overflow-y-auto">
          {mainNav.filter(i => i.show).map(item => (
            <NavItem
              key={item.panel + item.label}
              icon={item.icon}
              label={item.label}
              collapsed={collapsed}
              active={activePanel === item.panel}
              onClick={() => onPanelChange(item.panel)}
            />
          ))}
        </nav>

        {/* Bottom nav + user row */}
        <div className="border-t border-border/50 py-2 px-1 space-y-0.5">
          {bottomNav.filter(i => i.show).map(item => (
            <NavItem
              key={item.panel + item.label}
              icon={item.icon}
              label={item.label}
              collapsed={collapsed}
              active={activePanel === item.panel}
              onClick={() => onPanelChange(item.panel)}
            />
          ))}

          {/* User / logout row */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={logout}
                  className="w-full flex justify-center py-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-xs">
                      {user?.name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out ({user?.name})</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarFallback className="text-xs">
                  {user?.name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="truncate flex-1 text-left">{user?.name}</span>
              <LogOut className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  )
}
