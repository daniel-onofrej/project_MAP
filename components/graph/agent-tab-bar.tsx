'use client';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ChevronRight, Crown, Bot } from 'lucide-react';
import type { AgentConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

interface AgentTabBarProps {
  family: AgentConfig[];
  masterAgent: AgentConfig;
  activeAgentId: string;
  navigationStack: string[];
  onSelectAgent: (agentId: string) => void;
  onNavigateBack: () => void;
}

export function AgentTabBar({
  family,
  masterAgent,
  activeAgentId,
  navigationStack,
  onSelectAgent,
  onNavigateBack,
}: AgentTabBarProps) {
  const subAgents = family.filter(a => a.parentAgentId === masterAgent.id);
  const isDrilledIn = navigationStack.length > 0;
  const activeAgent = family.find(a => a.id === activeAgentId);

  return (
    <div className="border-b bg-muted/30 px-4 py-1.5 flex flex-col gap-1">
      {/* Breadcrumb */}
      {isDrilledIn && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            className="hover:text-foreground transition-colors cursor-pointer"
            onClick={onNavigateBack}
          >
            {masterAgent.agentRole || masterAgent.name}
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">
            {activeAgent?.agentRole || activeAgent?.name}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto">
        {/* Master tab */}
        <button
          onClick={() => onSelectAgent(masterAgent.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-md text-sm whitespace-nowrap transition-colors cursor-pointer',
            activeAgentId === masterAgent.id
              ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-medium'
              : 'hover:bg-muted text-muted-foreground'
          )}
        >
          <Crown className="h-3.5 w-3.5" />
          {masterAgent.agentRole || 'Master'}
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Sub-agent tabs */}
        {subAgents.map(agent => (
          <button
            key={agent.id}
            onClick={() => onSelectAgent(agent.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-md text-sm whitespace-nowrap transition-colors cursor-pointer',
              activeAgentId === agent.id
                ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium'
                : 'hover:bg-muted text-muted-foreground'
            )}
          >
            <Bot className="h-3.5 w-3.5" />
            {agent.agentRole || agent.name}
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {agent.nodes.length}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
