'use client';

import { useMemo } from 'react';
import type { AgentVersion } from '@/lib/storage/version-control';

interface VersionBranchTreeProps {
  versions: AgentVersion[];
  activeVersionId: string | null;
  onSelectVersion: (id: string) => void;
  selectedVersionId?: string | null;
}

const BRANCH_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#f97316',
  '#ec4899',
  '#14b8a6',
];

function getBranchColor(rootInt: number): string {
  return BRANCH_COLORS[(rootInt - 1) % BRANCH_COLORS.length];
}

const ROW_H = 40;
const DOT_R_ACTIVE = 6;
const DOT_R = 4;
const COL_ROOT = 16;
const COL_SUB = 44;
const SVG_WIDTH = 68;

export function VersionBranchTree({
  versions,
  activeVersionId,
  onSelectVersion,
  selectedVersionId,
}: VersionBranchTreeProps) {
  const sorted = versions; // respect the order passed from parent

  const svgHeight = sorted.length * ROW_H;

  const yMap = useMemo(() => {
    const m = new Map<string, number>();
    sorted.forEach((v, i) => m.set(v.id, i * ROW_H + ROW_H / 2));
    return m;
  }, [sorted]);

  return (
    <svg
      width={SVG_WIDTH}
      height={svgHeight}
      className="shrink-0"
      style={{ minHeight: svgHeight }}
    >
      {sorted.map(v => {
        if (!v.parentId) return null;
        const y1 = yMap.get(v.parentId);
        const y2 = yMap.get(v.id);
        if (y1 === undefined || y2 === undefined) return null;

        const isSub = v.versionLabel.includes('.');
        const parentVersion = sorted.find(s => s.id === v.parentId);
        const parentIsSub = parentVersion?.versionLabel.includes('.');
        const rootInt = parseInt(v.versionLabel.split('.')[0], 10);
        const color = getBranchColor(rootInt);

        const x1 = parentIsSub ? COL_SUB : COL_ROOT;
        const x2 = isSub ? COL_SUB : COL_ROOT;

        if (x1 === x2) {
          return (
            <line
              key={`edge-${v.id}`}
              x1={x1} y1={y1}
              x2={x2} y2={y2}
              stroke={color}
              strokeWidth={2}
              strokeOpacity={0.6}
            />
          );
        } else {
          const midY = (y1 + y2) / 2;
          return (
            <polyline
              key={`edge-${v.id}`}
              points={`${x1},${y1} ${x1},${midY} ${x2},${midY} ${x2},${y2}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeOpacity={0.6}
            />
          );
        }
      })}

      {sorted.map(v => {
        const y = yMap.get(v.id)!;
        const isSub = v.versionLabel.includes('.');
        const x = isSub ? COL_SUB : COL_ROOT;
        const rootInt = parseInt(v.versionLabel.split('.')[0], 10);
        const color = getBranchColor(rootInt);
        const isActive = v.id === activeVersionId;
        const isSelected = v.id === selectedVersionId;
        const r = isActive ? DOT_R_ACTIVE : DOT_R;

        return (
          <g key={`dot-${v.id}`} onClick={() => onSelectVersion(v.id)} style={{ cursor: 'pointer' }}>
            <circle cx={x} cy={y} r={r + 4} fill="transparent" />
            <circle
              cx={x} cy={y} r={r}
              fill={isActive ? color : 'transparent'}
              stroke={color}
              strokeWidth={isSelected ? 2.5 : 1.5}
              opacity={isActive ? 1 : 0.75}
            />
            {isSelected && !isActive && (
              <circle cx={x} cy={y} r={r + 3} fill="none" stroke={color} strokeWidth={1} strokeDasharray="2 2" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
