'use client';

import { useMemo } from 'react';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import type { AgentConfig } from '@/lib/types';
import type { ComplexityMetrics } from '@/lib/complexity-metrics';

interface ComplexityMetricsPanelProps {
  agent: AgentConfig;
  metrics: ComplexityMetrics;
}

export function ComplexityMetricsPanel({ agent, metrics }: ComplexityMetricsPanelProps) {
  const { scoreColor, bgColor, icon: Icon } = useMemo(() => {
    switch (metrics.score) {
      case 'simple':
        return {
          scoreColor: 'text-emerald-600 dark:text-emerald-400',
          bgColor: 'bg-emerald-500',
          icon: CheckCircle
        };
      case 'moderate':
        return {
          scoreColor: 'text-sky-600 dark:text-sky-400',
          bgColor: 'bg-sky-500',
          icon: Info
        };
      case 'complex':
        return {
          scoreColor: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-500',
          icon: AlertCircle
        };
      case 'very-complex':
        return {
          scoreColor: 'text-rose-600 dark:text-rose-400',
          bgColor: 'bg-rose-500',
          icon: AlertCircle
        };
      default:
        return {
          scoreColor: 'text-muted-foreground',
          bgColor: 'bg-muted',
          icon: Info
        };
    }
  }, [metrics.score]);

  return (
    <div className="space-y-4 pt-1">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground/80">Cognitive Load</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted/50 ${scoreColor}`}>
              {metrics.cognitiveLoad}/100
            </span>
          </div>
          <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-wider px-2 border-current/20 ${scoreColor}`}>
            {metrics.score === 'very-complex' ? 'High Risk' : metrics.score}
          </Badge>
        </div>
        <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden flex gap-0.5">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={`h-full flex-1 transition-all duration-500 ${i < (metrics.cognitiveLoad / 5) ? bgColor : 'bg-transparent'
                }`}
              style={{ opacity: i < (metrics.cognitiveLoad / 5) ? 0.3 + (i * 0.03) : 1 }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-1">
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-tight text-muted-foreground font-medium">Cyclomatic</p>
          <p className="text-lg font-bold tracking-tight text-foreground/90">{metrics.cyclomaticComplexity}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-tight text-muted-foreground font-medium">Max Depth</p>
          <p className="text-lg font-bold tracking-tight text-foreground/90">{metrics.maxDepth}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-tight text-muted-foreground font-medium">Branch factor</p>
          <p className="text-lg font-bold tracking-tight text-foreground/90">{metrics.branchingFactor}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-tight text-muted-foreground font-medium">Total Nodes</p>
          <p className="text-lg font-bold tracking-tight text-foreground/90">{metrics.totalNodes}</p>
        </div>
      </div>

      {metrics.suggestions.length > 0 && (
        <div className="rounded-lg bg-orange-500/5 border border-orange-500/10 p-3 space-y-2">
          <p className="text-[11px] font-semibold flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
            <Icon className="h-3 w-3" />
            Reliability Suggestions
          </p>
          <ul className="space-y-1.5">
            {metrics.suggestions.map((suggestion, index) => (
              <li key={index} className="text-[10px] text-muted-foreground/90 leading-relaxed flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-orange-400 mt-1.5 flex-shrink-0" />
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
