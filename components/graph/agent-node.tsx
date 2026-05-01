'use client';

import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NODE_COLORS, NODE_ICONS, type NodeType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlertTriangle, AlertCircle, Info, Trash2, Check, X, ExternalLink, Sparkles, Pencil, Unlock, ShieldAlert } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  type: NodeType;
  description?: string;
  hasConflict?: boolean;
  isDangerous?: boolean;
  isHighlighted?: boolean;
  conflictSeverity?: 'critical' | 'warning' | 'info';
  conflictCount?: number;
  onEdit?: (label: string, description?: string) => void;
  onDelete?: () => void;
  onConflictClick?: () => void;
  linkedAgentId?: string;
  onDrillDown?: () => void;
  isGeneratedByEdit?: boolean;
  isModifiedByEdit?: boolean;
  isPendingAdd?: boolean;
  isPendingRemove?: boolean;
  isPendingUpdate?: boolean;
  optionChips?: Array<{ id: string; label: string; nodeType: string }>;
  onChipClick?: (chipNodeId: string) => void;
  isTemplateSelected?: boolean;
}

export const AgentNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as AgentNodeData;
  const color = NODE_COLORS[nodeData.type] ?? '#6366f1';
  const icon = NODE_ICONS[nodeData.type] ?? '◉';
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(nodeData.label);
  const [editDescription, setEditDescription] = useState(nodeData.description || '');
  const [isHovered, setIsHovered] = useState(false);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // If this is a linked AGENT node, drill down instead of editing
    if (nodeData.linkedAgentId && nodeData.onDrillDown) {
      nodeData.onDrillDown();
      return;
    }
    toast.info('Graph modification is only supported by AI');
  };

  const handleSave = () => {
    if (nodeData.onEdit) {
      nodeData.onEdit(editLabel, editDescription);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditLabel(nodeData.label);
    setEditDescription(nodeData.description || '');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    toast.info('Graph modification is only supported by AI');
  };

  // GROUP container — renders as a labeled header bar only (children are React Flow sub-nodes)
  if (nodeData.type === 'GROUP') {
    return (
      <div
        className="rounded-xl bg-slate-50/60 dark:bg-slate-900/40 border border-slate-300 dark:border-slate-700"
        style={{
          width: '100%',
          height: '100%',
          minWidth: 260,
          minHeight: 120,
        }}
      >
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <div
          className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 rounded-t-xl"
          style={{ borderLeft: `4px solid ${color}` }}
        >
          {icon} {nodeData.label}
        </div>
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>
    );
  }

  const isAnnotationType = ['RULE', 'CONFIG', 'MEMORY', 'GUARD', 'REFERENCE', 'PERSONA', 'INPUT', 'TRIGGER'].includes(nodeData.type);

  return (
    <div
      className={cn(
        'rounded-lg bg-card shadow-sm transition-all relative group',
        isAnnotationType ? 'border border-dashed border-border' : 'border border-border',
        isAnnotationType ? 'p-2' : 'p-0',
        nodeData.isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1' : '',
        nodeData.isTemplateSelected ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-transparent' : '',
        nodeData.hasConflict ? 'border-red-400' : '',
        nodeData.isPendingAdd ? 'ring-2 ring-green-500 ring-offset-1 bg-green-500/5' : '',
        nodeData.isPendingRemove ? 'ring-2 ring-red-500 ring-offset-1' : '',
        nodeData.isPendingUpdate ? 'ring-2 ring-blue-500 ring-offset-1 bg-blue-500/5' : '',
      )}
      style={{
        width: isAnnotationType ? 180 : 220,
        borderLeftWidth: 4,
        borderLeftStyle: isAnnotationType ? 'dashed' : 'solid',
        borderLeftColor: color,
        boxShadow: nodeData.isTemplateSelected
          ? `0 0 0 2px #818cf8, 0 0 16px 4px #818cf840, 0 4px 12px rgba(0,0,0,0.25)`
          : selected
          ? `0 0 0 2px ${color}60, 0 4px 12px rgba(0,0,0,0.25)`
          : '0 1px 4px rgba(0,0,0,0.2)',
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* AI-generated badge */}
      {nodeData.isGeneratedByEdit && !nodeData.isDangerous && !nodeData.conflictSeverity && (
        <div
          className="absolute -top-2 -right-2 bg-violet-500 text-white rounded-full p-0.5 shadow z-10"
          title="Added by AI edit"
        >
          <Sparkles className="h-3 w-3" />
        </div>
      )}

      {/* AI-modified badge */}
      {nodeData.isModifiedByEdit && !nodeData.isGeneratedByEdit && !nodeData.isDangerous && !nodeData.conflictSeverity && (
        <div
          className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full p-0.5 shadow z-10"
          title="Modified by AI edit"
        >
          <Pencil className="h-3 w-3" />
        </div>
      )}

      {/* Danger badge */}
      {nodeData.isDangerous && (
        <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow z-10">
          <AlertTriangle className="h-3 w-3" />
        </div>
      )}

      {/* V9 injection-risk badge */}
      {(nodeData.config as any)?.injectionRisk === 'high' && (
        <div
          className="absolute -top-2 -left-2 bg-amber-500 text-white rounded-full p-0.5 shadow z-10"
          title={`Injection risk: high — ${(nodeData.config as any)?.riskNotes ?? 'untrusted input'}`}
        >
          <ShieldAlert className="h-3 w-3" />
        </div>
      )}

      {/* V9 PII-leaves-system badge */}
      {(nodeData.config as any)?.piiExposure === 'leaves-system' && (
        <div
          className="absolute -bottom-2 -left-2 bg-red-600 text-white rounded-full p-0.5 shadow z-10"
          title={`PII leaves system${(nodeData.config as any)?.dataReads ? `: ${(nodeData.config as any).dataReads.join(', ')}` : ''}`}
        >
          <Unlock className="h-3 w-3" />
        </div>
      )}

      {/* Conflict severity badge */}
      {nodeData.conflictSeverity && (
        <button
          className={cn(
            'absolute z-20 rounded-full flex items-center justify-center text-white shadow border-2 border-white cursor-pointer transition-transform hover:scale-110',
            nodeData.isDangerous ? 'top-3 -right-2' : '-top-2 -right-2',
            nodeData.conflictSeverity === 'critical' && 'bg-red-500',
            nodeData.conflictSeverity === 'warning' && 'bg-amber-500',
            nodeData.conflictSeverity === 'info' && 'bg-blue-500',
            (nodeData.conflictCount ?? 0) > 1 ? 'min-w-5 h-5 px-1 gap-0.5' : 'w-5 h-5',
          )}
          onClick={(e) => { e.stopPropagation(); nodeData.onConflictClick?.(); }}
          title={`${nodeData.conflictCount ?? 1} ${nodeData.conflictSeverity} issue${(nodeData.conflictCount ?? 1) > 1 ? 's' : ''} — click to view`}
        >
          {nodeData.conflictSeverity === 'info'
            ? <Info className="h-2.5 w-2.5 flex-shrink-0" />
            : nodeData.conflictSeverity === 'critical'
              ? <AlertCircle className="h-2.5 w-2.5 flex-shrink-0" />
              : <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0" />
          }
          {(nodeData.conflictCount ?? 0) > 1 && (
            <span className="text-[9px] font-bold leading-none">{nodeData.conflictCount}</span>
          )}
        </button>
      )}

      {/* Delete button on hover */}
      {isHovered && !isEditing && nodeData.onDelete && (
        <Button
          size="icon"
          variant="destructive"
          className="absolute -top-2 -left-2 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity z-10 rounded-full shadow"
          onClick={handleDelete}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </Button>
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !border-2 !border-card"
        style={{ background: color }}
      />

      <div className="p-3">
        {isEditing ? (
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1">
              <span className="text-base leading-none" role="img" aria-label={nodeData.type}>
                {icon}
              </span>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="h-6 text-xs flex-1"
                placeholder="Node label"
                autoFocus
              />
            </div>
            <Input
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="h-6 text-xs"
              placeholder="Description (optional)"
            />
            <div className="flex gap-1 justify-end">
              <Button size="sm" variant="ghost" className="h-5 px-2" onClick={handleCancel}>
                <X className="h-3 w-3" />
              </Button>
              <Button size="sm" className="h-5 px-2" onClick={handleSave}>
                <Check className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 mb-1">
              <span
                className="text-base leading-none mt-0.5 flex-shrink-0"
                role="img"
                aria-label={nodeData.type}
              >
                {icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-xs text-foreground leading-tight truncate ${nodeData.isPendingRemove ? 'line-through opacity-60' : ''}`}>
                  {nodeData.label}
                </div>
                <div
                  className="text-[9px] font-bold uppercase tracking-wider mt-0.5"
                  style={{ color }}
                >
                  {nodeData.type}
                </div>
              </div>
            </div>

            {nodeData.description && (
              <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2 mt-1 pl-6">
                {nodeData.description}
              </p>
            )}

            {/* Collapsed OPTION chips */}
            {nodeData.optionChips && nodeData.optionChips.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 pl-6">
                {nodeData.optionChips.map(chip => (
                  <button
                    key={chip.id}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium leading-none transition-colors hover:brightness-110 cursor-pointer"
                    style={{
                      backgroundColor: `${NODE_COLORS[chip.nodeType as NodeType] ?? '#6366f1'}22`,
                      color: NODE_COLORS[chip.nodeType as NodeType] ?? '#6366f1',
                      border: `1px solid ${NODE_COLORS[chip.nodeType as NodeType] ?? '#6366f1'}55`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      nodeData.onChipClick?.(chip.id);
                    }}
                    title={`${chip.nodeType}: ${chip.label}`}
                  >
                    <span className="leading-none">{NODE_ICONS[chip.nodeType as NodeType] ?? '◉'}</span>
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Linked sub-agent indicator */}
            {nodeData.linkedAgentId && (
              <button
                className="flex items-center gap-1 mt-1.5 pl-6 text-[10px] text-blue-500 font-medium hover:text-blue-700 hover:underline transition-colors w-full text-left"
                onClick={(e) => { e.stopPropagation(); nodeData.onDrillDown?.(); }}
                title="Open sub-agent graph"
              >
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <span>Open sub-agent</span>
              </button>
            )}
          </>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !border-2 !border-card"
        style={{ background: color }}
      />
    </div>
  );
});

AgentNode.displayName = 'AgentNode';
