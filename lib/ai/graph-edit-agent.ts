import { GoogleGenAI } from '@google/genai';
import type { AgentConfig, NodeData, NodeType, Connection } from '../types';
import { DEFAULT_GEMINI_MODEL } from '../types';
import { applyAutoLayout } from '../graph/auto-layout';
import { validateAgentConfig } from '../validation';
import { getGraphRuleSettings } from '../storage/storage';
import { DAG_RULES_FOR_EDITING } from '../dag-prompt-rules';
import yaml from 'js-yaml';

// ── Types ──────────────────────────────────────────────────────────────────

export interface NewNodeSpec {
  /** Temporary ID used only within this diff (e.g. "new_1"). Replaced with stable IDs in applyGraphEdits. */
  tempId: string;
  type: NodeType;
  label: string;
  description?: string;
  config: {
    pfgType?: string;
    logicSnippet?: string;
    column?: 'left' | 'center' | 'right';
    ruleScope?: 'global' | 'scoped' | null;
    appliesTo?: string[] | 'all' | null;
    personaScope?: 'agent' | 'response' | null;
    inputRequired?: boolean | null;
    branchGroup?: string | null;
    sourceSection?: string;
    order?: number;
    outcome?: string;
    [key: string]: unknown;
  };
}

export interface NewConnectionSpec {
  /** Temporary ID for this connection (e.g. "ec_1"). */
  tempId: string;
  /** May be an existing node ID or a tempId from newNodes. */
  source: string;
  /** May be an existing node ID or a tempId from newNodes. */
  target: string;
  condition?: string;
}

export interface GraphEditResult {
  /** One-sentence summary of what was changed. */
  summary: string;
  newNodes: NewNodeSpec[];
  newConnections: NewConnectionSpec[];
  removedNodeIds: string[];
  removedConnectionIds: string[];
  updatedNodes: { id: string; label?: string; description?: string; config?: Record<string, unknown> }[];
  updatedConnections: { id: string; condition?: string; source?: string; target?: string }[];
  promptUpdates: {
    strategy: 'append' | 'replace' | 'insert_after' | 'prepend' | 'none';
    targetSection?: string;
    anchorText?: string;
    insertText: string;
  }[];
}

// ── System Prompt ──────────────────────────────────────────────────────────

export const GRAPH_EDIT_SYSTEM_PROMPT = `## Graph Edit Agent

### CRITICAL OUTPUT RULES — READ THESE FIRST

1. Output ONLY a single raw JSON object. Nothing before the {. Nothing after the }.
2. Your first character MUST be {. Your last character MUST be }.
3. NEVER use markdown code fences, preamble, or explanatory text.
4. NEVER write "Here is the JSON:", "Sure!", or any sentence before the {.
5. Think through the entire edit plan internally first. When you begin writing, write the complete valid JSON in one uninterrupted pass.

---

### Role

You are a graph edit agent for a visual AI workflow builder. You receive:
1. The current agent graph as a JSON object (nodes + connections + originalPrompt)
2. A natural language edit request from the user

You produce a JSON diff describing exactly what to add, remove, or update in the graph AND the corresponding update to the originalPrompt text.

---

### Understanding the Graph Structure

AgentConfig shape (simplified — positions are stripped, auto-layout recalculates them):
\`\`\`json
{
  "id": "agent-...",
  "name": "...",
  "originalPrompt": "Full prompt text...",
  "nodes": [
    {
      "id": "n5-1234",
      "type": "DECISION",
      "label": "Short label",
      "description": "...",
      "config": {
        "pfgType": "decision",
        "logicSnippet": "verbatim text from the source prompt",
        "column": "center",
        "ruleScope": null,
        "order": 3
      }
    }
  ],
  "connections": [
    {
      "id": "conn-0",
      "source": "n5-1234",
      "target": "n6-1234",
      "condition": "Over 90 days"
    }
  ]
}
\`\`\`

Valid NodeType values:
START, END, DECISION, ACTION, RULE, STEP, RESOLUTION, HANDOFF, TOOL, CONFIG,
PERSONA, INPUT, MEMORY, TASK, AGENT, REFERENCE, TRIGGER, CONDITION, OPTION,
GUARD, LOGGING

Column assignment rules (REQUIRED — always set column on new nodes):
- "left":   INPUT, PERSONA (personaScope "agent")
- "right":  RULE, TOOL, CONFIG, MEMORY, REFERENCE, TRIGGER, GUARD
- "center": everything else (START, END, DECISION, ACTION, STEP, RESOLUTION, HANDOFF, TASK, OPTION, CONDITION, LOGGING, AGENT, PERSONA with personaScope "response")

---

### Step 1: Analyze the Current Graph

Before planning any edits:

1. Read ALL node IDs, types, labels, descriptions, and logicSnippets.
2. Read ALL connections (source → target, condition).
3. Find the "anchor" node — the node whose label or logicSnippet most closely matches the target of the user's edit request. Use fuzzy semantic matching.
4. Find the max numeric portion in existing node IDs (e.g., if nodes are n1-1234, n2-1234...n66-1234, then the next new node starts at n67-1234). You MUST use tempIds in your output (e.g., "new_1", "new_2").
5. Identify which connections currently run through or around the anchor point (for rewiring).

---

### Step 2: Plan the Edit

#### A. Adding center-column nodes (DECISION, ACTION, STEP, RESOLUTION, HANDOFF, etc.)

When inserting a new node between existing nodes A→B:
1. Add new node with tempId "new_1", "new_2", etc.
2. Add connection: A → new_1 (with the appropriate branch condition if A is a DECISION)
3. Add connection: new_1 → B (or to the final destination if B isn't right)
4. Remove the original A→B connection: add its ID to removedConnectionIds

When adding a new terminal branch (new outcome that doesn't continue to existing nodes):
1. Add new nodes (DECISION → RESOLUTION/HANDOFF/END pattern)
2. Add a new outgoing connection from the relevant DECISION node
3. Do NOT remove any existing connections (just add a new branch)

#### B. Adding right-column nodes (RULE, TOOL, CONFIG, MEMORY)

Right-column nodes NEVER go in the center flow. Instead:
- RULE nodes: add edge FROM rule TO the center node it governs, condition "Governs"
- TOOL nodes: add edge FROM tool TO the decision that uses its result, condition "Provides result"
- CONFIG nodes: add edge FROM config TO the relevant center node, condition "Configures"

Do NOT create edges from center nodes to right-column nodes.

#### C. DECISION node requirements

Every DECISION node MUST have:
- At least 2 outgoing connections
- Each outgoing edge MUST have a descriptive condition label (e.g., "Order over 90 days", NOT "Yes")

When adding a new branch to an existing DECISION:
- Add only the new outgoing edge; do not touch existing edges from that DECISION

#### D. Removing nodes

1. Add node ID to removedNodeIds
2. Add ALL connection IDs where source=nodeId OR target=nodeId to removedConnectionIds
3. If the node was in a chain A→node→B, add a new A→B connection to restore flow
4. Exception: do not auto-rewire START or END nodes

#### E. Modifying nodes

Use updatedNodes with the specific fields that changed. Never change a node's ID.

#### F. Adding a new Sub-Agent

When the user says "add agent for XY", "create a sub-agent for XY", or "add a new specialist agent":
1. Add a new AGENT node (center column) with label "XY Agent" and config: { agentRole: "XY", linkedAgentId: "pending" }.
2. Add an edge FROM the relevant DECISION node TO the AGENT node, condition "Routes to XY".
3. IMPORTANT: AGENT nodes are NOT tools. They represent autonomous AI sub-agents with their own graphs. Edges flow INTO them (coordinator → sub-agent), not FROM them.
4. In the summary, note: "Added new sub-agent node: XY Agent (sub-agent graph creation pending)".
5. In promptUpdate, add a line describing the routing to the new agent.

---

### Step 3: logicSnippet Rules

The originalPrompt is the canonical text source. Graph changes MUST be reflected — but with MINIMAL, SURGICAL edits: 1 to 3 lines per update.

The system will automatically determine WHERE to insert new text in the document based on the graph edges and order values you provide. You do NOT need to specify any placement fields.

**CRITICAL RULE: logicSnippet MUST be 1-3 lines maximum. Never rewrite, never summarize, never add a section you weren't asked for.**

logicSnippet Rules (for new and updated nodes):
- MAXIMUM 3 lines. This is a SURGICAL edit to an instruction manual, not a rewrite.
- MUST be a full, coherent English sentence written as an instruction to an AI agent. 
- NEVER output just a raw unconnected node label (e.g., do NOT output just "Service Account Branch" or "90-180 Days?"). It MUST be translated into a complete rule (e.g., "- IF user asked for Service Account, route to Service Account Branch.").
- NEVER output a "changelog" of what you just did. No "Added nodes: X". You are modifying the agent's core instruction manual.
- Match the EXACT style of the targeted section (same bullet prefix, same tone).
- NEVER summarize or paraphrase existing content. Only add/replace the exact content needed.

---

### Step 4: Output Schema

Output EXACTLY this JSON shape — raw JSON, nothing else:

{
  "summary": "One sentence: what was added/removed/changed (under 15 words)",
  "newNodes": [
    {
      "tempId": "new_1",
      "type": "RULE",
      "label": "Node Label",
      "description": "Brief description",
      "config": {
        "pfgType": "rule",
        "logicSnippet": "MUST be a full, coherent English sentence detailing the rule/action. Do not use short labels.",
        "column": "right",
        "ruleScope": "scoped",
        "order": 20.5
      }
    }
  ],
  "newConnections": [
    {
      "tempId": "ec_1",
      "source": "new_1",
      "target": "n5-1234",
      "condition": "Governs"
    }
  ],
  "removedNodeIds": [],
  "removedConnectionIds": [],
  "updatedNodes": [
    {
      "id": "node-2",
      "label": "New Label",
      "description": "Updated desc",
      "config": {
        "logicSnippet": "MUST be updated to a full coherent English sentence reflecting the new logic/rule."
      }
    }
  ],
  "updatedConnections": []
}

---

### Quality Checklist (verify internally before writing output)

- Every new center-column node has at least one incoming AND one outgoing connection (unless it is a new END/RESOLUTION that terminates a branch)
- Every new RULE/TOOL/CONFIG node has exactly one outgoing edge pointing to a center-column node
- DECISION nodes have 2+ outgoing edges, each with a descriptive condition label
- tempIds are unique within newNodes and referenced correctly in newConnections
- removedConnectionIds includes ALL connection IDs where source or target is in removedNodeIds
- If inserting between A→B: the original A→B connection ID is in removedConnectionIds
- newNodes MUST have a "logicSnippet" config that is a complete, descriptive sentence, NOT a short label.
- newNodes MUST have an "order" config value slightly higher than their source node (e.g. source order is 2, new node order is 2.1). This correctly places them in the document structure.
- updatedNodes MUST include a "config": { "logicSnippet": "..." } with a full revised sentence if the rule or logic changed.
- summary is under 15 words and accurately describes the change
- Output is valid JSON starting with { and ending with }
`;

// ── Compact System Prompt (JSON Compact format) ───────────────────────────

export const GRAPH_EDIT_COMPACT_PROMPT = `## Graph Edit Agent (Compact Mode)

### CRITICAL OUTPUT RULES

1. Output ONLY a single raw JSON object. Nothing before {. Nothing after }.
2. Use COMPACT KEYS as defined below. Do NOT use full field names.
3. Nodes use TUPLES (arrays), not objects.
4. NEVER use markdown code fences, preamble, or explanatory text.

---

### Role

You are a graph edit agent. You receive:
1. Current agent graph (compact tuples)
2. Natural language edit request

You produce a compact JSON diff.

---

### Input Graph Format

Nodes: tuples [id, type, label, logic_snippet, column]
- type codes: a=action, d=decision, s=step, r=resolution, t=tool, i=input, ag=agent, st=start, e=end, h=handoff, c=condition, p=persona, ru=rule, cf=config, g=guard, m=memory, ref=reference, tr=trigger, lg=logging, o=option, ta=task
- column: l=left, c=center, r=right

Connections: tuples [id, source, target, condition]

---

### Compact Output Schema

Output EXACTLY this shape:
{
  "s": "summary (under 15 words)",
  "nn": [["new_1","ru","Label","Description",{"ls":"Full, descriptive English sentence.","col":"r","rs":"scoped","o":20.5}]],
  "nc": [["ec_1","new_1","n5","Governs"]],
  "rn": [],
  "rc": [],
  "un": [{"id":"n5","l":"New Label","d":"New desc","cfg":{"ls":"Updated full coherent English sentence."}}],
  "uc": [{"id":"conn-0","c":"New condition"}]
}

### Key mapping:
- s = summary
- nn = newNodes — tuples: [tempId, typeCode, label, description, configObj]
  - configObj keys: ls=logicSnippet, col=column(l/c/r), rs=ruleScope, ap=appliesTo, ps=personaScope, ir=inputRequired, bg=branchGroup, ss=sourceSection, o=order, oc=outcome
- nc = newConnections — tuples: [tempId, source, target, condition?]
- rn = removedNodeIds
- rc = removedConnectionIds
- un = updatedNodes — [{id, l?=label, d?=description, cfg?=config}]
- uc = updatedConnections — [{id, c?=condition, s?=source, tg?=target}]

### Type codes for nn:
a=ACTION, d=DECISION, s=STEP, r=RESOLUTION, t=TOOL, i=INPUT, ag=AGENT, st=START, e=END, h=HANDOFF, c=CONDITION, p=PERSONA, ru=RULE, cf=CONFIG, g=GUARD, m=MEMORY, ref=REFERENCE, tr=TRIGGER, lg=LOGGING, o=OPTION, ta=TASK

### Column assignments (REQUIRED on new nodes):
- "l": INPUT, PERSONA (agent scope)
- "r": RULE, TOOL, CONFIG, MEMORY, REFERENCE, TRIGGER, GUARD
- "c": everything else (AGENT is center — sub-agents are flow nodes, not annotation nodes)

### Edit rules:
- When inserting between A→B: remove original A→B (add to rc), add A→new, new→B
- DECISION nodes need 2+ outgoing edges with descriptive conditions
- Right-column nodes: edge FROM rule/tool TO center node (not reverse)
- nn 'o' (order) MUST be assigned relative to neighbors (e.g. if attaching to node with order 5, set this to 5.1). Do not omit 'o'.
- un 'cfg.ls' MUST be provided with a full descriptive English sentence when an existing node's rule/logic changes.

### logicSnippet (ls) formatting:
- ls MUST be a coherent instruction, NEVER a raw label like "Service Account Branch".
- ls MUST match the EXACT formatting style of the section where it will be placed.
- When adding a new type/section that parallels existing ones, use multi-line ls with \n to include a section header and separator. For example if existing sections use "---\nINCIDENT\n---\nRequire:\n- field1\n- field2" then your new section must follow the same pattern.
- When a new type is added, also update any existing list nodes (e.g. SUPPORTED ISSUE TYPES) by including them in un with an updated ls that adds the new entry.
- ls can be multi-line (use \n). Match neighbor formatting exactly.

### Quality Checklist:
- Center nodes have incoming AND outgoing connections
- tempIds referenced correctly in nc
- rc includes ALL connection IDs touching removed nodes
- Output starts with { ends with }
`;

// ── YAML System Prompt Addendum ───────────────────────────────────────────

const YAML_OUTPUT_ADDENDUM = `

### OUTPUT FORMAT: YAML

Instead of JSON, output your response as YAML. Use the exact same field names as the JSON schema (summary, newNodes, newConnections, removedNodeIds, removedConnectionIds, updatedNodes, updatedConnections, promptUpdate).

Example:
\`\`\`
summary: Added retry logic around Search Tool
newNodes:
  - tempId: new_1
    type: CONDITION
    label: Retry Check
    description: Check retry counter
    config:
      pfgType: condition
      logicSnippet: Check if retries < 3
      column: center
      insertNodeId: node-4
      insertPosition: after
newConnections:
  - tempId: ec_1
    source: new_1
    target: n5
    condition: Retry
removedNodeIds: []
removedConnectionIds: []
updatedNodes: []
updatedConnections: []
\`\`\`

Output ONLY the YAML. No markdown fences, no preamble.
`;

// ── Compact Edit Result Decoder ───────────────────────────────────────────

const COMPACT_TYPE_ENUM: Record<string, string> = {
  a: 'ACTION', d: 'DECISION', s: 'STEP', r: 'RESOLUTION', t: 'TOOL',
  i: 'INPUT', ag: 'AGENT', st: 'START', e: 'END', h: 'HANDOFF',
  c: 'CONDITION', p: 'PERSONA', ru: 'RULE', cf: 'CONFIG', g: 'GUARD',
  m: 'MEMORY', ref: 'REFERENCE', tr: 'TRIGGER', lg: 'LOGGING', o: 'OPTION',
  ta: 'TASK', k: 'STEP',
};

const COMPACT_COL_ENUM: Record<string, string> = { l: 'left', c: 'center', r: 'right' };

export function expandCompactEditResult(raw: any): GraphEditResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid compact edit result: not an object');
  }

  // Expand newNodes tuples
  const newNodes: NewNodeSpec[] = (raw.nn ?? []).map((n: any) => {
    if (Array.isArray(n)) {
      // Tuple: [tempId, typeCode, label, description, configObj?]
      const typeCode = String(n[1] ?? 'a');
      const cfg = n[4] ?? {};
      return {
        tempId: String(n[0]),
        type: (COMPACT_TYPE_ENUM[typeCode] ?? typeCode.toUpperCase()) as NodeType,
        label: String(n[2] ?? ''),
        description: String(n[3] ?? ''),
        config: {
          pfgType: (COMPACT_TYPE_ENUM[typeCode] ?? typeCode).toLowerCase(),
          logicSnippet: cfg.ls ?? cfg.logicSnippet ?? String(n[2] ?? ''),
          column: COMPACT_COL_ENUM[cfg.col] ?? cfg.col ?? cfg.column ?? 'center',
          insertNodeId: cfg.in ?? cfg.insertNodeId,
          insertPosition: cfg.ip ?? cfg.insertPosition,
          ruleScope: cfg.rs ?? cfg.ruleScope ?? null,
          appliesTo: cfg.ap ?? cfg.appliesTo ?? null,
          personaScope: cfg.ps ?? cfg.personaScope ?? null,
          inputRequired: cfg.ir ?? cfg.inputRequired ?? null,
          branchGroup: cfg.bg ?? cfg.branchGroup ?? null,
          sourceSection: cfg.ss ?? cfg.sourceSection ?? '',
          order: cfg.o ?? cfg.order ?? 0,
          outcome: cfg.oc ?? cfg.outcome ?? undefined,
          // Preserve AGENT-specific fields
          ...(typeCode === 'ag' && {
            linkedAgentId: cfg.lid ?? cfg.linkedAgentId ?? 'pending',
            agentRole: cfg.ar ?? cfg.agentRole ?? String(n[2] ?? '').replace(/\s*Agent$/i, ''),
          }),
        },
      };
    }
    // Already an object — pass through
    return n as NewNodeSpec;
  });

  // Expand newConnections tuples
  const newConnections: NewConnectionSpec[] = (raw.nc ?? []).map((c: any) => {
    if (Array.isArray(c)) {
      // Tuple: [tempId, source, target, condition?]
      return {
        tempId: String(c[0]),
        source: String(c[1]),
        target: String(c[2]),
        condition: c[3] ? String(c[3]) : undefined,
      };
    }
    return c as NewConnectionSpec;
  });

  // Expand updatedNodes
  const updatedNodes = (raw.un ?? []).map((u: any) => {
    const cfg = u.cfg ?? u.config ?? {};
    const expandedCfg: any = { ...cfg };
    if (cfg.ls !== undefined) expandedCfg.logicSnippet = cfg.ls;
    return {
      id: u.id,
      label: u.l ?? u.label,
      description: u.d ?? u.description,
      config: expandedCfg,
    };
  });

  // Expand updatedConnections
  const updatedConnections = (raw.uc ?? []).map((u: any) => ({
    id: u.id,
    condition: u.c ?? u.condition,
    source: u.s ?? u.source,
    target: u.tg ?? u.target,
  }));

  return {
    summary: raw.s ?? raw.summary ?? 'Graph updated',
    newNodes,
    newConnections,
    removedNodeIds: (raw.rn ?? raw.removedNodeIds ?? []).map(String),
    removedConnectionIds: (raw.rc ?? raw.removedConnectionIds ?? []).map(String),
    updatedNodes,
    updatedConnections,
    promptUpdates: [],
  };
}

// ── Compact Input Serializer ──────────────────────────────────────────────

const REVERSE_TYPE_ENUM: Record<string, string> = Object.fromEntries(
  Object.entries(COMPACT_TYPE_ENUM).map(([k, v]) => [v, k])
);
const REVERSE_COL_ENUM: Record<string, string> = { left: 'l', center: 'c', right: 'r' };

export function serializeGraphCompact(agent: AgentConfig): string {
  const nodes = agent.nodes.map(n => {
    const cfg = n.config as Record<string, unknown> | undefined;
    const typeCode = REVERSE_TYPE_ENUM[n.type] ?? n.type.toLowerCase();
    const col = REVERSE_COL_ENUM[(cfg?.column as string) ?? 'center'] ?? 'c';
    return [n.id, typeCode, n.label, cfg?.logicSnippet ?? '', col];
  });
  const connections = agent.connections.map(c =>
    [c.id, c.source, c.target, c.condition ?? '']
  );
  return JSON.stringify({
    id: agent.id,
    name: agent.name,
    op: agent.originalPrompt ?? '',
    n: nodes,
    c: connections,
  });
}

// ── Helper: derive column from node type ──────────────────────────────────

function deriveColumn(type: NodeType): 'left' | 'center' | 'right' {
  const RIGHT = new Set<NodeType>(['RULE', 'TOOL', 'CONFIG', 'MEMORY', 'REFERENCE', 'GUARD', 'TRIGGER']);
  const LEFT = new Set<NodeType>(['INPUT']);
  if (RIGHT.has(type)) return 'right';
  if (LEFT.has(type)) return 'left';
  return 'center';
}

// ── applyGraphEdits — pure function ───────────────────────────────────────

export function applyGraphEdits(
  agent: AgentConfig,
  editResult: GraphEditResult
): AgentConfig {
  const timestamp = Date.now();

  // Step 1: Build tempId → stable real ID map
  const tempIdMap = new Map<string, string>();
  editResult.newNodes.forEach((spec, i) => {
    tempIdMap.set(spec.tempId, `node-${timestamp}-${i}`);
  });

  const removedNodeSet = new Set(editResult.removedNodeIds);

  // Step 2: Remove nodes
  let nodes: NodeData[] = agent.nodes.filter(n => !removedNodeSet.has(n.id));

  // Step 3: Remove connections (explicit + those touching removed nodes)
  const removedConnSet = new Set(editResult.removedConnectionIds);
  let connections: Connection[] = agent.connections.filter(c => {
    if (removedConnSet.has(c.id)) return false;
    if (removedNodeSet.has(c.source) || removedNodeSet.has(c.target)) return false;
    return true;
  });

  // Step 4: Apply updatedNodes
  nodes = nodes.map(n => {
    const update = editResult.updatedNodes.find(u => u.id === n.id);
    if (!update) return n;
    return {
      ...n,
      label: update.label ?? n.label,
      description: update.description ?? n.description,
      config: update.config
        ? { ...n.config, ...update.config, _modifiedByEdit: true }
        : { ...n.config, _modifiedByEdit: true },
    };
  });

  // Step 5: Apply updatedConnections
  connections = connections.map(c => {
    const update = editResult.updatedConnections.find(u => u.id === c.id);
    if (!update) return c;
    return {
      ...c,
      condition: update.condition ?? c.condition,
      source: update.source ?? c.source,
      target: update.target ?? c.target,
    };
  });

  // Step 6: Add new nodes
  const newNodeData: NodeData[] = editResult.newNodes.map((spec, i) => {
    const realId = tempIdMap.get(spec.tempId)!;
    return {
      id: realId,
      type: spec.type,
      label: spec.label,
      description: spec.description ?? '',
      config: {
        pfgType: spec.config.pfgType ?? spec.type.toLowerCase(),
        logicSnippet: spec.config.logicSnippet ?? spec.label,
        column: spec.config.column ?? deriveColumn(spec.type),
        ruleScope: spec.config.ruleScope ?? null,
        appliesTo: spec.config.appliesTo ?? null,
        personaScope: spec.config.personaScope ?? null,
        inputRequired: spec.config.inputRequired ?? null,
        branchGroup: spec.config.branchGroup ?? null,
        sourceSection: spec.config.sourceSection ?? '',
        order: spec.config.order ?? (nodes.length + i + 1),
        outcome: spec.config.outcome ?? undefined,
        // Preserve AGENT-specific fields from the AI response
        ...(spec.type === 'AGENT' && {
          linkedAgentId: spec.config.linkedAgentId ?? 'pending',
          agentRole: spec.config.agentRole ?? spec.label.replace(/\s*Agent$/i, ''),
        }),
        _generatedByEdit: true,
      },
      position: { x: 0, y: 0 }, // recalculated by applyAutoLayout below
    };
  });

  nodes = [...nodes, ...newNodeData];

  // Step 7: Add new connections (resolve tempIds in source/target)
  const newConns: Connection[] = editResult.newConnections.map((spec, i) => ({
    id: `conn-edit-${timestamp}-${i}`,
    source: tempIdMap.get(spec.source) ?? spec.source,
    target: tempIdMap.get(spec.target) ?? spec.target,
    condition: spec.condition,
  }));

  connections = [...connections, ...newConns];

  // Step 8: Update edited prompt using robust 3-Pass AST Splice methodology
  const hasOriginal = agent.originalPrompt !== undefined && agent.originalPrompt !== null;
  const lines = (agent.editedPrompt ?? agent.originalPrompt ?? '').split('\n');

  // Helper: find a node's current row in `lines` by searching for its text
  // (origRow/lineIndex may be stale if editedPrompt differs from originalPrompt)
  function findNodeRow(node: NodeData): number | undefined {
    const cfg = node.config as Record<string, unknown> | undefined;
    const nodeAny = node as any;
    const candidates: string[] = [];
    if (cfg?.origSnippet) candidates.push(String(cfg.origSnippet).trim());
    if (cfg?.origLine) candidates.push(String(cfg.origLine).trim());
    if (cfg?.logicSnippet) candidates.push(String(cfg.logicSnippet).trim());

    for (const needle of candidates) {
      if (!needle || needle.length < 3) continue;
      for (let li = 0; li < lines.length; li++) {
        if (lines[li].includes(needle)) return li;
      }
    }
    // Fallback to stored index if text search fails
    const storedRow = (cfg?.origRow ?? nodeAny.lineIndex) as number | undefined;
    if (storedRow !== undefined && storedRow >= 0 && storedRow < lines.length) return storedRow;
    return undefined;
  }

  // Pass 1: Handle Deletions
  const deletedRows = new Set<number>();
  for (const removedId of removedNodeSet) {
    const node = agent.nodes.find(n => n.id === removedId);
    if (!node) continue;
    const row = findNodeRow(node);
    if (row !== undefined) {
      lines[row] = ''; // blank out deleted lines to preserve index mapping
      deletedRows.add(row);
    }
  }

  // Pass 2: Handle Updates
  for (const update of editResult.updatedNodes) {
    if (!update.config || update.config.logicSnippet === undefined) continue;
    const node = agent.nodes.find(n => n.id === update.id);
    if (!node) continue;
    const row = findNodeRow(node);
    if (row !== undefined) {
      // Preserve existing indentation
      const indentMatch = lines[row].match(/^(\s*(?:[-*+]\s+)?)/);
      const prefix = indentMatch ? indentMatch[1] : '';
      const snippet = String(update.config.logicSnippet);
      lines[row] = snippet.includes('\n') ? snippet : (prefix + snippet.trimStart());
    }
  }

  // Pass 3: Handle Insertions — deterministic placement from edges + order
  //
  // Strategy: Multi-pass resolution
  //   Pass A: Build row lookup from origRow, lineIndex, or editedRow
  //   Pass B: For each new node, resolve via LLM anchor → edge anchor → chain walk → order proximity
  //   Pass C: Propagate resolved rows from placed new nodes to unresolved chained new nodes

  // Build row lookup for existing nodes using text-based search
  const rowMap = new Map<string, number>();
  const orderMap = new Map<string, number>();
  for (const n of agent.nodes) {
    const cfg = n.config as Record<string, unknown> | undefined;
    const row = findNodeRow(n);
    if (row !== undefined) rowMap.set(n.id, row);
    if (cfg?.order !== undefined) orderMap.set(n.id, cfg.order as number);
  }

  // Build existing edge adjacency for transitive chain walks
  const existingEdges = new Map<string, string[]>();
  for (const c of agent.connections) {
    if (!existingEdges.has(c.source)) existingEdges.set(c.source, []);
    if (!existingEdges.has(c.target)) existingEdges.set(c.target, []);
    existingEdges.get(c.source)!.push(c.target);
    existingEdges.get(c.target)!.push(c.source);
  }

  // Helper: walk existing edges up to 3 hops to find a node with a row
  function findRowTransitive(startId: string, maxHops: number = 3): number | undefined {
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: startId, depth: 0 }];
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (rowMap.has(id)) return rowMap.get(id)!;
      if (depth < maxHops) {
        for (const neighbor of existingEdges.get(id) ?? []) {
          if (!visited.has(neighbor)) queue.push({ id: neighbor, depth: depth + 1 });
        }
      }
    }
    return undefined;
  }

  // Build a set of all new tempIds for quick lookup
  const tempIdSet = new Set(editResult.newNodes.map(n => n.tempId));

  // Pass B: Resolve each new node's targetRow
  const resolvedRows = new Map<string, { row: number; source: string }>();
  const unresolvedNodes: typeof editResult.newNodes = [];

  for (const newNode of editResult.newNodes) {
    const snippet = newNode.config.logicSnippet as string | undefined;
    if (!snippet) continue;

    let targetRow: number | undefined;
    let placementSource = '';

    // ── Attempt 1: LLM-provided insertNodeId (backward compat) ──
    const insertNodeId = newNode.config.insertNodeId as string | undefined;
    const ip = (newNode.config.insertPosition as string | undefined) || 'after';

    if (insertNodeId && rowMap.has(insertNodeId)) {
      const row = rowMap.get(insertNodeId)!;
      targetRow = ip === 'before' ? row : row + 1;
      placementSource = `LLM insertNodeId=${insertNodeId}`;
    }

    // ── Attempt 2: Infer anchor from graph edges (direct connection to existing node) ──
    if (targetRow === undefined) {
      const realId = tempIdMap.get(newNode.tempId)!;

      // Collect all edge-based placement candidates, then pick the best one.
      // Outgoing edges (new→existing) place BEFORE the anchor; incoming edges
      // (existing→new) place AFTER.  Prefer the edge that gives a downstream
      // placement (higher row) to avoid inserting before unrelated content.
      let bestEdgeRow: number | undefined;
      let bestEdgeSource = '';

      for (const conn of editResult.newConnections) {
        const resolvedSrc = tempIdMap.get(conn.source) ?? conn.source;
        const resolvedTgt = tempIdMap.get(conn.target) ?? conn.target;

        // New node → existing node (outgoing)
        if (resolvedSrc === realId && !tempIdSet.has(conn.target)) {
          const row = rowMap.has(conn.target) ? rowMap.get(conn.target)! : findRowTransitive(conn.target);
          if (row !== undefined) {
            const candidate = row; // place before the downstream anchor
            if (bestEdgeRow === undefined || candidate > bestEdgeRow) {
              bestEdgeRow = candidate;
              bestEdgeSource = `outgoing edge → ${conn.target} (row ${row})`;
            }
          }
        }
        // Existing node → new node (incoming)
        if (resolvedTgt === realId && !tempIdSet.has(conn.source)) {
          const row = rowMap.has(conn.source) ? rowMap.get(conn.source)! : findRowTransitive(conn.source);
          if (row !== undefined) {
            const candidate = row + 1; // place after the upstream anchor
            if (bestEdgeRow === undefined || candidate > bestEdgeRow) {
              bestEdgeRow = candidate;
              bestEdgeSource = `incoming edge ← ${conn.source} (row ${row})`;
            }
          }
        }
      }
      if (bestEdgeRow !== undefined) {
        targetRow = bestEdgeRow;
        placementSource = bestEdgeSource;
      }
    }

    if (targetRow !== undefined) {
      resolvedRows.set(newNode.tempId, { row: targetRow, source: placementSource });
    } else {
      unresolvedNodes.push(newNode);
    }
  }

  // Pass C: Propagate — unresolved nodes inherit placement from resolved siblings via shared edges
  for (const newNode of unresolvedNodes) {
    const realId = tempIdMap.get(newNode.tempId)!;
    let targetRow: number | undefined;
    let placementSource = '';

    // Check if any connection links this node to an already-resolved new node
    for (const conn of editResult.newConnections) {
      const resolvedSrc = tempIdMap.get(conn.source) ?? conn.source;
      const resolvedTgt = tempIdMap.get(conn.target) ?? conn.target;

      if (resolvedSrc === realId && resolvedRows.has(conn.target)) {
        // This new node → resolved new node
        targetRow = resolvedRows.get(conn.target)!.row;
        placementSource = `propagated from resolved ${conn.target}`;
        break;
      }
      if (resolvedTgt === realId && resolvedRows.has(conn.source)) {
        // Resolved new node → this new node
        targetRow = resolvedRows.get(conn.source)!.row;
        placementSource = `propagated from resolved ${conn.source}`;
        break;
      }
    }

    // Still unresolved — order proximity fallback
    if (targetRow === undefined) {
      const newOrder = (newNode.config.order as number) ?? 0;
      let bestDist = Infinity;
      let bestId: string | undefined;

      for (const [nodeId, nodeOrder] of orderMap.entries()) {
        if (!rowMap.has(nodeId)) continue;
        const dist = Math.abs(nodeOrder - newOrder);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = nodeId;
        }
      }

      if (bestId) {
        const anchorRow = rowMap.get(bestId)!;
        const anchorOrder = orderMap.get(bestId) ?? 0;
        targetRow = newOrder >= anchorOrder ? anchorRow + 1 : anchorRow;
        placementSource = `order proximity to ${bestId}`;
      }
    }

    resolvedRows.set(newNode.tempId, { row: targetRow ?? lines.length, source: placementSource || 'EOF fallback' });
  }

  // Collect all insertions
  const insertions: Record<number, string[]> = {};

  for (const newNode of editResult.newNodes) {
    const snippet = newNode.config.logicSnippet as string | undefined;
    if (!snippet) continue;

    const resolved = resolvedRows.get(newNode.tempId);
    const targetRow = resolved?.row ?? lines.length;
    const placementSource = resolved?.source ?? 'EOF fallback';

    console.log(`[AST Edit Sync] Placing ${newNode.tempId} at row ${targetRow} (${placementSource})`);

    if (!insertions[targetRow]) insertions[targetRow] = [];
    insertions[targetRow].push(snippet);
  }

  // Finally, compile the new 1:1 bidirectional document
  const finalLines: string[] = [];
  for (let i = 0; i <= lines.length; i++) {
    // Process any insertions assigned to print at this boundary offset
    if (insertions[i]) {
      finalLines.push(...insertions[i]);
    }

    // Print the actual existing line material (if we aren't at the end bounds)
    if (i < lines.length) {
      // Only skip lines explicitly blanked by Pass 1 deletions; preserve original blank lines
      if (lines[i] !== '' || !deletedRows.has(i)) finalLines.push(lines[i]);
    }
  }

  const updatedPrompt = finalLines.join('\n');

  // Step 9: Re-run auto-layout to calculate positions for all nodes
  const layoutedNodes = applyAutoLayout(nodes, connections);

  const result: AgentConfig = {
    ...agent,
    nodes: layoutedNodes,
    connections,
    originalPrompt: hasOriginal ? agent.originalPrompt : updatedPrompt,
    editedPrompt: updatedPrompt,
    updatedAt: new Date().toISOString(),
  };

  // Strict chat edit mode: reject edits that create critical DAG violations
  const graphRules = getGraphRuleSettings();
  if (graphRules.strictChatEditMode) {
    const violations = validateAgentConfig(result);
    const criticalViolations = violations.filter(v => v.type === 'error' && v.ruleCategory === 'dag');
    if (criticalViolations.length > 0) {
      throw new Error(
        `Edit rejected (strict mode): ${criticalViolations.map(v => v.message).join('; ')}`
      );
    }
  }

  return result;
}

// ── graphEditAgent — main entry point ─────────────────────────────────────

export interface GraphEditAgentOptions {
  userMessage: string;
  currentAgent: AgentConfig;
  apiKey: string;
  model?: string;
  onChunk?: (text: string) => void;
}

export interface GraphEditAgentResult {
  /** The fully updated AgentConfig after applying the edits. */
  agent: AgentConfig;
  /** Raw diff returned by Gemini. */
  editResult: GraphEditResult;
  /** Convenience shortcut to editResult.summary. */
  summary: string;
  /** Format metadata — what was used for this edit */
  formatInfo: {
    inputFormat: 'json' | 'json-compact';
    outputFormat: 'json' | 'yaml' | 'json-compact';
    rawOutputChars: number;
  };
}

export async function graphEditAgent(
  options: GraphEditAgentOptions
): Promise<GraphEditAgentResult> {
  const { userMessage, currentAgent, apiKey, model = DEFAULT_GEMINI_MODEL } = options;
  const graphRules = getGraphRuleSettings();
  const chatFormat = graphRules.chatEditFormat ?? 'json';

  // ── Build input & system prompt based on format ──
  let userPrompt: string;
  let systemPrompt: string;
  let responseMimeType: string;
  let inputFormatUsed: 'json' | 'json-compact' = 'json';

  if (chatFormat === 'json-compact') {
    // Compact input + compact output
    const compactGraph = serializeGraphCompact(currentAgent);
    userPrompt = `CURRENT AGENT GRAPH (compact):\n${compactGraph}\n\nUSER EDIT REQUEST:\n${userMessage}`;
    systemPrompt = graphRules.injectDAGRulesInPrompts
      ? GRAPH_EDIT_COMPACT_PROMPT + '\n\n' + DAG_RULES_FOR_EDITING
      : GRAPH_EDIT_COMPACT_PROMPT;
    responseMimeType = 'application/json';
    inputFormatUsed = 'json-compact';
  } else {
    // Standard JSON input for both JSON and YAML output
    const agentSnapshot = {
      id: currentAgent.id,
      name: currentAgent.name,
      originalPrompt: currentAgent.originalPrompt ?? '',
      nodes: currentAgent.nodes.map(n => ({
        id: n.id,
        type: n.type,
        label: n.label,
        description: n.description ?? '',
        config: {
          pfgType: (n.config as Record<string, unknown>)?.pfgType ?? n.type.toLowerCase(),
          logicSnippet: (n.config as Record<string, unknown>)?.logicSnippet ?? '',
          column: (n.config as Record<string, unknown>)?.column ?? 'center',
          ruleScope: (n.config as Record<string, unknown>)?.ruleScope ?? null,
          order: (n.config as Record<string, unknown>)?.order ?? 0,
        },
      })),
      connections: currentAgent.connections.map(c => ({
        id: c.id,
        source: c.source,
        target: c.target,
        condition: c.condition ?? '',
      })),
    };
    userPrompt = `CURRENT AGENT GRAPH:\n${JSON.stringify(agentSnapshot, null, 2)}\n\nUSER EDIT REQUEST:\n${userMessage}`;

    const basePrompt = graphRules.injectDAGRulesInPrompts
      ? GRAPH_EDIT_SYSTEM_PROMPT + '\n\n' + DAG_RULES_FOR_EDITING
      : GRAPH_EDIT_SYSTEM_PROMPT;

    if (chatFormat === 'yaml') {
      systemPrompt = basePrompt + YAML_OUTPUT_ADDENDUM;
      responseMimeType = 'text/plain';
    } else {
      systemPrompt = basePrompt;
      responseMimeType = 'application/json';
    }
  }

  // ── Call Gemini ──
  const ai = new GoogleGenAI({ apiKey });

  let raw = '';
  const stream = await (ai.models as any).generateContentStream({
    model,
    config: {
      temperature: 0,
      topP: 0,
      thinkingConfig: (model?.includes('gemini-2') ? { thinkingBudget: 0 } : { thinkingLevel: 'MINIMAL' }) as any,
      responseMimeType,
      systemInstruction: systemPrompt,
    },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  });

  for await (const chunk of stream) {
    const text = (chunk as any).text ?? '';
    options.onChunk?.(text);
    raw += text;
  }

  const rawOutputChars = raw.length;
  console.log('--- RAW LLM RESPONSE START ---');
  console.log(raw);
  console.log('--- RAW LLM RESPONSE END ---');

  // ── Parse based on format ──
  let editResult: GraphEditResult;
  try {
    if (chatFormat === 'yaml') {
      // Strip markdown fences if present
      let yamlText = raw.trim();
      if (yamlText.startsWith('```')) {
        yamlText = yamlText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      } else {
        // Strip trailing fence even with no leading one
        yamlText = yamlText.replace(/\n?```\s*$/i, '').trim();
      }
      const parsed = yaml.load(yamlText) as any;
      editResult = parsed as GraphEditResult;
    } else if (chatFormat === 'json-compact') {
      let compactText = raw.trim();
      // Strip leading code-fence block
      if (compactText.startsWith('```')) {
        compactText = compactText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
      } else {
        // Strip trailing fence even with no leading one
        compactText = compactText.replace(/\n?```\s*$/, '').trim();
      }
      const parsed = JSON.parse(compactText);
      console.log('--- PARSED COMPACT JSON START ---');
      console.log(JSON.stringify(parsed, null, 2));
      console.log('--- PARSED COMPACT JSON END ---');
      editResult = expandCompactEditResult(parsed);
    } else {
      let jsonText = raw.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
      } else {
        jsonText = jsonText.replace(/\n?```\s*$/, '').trim();
      }
      editResult = JSON.parse(jsonText);
    }
  } catch (e) {
    throw new Error(
      `Graph edit agent returned invalid ${chatFormat.toUpperCase()}. Raw: ${raw.slice(0, 500)}`
    );
  }

  // ── Defensive normalization — ensure all arrays exist ──
  // ── Defensive normalization — ensure all arrays exist ──
  editResult.newNodes = editResult.newNodes ?? [];
  editResult.newConnections = editResult.newConnections ?? [];
  editResult.removedNodeIds = editResult.removedNodeIds ?? [];
  editResult.removedConnectionIds = editResult.removedConnectionIds ?? [];
  editResult.updatedNodes = editResult.updatedNodes ?? [];
  editResult.updatedConnections = editResult.updatedConnections ?? [];
  editResult.summary = editResult.summary ?? 'Graph updated';
  editResult.promptUpdates = editResult.promptUpdates ?? [
    { strategy: 'none', insertText: '' }
  ];

  const updatedAgent = applyGraphEdits(currentAgent, editResult);

  return {
    agent: updatedAgent,
    editResult,
    summary: editResult.summary,
    formatInfo: {
      inputFormat: inputFormatUsed,
      outputFormat: chatFormat,
      rawOutputChars,
    },
  };
}
