'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AgentNode } from './agent-node';
import type { NodeData, Connection as AgentConnection, NodeType } from '@/lib/types';
import { NODE_ICONS } from '@/lib/types';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { ZoomIn, ZoomOut, Maximize2, Search, MessageSquare, Plus, LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { BUILT_IN_PATTERNS, PATTERN_CATEGORIES } from '@/lib/patterns';
import type { PromptPattern } from '@/lib/types';
import { detectCollapsibleOptions } from '@/lib/graph/collapse-options';

interface AgentCanvasProps {
  nodes: NodeData[];
  connections: AgentConnection[];
  onNodesChange: (nodes: NodeData[]) => void;
  onConnectionsChange: (connections: AgentConnection[]) => void;
  selectedNodeId?: string;
  onNodeSelect: (nodeId: string | null) => void;
  onNodeEdit: (nodeId: string, label: string, description?: string) => void;
  onNodeDelete: (nodeId: string) => void;
  conflictNodeIds: Set<string>;
  highlightedNodeId?: string | null;
  edgeType?: 'default' | 'smoothstep' | 'straight';
  nodeConflictSeverity?: Map<string, 'critical' | 'warning' | 'info'>;
  nodeConflictCount?: Map<string, number>;
  onNodeConflictClick?: (nodeId: string) => void;
  onAgentNodeDrillDown?: (linkedAgentId: string) => void;
  onSearchClick?: () => void;
  onEdgeClick?: (edgeId: string) => void;
  onToggleChat?: () => void;
  isChatOpen?: boolean;
  onInsertPattern?: (pattern: PromptPattern, position: { x: number; y: number }, connectToNodeId?: string) => void;
  onOpenPatternBrowser?: (position: { x: number; y: number }, connectToNodeId?: string) => void;
  pendingDiff?: {
    addedIds: Set<string>;
    removedIds: Set<string>;
    updatedIds: Set<string>;
  };
  existingNodeOpacity?: number;
  onOpacityChange?: (value: number) => void;
  onAcceptEdit?: () => void;
  onDeclineEdit?: () => void;
  onAddNode?: (type: any) => void;
  onOpenTemplates?: () => void;
  onCreateTemplate?: () => void;
  isTemplateMode?: boolean;
  selectedForTemplateIds?: Set<string>;
}

// Inner component that uses useReactFlow (must be inside ReactFlowProvider)
function AgentCanvasInner({
  nodes: agentNodes,
  connections: agentConnections,
  onNodesChange,
  onConnectionsChange,
  selectedNodeId,
  onNodeSelect,
  onNodeEdit,
  onNodeDelete,
  conflictNodeIds,
  highlightedNodeId,
  edgeType = 'smoothstep',
  nodeConflictSeverity,
  nodeConflictCount,
  onNodeConflictClick,
  onAgentNodeDrillDown,
  onSearchClick,
  onEdgeClick: onEdgeClickProp,
  onInsertPattern,
  onOpenPatternBrowser,
  onToggleChat,
  isChatOpen,
  pendingDiff,
  existingNodeOpacity = 1,
  onOpacityChange,
  onAcceptEdit,
  onDeclineEdit,
  onAddNode,
  onOpenTemplates,
  onCreateTemplate,
  isTemplateMode,
  selectedForTemplateIds,
}: AgentCanvasProps) {
  const nodeTypes = useMemo(() => ({ agentNode: AgentNode }), []);
  const { zoomIn, zoomOut, fitView, screenToFlowPosition, getNode, setCenter } = useReactFlow();

  // Auto-pan to highlighted node
  useEffect(() => {
    if (!highlightedNodeId) return;
    // Use rAF to ensure React Flow's internal store has synced the node
    requestAnimationFrame(() => {
      const rfNode = getNode(highlightedNodeId);
      if (!rfNode) return;
      // Use positionAbsolute for nodes inside groups, fall back to position
      const pos = (rfNode as any).internals?.positionAbsolute ?? rfNode.position;
      const x = pos.x + (rfNode.measured?.width ?? 160) / 2;
      const y = pos.y + (rfNode.measured?.height ?? 60) / 2;
      setCenter(x, y, { duration: 400, zoom: 1.2 });
    });
  }, [highlightedNodeId, getNode, setCenter]);

  const [contextMenu, setContextMenu] = useState<{
    canvasPos: { x: number; y: number };
    nodeId?: string;
  } | null>(null);

  // Detect OPTION nodes that can be collapsed into their parent as chips
  const collapseResult = useMemo(
    () => detectCollapsibleOptions(agentNodes, agentConnections),
    [agentNodes, agentConnections]
  );

  const flowNodes: Node[] = useMemo(() => {
    // Collect GROUP node IDs for parentId wiring
    const groupIds = new Set(agentNodes.filter(n => n.type === 'GROUP').map(n => n.id));

    const regular: Node[] = agentNodes.filter(node => !collapseResult.hiddenNodeIds.has(node.id)).map(node => {
      const isPendingAdd = pendingDiff?.addedIds.has(node.id) ?? false;
      const isPendingRemove = pendingDiff?.removedIds.has(node.id) ?? false;
      const isPendingUpdate = pendingDiff?.updatedIds.has(node.id) ?? false;

      const nodeOpacity = pendingDiff
        ? (isPendingAdd || isPendingUpdate ? 1 : existingNodeOpacity)
        : 1;

      const isGroup = node.type === 'GROUP';
      const parentGroup = (node.config as any)?.parentGroup;

      return {
        id: node.id,
        type: isGroup ? 'group' : 'agentNode',
        position: node.position,
        style: isGroup
          ? {
            width: (node.config as any)?.groupWidth ?? 280,
            height: (node.config as any)?.groupHeight ?? 200,
            backgroundColor: 'transparent',
            border: 'none',
          }
          : { opacity: nodeOpacity, transition: 'opacity 0.2s ease' },
        data: {
          label: node.label,
          type: node.type,
          description: node.description,
          hasConflict: conflictNodeIds.has(node.id),
          isDangerous: node.isDangerous,
          isHighlighted: node.id === highlightedNodeId,
          conflictSeverity: nodeConflictSeverity?.get(node.id),
          conflictCount: nodeConflictCount?.get(node.id),
          onEdit: (label: string, description?: string) => onNodeEdit(node.id, label, description),
          onDelete: () => onNodeDelete(node.id),
          onConflictClick: onNodeConflictClick ? () => onNodeConflictClick(node.id) : undefined,
          linkedAgentId: node.type === 'AGENT' ? (node.config?.linkedAgentId as string) : undefined,
          onDrillDown: node.type === 'AGENT' && node.config?.linkedAgentId && onAgentNodeDrillDown
            ? () => onAgentNodeDrillDown(node.config.linkedAgentId as string)
            : undefined,
          isGeneratedByEdit: !!(node.config as Record<string, unknown>)?._generatedByEdit,
          isModifiedByEdit: !!(node.config as Record<string, unknown>)?._modifiedByEdit,
          isPendingAdd,
          isPendingRemove,
          isPendingUpdate,
          isTemplateSelected: selectedForTemplateIds?.has(node.id) ?? false,
          optionChips: collapseResult.chipsByParent.get(node.id),
          onChipClick: collapseResult.chipsByParent.has(node.id)
            ? (chipNodeId: string) => onNodeSelect(chipNodeId)
            : undefined,
        },
        selected: node.id === selectedNodeId,
        // Wire child nodes into their GROUP container
        ...(parentGroup && groupIds.has(parentGroup) ? { parentId: parentGroup, extent: 'parent' as const } : {}),
      };
    });

    return regular;
  }, [agentNodes, selectedNodeId, conflictNodeIds, highlightedNodeId, nodeConflictSeverity, nodeConflictCount, onNodeConflictClick, onNodeEdit, onNodeDelete, onAgentNodeDrillDown, collapseResult, onNodeSelect, pendingDiff, existingNodeOpacity]);

  // ── Edge palette — colors encode the SEMANTIC ROLE of the edge ───────────
  // Detected from BOTH endpoints: annotation edges touch at least one non-flow node.
  const FLOW_COLOR    = '#818cf8';  // indigo-400  — main execution path (bold, solid)
  const AGENT_COLOR   = '#6366f1';  // indigo-500  — inter-agent delegation
  const RULE_COLOR    = '#4ade80';  // green-400   — RULE forward-annotation (dashed)
  const PERSONA_COLOR = '#93c5fd';  // blue-300    — PERSONA / INPUT context (dashed)
  const GUARD_COLOR   = '#f87171';  // red-400     — GUARD constraint (dashed)
  const TOOL_COLOR    = '#fbbf24';  // amber-400   — TOOL / CONFIG / REFERENCE (dashed)
  const LOGGING_COLOR = '#c084fc';  // purple-400  — LOGGING edges (dotted)

  // Node lookup for edge role detection
  const nodeMap = useMemo(
    () => new Map(agentNodes.map(n => [n.id, n])),
    [agentNodes]
  );

  const flowEdges: Edge[] = useMemo(
    () => {
      const realEdges = agentConnections
        .filter(conn => !collapseResult.hiddenEdgeIds.has(conn.id))
        .map((conn, index) => {
          const sourceNode = nodeMap.get(conn.source);
          const targetNode = nodeMap.get(conn.target);
          const srcType = sourceNode?.type ?? '';
          const tgtType = targetNode?.type ?? '';

          // Classify by BOTH endpoints — annotation edges touch at least one non-flow node.
          // This correctly colors START→RULE, RULE→FLOW, GUARD→FLOW, PERSONA→FLOW etc.
          const isAgentEdge      = srcType === 'AGENT' || tgtType === 'AGENT';
          const isGuardEdge      = !isAgentEdge && (srcType === 'GUARD'  || tgtType === 'GUARD');
          const isRuleEdge       = !isAgentEdge && !isGuardEdge && (srcType === 'RULE' || tgtType === 'RULE');
          const isPersonaOrInput = !isAgentEdge && !isGuardEdge && !isRuleEdge &&
            (srcType === 'PERSONA' || tgtType === 'PERSONA' || srcType === 'INPUT' || tgtType === 'INPUT');
          // LOGGING is a flow node (part of execution path), not annotation — its edges are solid
          const isConfigAnnotation = !isAgentEdge && !isGuardEdge && !isRuleEdge && !isPersonaOrInput &&
            (['CONFIG', 'MEMORY', 'REFERENCE', 'TRIGGER'].includes(srcType) ||
             ['CONFIG', 'MEMORY', 'REFERENCE', 'TRIGGER'].includes(tgtType));
          // TOOL is a flow node (execution path), not metadata — its edges are solid
          const isToolFlowEdge   = !isAgentEdge && !isGuardEdge && !isRuleEdge && !isPersonaOrInput && !isConfigAnnotation &&
            (srcType === 'TOOL' || tgtType === 'TOOL');

          const isAnnotationWire = isGuardEdge || isRuleEdge || isPersonaOrInput || isConfigAnnotation;

          // V9 edge-kind overrides (pii-flow / untrusted-data) take precedence.
          const v9Kind = (conn as any).kind as string | undefined;
          const isPiiFlow = v9Kind === 'pii-flow';
          const isUntrustedData = v9Kind === 'untrusted-data';

          const color = isPiiFlow          ? '#dc2626'
            : isUntrustedData    ? '#f59e0b'
            : isAgentEdge        ? AGENT_COLOR
            : isGuardEdge        ? GUARD_COLOR
            : isRuleEdge         ? RULE_COLOR
            : isPersonaOrInput   ? PERSONA_COLOR
            : isConfigAnnotation ? TOOL_COLOR
            : isToolFlowEdge     ? TOOL_COLOR
            : FLOW_COLOR;

          const HIDE_LABEL_CONDS = new Set([
            'Next', 'next', 'Sequential', 'sequential',
            'Applies to Agent', 'Defines Role', 'Defines Agent Role',
            'Response Style', 'Constrains', 'Governs',
          ]);
          const showLabel = !isAnnotationWire &&
            !!conn.condition && !HIDE_LABEL_CONDS.has(conn.condition.trim());

          return {
            id: conn.id || `edge-${index}`,
            source: conn.source,
            target: conn.target,
            type: edgeType,
            animated: false,
            style: {
              stroke: color,
              strokeWidth: isPiiFlow ? 3 : isAnnotationWire ? 1.5 : 2.5,
              strokeDasharray: isUntrustedData ? '6 3' : isAnnotationWire ? '5 4' : undefined,
              opacity: isAnnotationWire ? 0.75 : 1,
            },
            label: isAgentEdge
              ? (conn.condition || (tgtType === 'AGENT' ? 'Call' : 'Return'))
              : showLabel ? conn.condition : undefined,
            labelStyle: { fill: '#6b7280', fontSize: 10 },
            labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, borderRadius: 4 },
            markerEnd: {
              type: 'arrowclosed' as const,
              color,
              width: isAnnotationWire ? 14 : 18,
              height: isAnnotationWire ? 14 : 18,
            },
          };
        })
        .filter(Boolean) as Edge[];

      // Add synthetic bypass edges for collapsed option groups
      const synthEdges: Edge[] = collapseResult.syntheticEdges.map(synth => ({
        id: synth.id,
        source: synth.source,
        target: synth.target,
        type: edgeType,
        animated: false,
        style: { stroke: FLOW_COLOR, strokeWidth: 2, strokeDasharray: '4 3' },
        markerEnd: { type: 'arrowclosed' as const, color: FLOW_COLOR, width: 18, height: 18 },
      }));

      return [...realEdges, ...synthEdges];
    },
    [agentConnections, edgeType, nodeMap, collapseResult]
  );

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(flowEdges);

  // Sync nodes/edges from external state changes
  useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      toast.info('Graph modification is only supported by AI');
    },
    []
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      const updatedNodes = agentNodes.map(n =>
        n.id === node.id ? { ...n, position: node.position } : n
      );
      onNodesChange(updatedNodes);
    },
    [agentNodes, onNodesChange]
  );

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      onNodeSelect(node.id);
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const onEdgeClick = useCallback(
    (_: any, edge: Edge) => {
      onEdgeClickProp?.(edge.id);
    },
    [onEdgeClickProp]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const canvasPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({ canvasPos, nodeId: node.id });
    },
    [screenToFlowPosition]
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const e = event as React.MouseEvent;
      const canvasPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setContextMenu({ canvasPos });
    },
    [screenToFlowPosition]
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="w-full h-full bg-background">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChangeInternal}
            onEdgesChange={onEdgesChangeInternal}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onEdgeClick={onEdgeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1}
            maxZoom={2}
            attributionPosition="bottom-left"
            proOptions={{ hideAttribution: true }}
            style={{ backgroundColor: 'var(--background)' }}
            defaultEdgeOptions={{
              type: edgeType,
              style: { stroke: FLOW_COLOR, strokeWidth: 2 },
              markerEnd: { type: 'arrowclosed' as const, color: FLOW_COLOR },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--border)"
            />
            <Controls
              showZoom={false}
              showFitView={false}
              showInteractive={false}
              className="!bg-card !border-border !rounded-lg !shadow-md"
            />
            <Panel position="top-left" className="flex gap-2">
              <Button
                variant="secondary"
                className="bg-muted text-muted-foreground border-border shadow-sm opacity-60 cursor-not-allowed h-9 px-4 font-semibold flex items-center gap-2"
                onClick={() => toast.info('Graph modification is only supported by AI')}
                title="Graph modification is only supported by AI"
              >
                <Plus className="h-4 w-4" />
                Add Node
              </Button>

              {onOpenTemplates && (
                <Button
                  variant="secondary"
                  className="bg-card/90 border border-border shadow-sm hover:bg-accent h-9 px-4 font-semibold flex items-center gap-2"
                  onClick={onOpenTemplates}
                  title="Browse templates"
                >
                  <LayoutTemplate className="h-4 w-4" />
                  Templates
                </Button>
              )}

              {onCreateTemplate && (
                <Button
                  variant="secondary"
                  className={`h-9 px-4 font-semibold flex items-center gap-2 shadow-sm transition-all ${
                    isTemplateMode
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500'
                      : 'bg-card/90 border border-border hover:bg-accent'
                  }`}
                  onClick={onCreateTemplate}
                  title={isTemplateMode ? 'Exit template creation mode' : 'Create a reusable template'}
                >
                  <LayoutTemplate className="h-4 w-4" />
                  {isTemplateMode ? 'Exit Template Mode' : 'Create Template'}
                </Button>
              )}

              {onToggleChat && (
                <Button
                  size="icon"
                  variant="secondary"
                  className={`h-9 w-9 border shadow-xl hover:scale-105 transition-all ${isChatOpen
                    ? 'bg-primary text-primary-foreground border-primary/50 hover:bg-primary/90'
                    : 'bg-orange-500 text-white border-orange-400/50 hover:bg-orange-600'}`}
                  onClick={onToggleChat}
                  title="AI assistant — edit with natural language"
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
            </Panel>
            <MiniMap
              className="!bg-card !border-2 !border-border !rounded-lg !shadow-md"
              maskColor="rgba(0,0,0,0.3)"
              nodeColor={(node) => {
                const nodeData = agentNodes.find(n => n.id === node.id);
                if (!nodeData) return '#9ca3af';
                const colorMap: Record<string, string> = {
                  AGENT: '#f97316',
                  RULE: '#22c55e',
                  TASK: '#3b82f6',
                  HANDOFF: '#a855f7',
                  TOOL: '#eab308',
                  MEMORY: '#3b82f6',
                  GUARD: '#ef4444',
                  TRIGGER: '#22c55e',
                  CONDITION: '#f59e0b',
                  RESOLUTION: '#8b5cf6',
                  START: '#22c55e',
                  PERSONA: '#3b82f6',
                  CONFIG: '#9ca3af',
                  DECISION: '#f59e0b',
                  OPTION: '#f97316',
                  STEP: '#06b6d4',
                  REFERENCE: '#8b5cf6',
                  ACTION: '#ec4899',
                  END: '#ef4444',
                };
                return colorMap[nodeData.type] || '#6366f1';
              }}
            />
            <Panel position="top-right" className="flex gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="bg-card/90 border border-border shadow-sm hover:bg-accent"
                onClick={() => zoomIn({ duration: 300 })}
                title="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="bg-card/90 border border-border shadow-sm hover:bg-accent"
                onClick={() => zoomOut({ duration: 300 })}
                title="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="bg-card/90 border border-border shadow-sm hover:bg-accent"
                onClick={() => fitView({ duration: 400, padding: 0.15 })}
                title="Fit to view"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              {onSearchClick && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="bg-card/90 border border-border shadow-sm hover:bg-accent"
                  onClick={onSearchClick}
                  title="Find node (Ctrl+F)"
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
            </Panel>

            {/* Pending edit review toolbar */}
            {onAcceptEdit && onDeclineEdit && (
              <Panel position="bottom-center" className="mb-4">
                <div className="flex flex-col items-center gap-2 bg-card/95 backdrop-blur border border-border rounded-xl shadow-xl px-5 py-3 min-w-[280px]">
                  <div className="w-full space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>👻 Ghost</span>
                      <span>Existing graph opacity</span>
                      <span>Full</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(existingNodeOpacity * 100)}
                      onChange={e => onOpacityChange?.(Number(e.target.value) / 100)}
                      className="w-full accent-primary"
                    />
                    <div className="text-center text-[10px] text-muted-foreground">
                      {Math.round(existingNodeOpacity * 100)}%
                    </div>
                  </div>
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={onAcceptEdit}
                      className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors shadow-sm"
                    >
                      ✓ Accept
                    </button>
                    <button
                      onClick={onDeclineEdit}
                      className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
                    >
                      ✗ Decline
                    </button>
                  </div>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        <ContextMenuSub>
          <ContextMenuSubTrigger className="opacity-60">
            <span className="mr-2">🧩</span> Insert Pattern
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            <ContextMenuItem onClick={() => toast.info('Graph modification is only supported by AI')}>
              Manual insertion disabled
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="opacity-60"
          onClick={() => toast.info('Graph modification is only supported by AI')}
        >
          📚 Browse All Patterns...
        </ContextMenuItem>
        <ContextMenuSeparator />
      </ContextMenuContent>
    </ContextMenu >
  );
}

// Exported wrapper that provides the ReactFlowProvider context
export function AgentCanvas(props: AgentCanvasProps) {
  return (
    <ReactFlowProvider>
      <AgentCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
