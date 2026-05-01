import type { AgentConfig } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Pre-processing: annotate decision branch nodes and decision chains so the
// GFP skill can reconstruct them as if/elif/else blocks rather than listing
// each branch as an independent section.
//
// Works generically on any graph: detects structure from topology alone.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeDecisionBranchAnnotations(pfgJson: any): any {
  const { nodes, edges } = pfgJson.graph;

  // ── Build topology maps ────────────────────────────────────────────────────
  const incomingEdges: Record<string, Array<{ source: string; condition: string }>> = {};
  const outgoingEdges: Record<string, any[]> = {};

  for (const edge of edges) {
    if (!incomingEdges[edge.target]) incomingEdges[edge.target] = [];
    incomingEdges[edge.target].push({
      source: edge.source,
      condition: edge.data?.condition ?? edge.label ?? '',
    });
    if (!outgoingEdges[edge.source]) outgoingEdges[edge.source] = [];
    outgoingEdges[edge.source].push(edge);
  }

  const decisionIds = new Set<string>(
    nodes.filter((n: any) => n.type === 'decision').map((n: any) => n.id as string)
  );

  // ── Detect decision chains ─────────────────────────────────────────────────
  // A "chain" is: decision A → (via one edge) → decision B, where B has exactly
  // one incoming edge (it is exclusively reached from A).  The chain continues
  // as long as this holds.  We record the root and position of each member.
  const chainedTo: Record<string, string> = {}; // decId → next decId in chain
  for (const decId of decisionIds) {
    for (const edge of outgoingEdges[decId] ?? []) {
      if (
        decisionIds.has(edge.target) &&
        (incomingEdges[edge.target] ?? []).length === 1
      ) {
        chainedTo[decId] = edge.target;
      }
    }
  }

  // Walk chains from roots (decisions not pointed to by another chain link)
  const chainTargets = new Set(Object.values(chainedTo));
  const chainRoot: Record<string, string> = {};
  const chainIndex: Record<string, number> = {};

  for (const decId of decisionIds) {
    if (!chainTargets.has(decId)) {
      // This is a root — walk and label every member
      let current: string | undefined = decId;
      let idx = 0;
      while (current) {
        chainRoot[current] = decId;
        chainIndex[current] = idx++;
        current = chainedTo[current];
      }
    }
  }

  // ── Annotate nodes ─────────────────────────────────────────────────────────
  const annotatedNodes = nodes.map((node: any) => {
    const nodeIncoming = incomingEdges[node.id] ?? [];
    const additions: Record<string, any> = {};

    // Mark nodes that are the exclusive branch target of a single decision.
    // "Exclusive" means: only one incoming edge, and it comes from a decision.
    // These should be inlined as conditional branches under the parent decision
    // rather than emitted as standalone sections.
    if (
      nodeIncoming.length === 1 &&
      decisionIds.has(nodeIncoming[0].source) &&
      nodeIncoming[0].condition.trim() !== ''
    ) {
      additions._is_decision_branch = true;
      additions._parent_decision = nodeIncoming[0].source;
      additions._branch_condition = nodeIncoming[0].condition;
    }

    // Mark decision chain membership so GFP can collapse the chain into one
    // if/elif/else block instead of listing each decision separately.
    if (decisionIds.has(node.id) && chainRoot[node.id] !== undefined) {
      additions._decision_chain_root = chainRoot[node.id];
      additions._decision_chain_index = chainIndex[node.id];
      // Record which of its outgoing edges is the chain link (leads to next
      // decision in chain) vs. the "positive" branch (the actual outcome).
      const nextInChain = chainedTo[node.id];
      if (nextInChain) {
        const chainEdge = (outgoingEdges[node.id] ?? []).find(
          (e: any) => e.target === nextInChain
        );
        if (chainEdge) {
          additions._chain_link_condition = chainEdge.data?.condition ?? chainEdge.label ?? '';
        }
      }
    }

    if (Object.keys(additions).length === 0) return node;
    return { ...node, data: { ...node.data, ...additions } };
  });

  return { ...pfgJson, graph: { ...pfgJson.graph, nodes: annotatedNodes } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-processing: mark nodes as _suppress when their logic_snippet is already
// embedded verbatim inside another node's logic_snippet in the same section.
// Prevents duplicate content lines like "ToxicityFilter tool", "order_id",
// "approve full cash refund", "deny refund, respond: …", etc.
//
// Strategy:
//   1. Always suppress structural types (tool, input) if their snippet appears
//      in any other node's snippet (original behaviour).
//   2. Additionally suppress any node whose snippet is a case-insensitive
//      substring of a sibling node's snippet within the same source_section,
//      as long as the sibling has a strictly longer snippet.  This catches
//      action/step/rule children that PFG extracted as sub-phrases of a bullet.
// ─────────────────────────────────────────────────────────────────────────────
function suppressEmbeddedNodes(pfgJson: any): any {
  const { nodes } = pfgJson.graph;

  const STRUCTURAL_TYPES = new Set(['tool', 'input']);
  const ALWAYS_KEEP_TYPES = new Set(['start', 'end', 'decision', 'group']);

  // Pre-compute lower-case snippets once
  const snippetOf = (n: any): string => (n.data.logic_snippet ?? '') as string;

  // All snippets from non-structural nodes (the potential "container" nodes)
  const containerSnippets: string[] = nodes
    .filter((n: any) => !STRUCTURAL_TYPES.has(n.type))
    .map((n: any) => snippetOf(n))
    .filter((s: string) => s.length > 0);

  // Build section → nodes index for sibling lookup
  const sectionNodes: Map<string, any[]> = new Map();
  for (const node of nodes) {
    const sec = node.data.source_section ?? '';
    if (!sectionNodes.has(sec)) sectionNodes.set(sec, []);
    sectionNodes.get(sec)!.push(node);
  }

  const suppressIds = new Set<string>();

  for (const node of nodes) {
    if (ALWAYS_KEEP_TYPES.has(node.type)) continue;
    const snippet = snippetOf(node);
    if (!snippet) continue;

    // Rule 1: structural types suppressed if snippet appears in ANY container
    if (STRUCTURAL_TYPES.has(node.type)) {
      const isEmbedded = containerSnippets.some(
        (s: string) => s !== snippet && s.includes(snippet)
      );
      if (isEmbedded) suppressIds.add(node.id);
      continue;
    }

    // Rule 2: any type suppressed if its snippet is a sub-phrase of a sibling
    // in the same section with a strictly longer snippet.
    const siblings = sectionNodes.get(node.data.source_section ?? '') ?? [];
    const snippetLower = snippet.toLowerCase();
    const isSubPhrase = siblings.some((sib: any) => {
      if (sib.id === node.id) return false;
      const sibSnippet = snippetOf(sib);
      if (sibSnippet.length <= snippet.length) return false;
      return sibSnippet.toLowerCase().includes(snippetLower);
    });
    if (isSubPhrase) suppressIds.add(node.id);
  }

  if (suppressIds.size === 0) return pfgJson;

  const updatedNodes = nodes.map((node: any) =>
    suppressIds.has(node.id)
      ? { ...node, data: { ...node.data, _suppress: true } }
      : node
  );

  return { ...pfgJson, graph: { ...pfgJson.graph, nodes: updatedNodes } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-processing: mark consecutive same-type prose nodes in the same section
// as _merge_with_previous so GFP joins them into one paragraph.
// Fixes persona/prose text that PFG split at sentence boundaries.
// ─────────────────────────────────────────────────────────────────────────────
function annotateProseContinuations(pfgJson: any): any {
  const { nodes } = pfgJson.graph;

  // Sort by section then order to find consecutive siblings
  const sorted = [...nodes].sort((a: any, b: any) => {
    const sc = (a.data.source_section ?? '').localeCompare(b.data.source_section ?? '');
    if (sc !== 0) return sc;
    return (a.data.order ?? 0) - (b.data.order ?? 0);
  });

  const mergeIds = new Set<string>();
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (
      prev.data.source_section === curr.data.source_section &&
      prev.data.source_format === 'prose' &&
      curr.data.source_format === 'prose' &&
      prev.type === curr.type &&
      Math.abs((curr.data.order ?? 0) - (prev.data.order ?? 0)) === 1
    ) {
      mergeIds.add(curr.id);
    }
  }

  if (mergeIds.size === 0) return pfgJson;

  const updatedNodes = nodes.map((node: any) =>
    mergeIds.has(node.id)
      ? { ...node, data: { ...node.data, _merge_with_previous: true } }
      : node
  );

  return { ...pfgJson, graph: { ...pfgJson.graph, nodes: updatedNodes } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-processing: derive section ordering from graph topology (BFS from start)
// and annotate every node with _section_sequence.
//
// This ensures GFP sequences sections in document-flow order even when PFG or
// AI edits have assigned data.order values that don't reflect document position.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeNodeSectionSequences(pfgJson: any): any {
  const { nodes, edges } = pfgJson.graph;
  // Source text is stored inside the graph metadata — no external reference needed.
  const sourceText: string = pfgJson.metadata?._source_text ?? '';

  // Build forward-adjacency map
  const adj: Record<string, string[]> = {};
  for (const edge of edges) {
    if (!adj[edge.source]) adj[edge.source] = [];
    adj[edge.source].push(edge.target);
  }

  // ── Derive ordering from source text headings (primary) ───────────────────
  // Parse ## headings in document order — this is the canonical section sequence.
  // This prevents BFS traversal order (which depends on edge order) from
  // reordering sections that haven't changed.
  const promptHeadingOrder = new Map<string, number>();
  if (sourceText) {
    const matches = [...sourceText.matchAll(/^#{1,4}\s+(.+)$/gm)];
    matches.forEach((m, idx) => promptHeadingOrder.set(m[1].trim(), idx));
  }

  // Fuzzy lookup: exact → case-insensitive → one contains the other
  function findInPrompt(section: string): number | undefined {
    if (!section) return undefined;
    if (promptHeadingOrder.has(section)) return promptHeadingOrder.get(section);
    const lower = section.toLowerCase();
    for (const [h, i] of promptHeadingOrder) {
      if (h.toLowerCase() === lower) return i;
    }
    for (const [h, i] of promptHeadingOrder) {
      const hl = h.toLowerCase();
      if (hl.includes(lower) || lower.includes(hl)) return i;
    }
    return undefined;
  }

  // ── BFS from the start node (fallback for new sections) ───────────────────
  const bfsSectionSeq = new Map<string, number>();
  let seq = 0;

  const startNode = nodes.find((n: any) => n.type === 'start');
  if (startNode) {
    const visited = new Set<string>();
    const queue: string[] = [startNode.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const node = nodes.find((n: any) => n.id === id);
      if (node) {
        const section = node.data.source_section ?? '';
        if (!bfsSectionSeq.has(section)) bfsSectionSeq.set(section, seq++);
      }

      for (const nxt of adj[id] ?? []) {
        if (!visited.has(nxt)) queue.push(nxt);
      }
    }
  }

  // Assign BFS sequence to any sections not reachable via BFS
  for (const node of nodes) {
    const section = node.data.source_section ?? '';
    if (!bfsSectionSeq.has(section)) bfsSectionSeq.set(section, seq++);
  }

  // ── Merge: prompt order for known sections, BFS offset for new ones ────────
  const maxPromptSeq = promptHeadingOrder.size;
  const finalSectionSeq = new Map<string, number>();
  for (const [section, bfsSeq] of bfsSectionSeq) {
    const promptSeq = findInPrompt(section);
    finalSectionSeq.set(
      section,
      promptSeq !== undefined
        ? promptSeq                          // known section → preserve original order
        : maxPromptSeq * 10 + bfsSeq        // new section → append after originals
    );
  }

  // Annotate every node with _section_sequence
  const updatedNodes = nodes.map((node: any) => {
    const section = node.data.source_section ?? '';
    return { ...node, data: { ...node.data, _section_sequence: finalSectionSeq.get(section) ?? 0 } };
  });

  return { ...pfgJson, graph: { ...pfgJson.graph, nodes: updatedNodes } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-sync: convert AgentConfig back to PFG JSON format for graph-flow-prompt
// ─────────────────────────────────────────────────────────────────────────────
function agentConfigToPfgJson(agent: AgentConfig): any {
  const pfgTypeMap: Record<string, string> = {
    START: 'start',
    END: 'end',
    INPUT: 'input',
    DECISION: 'decision',
    ACTION: 'action',
    TOOL: 'tool',
    RULE: 'rule',
    STEP: 'step',
    OPTION: 'option',
    AGENT: 'agent',
    REFERENCE: 'reference',
    CONFIG: 'config',
    TRIGGER: 'trigger',
    CONDITION: 'condition',
    TASK: 'task',
    PERSONA: 'persona',
    MEMORY: 'memory',
    HANDOFF: 'handoff',
    GUARD: 'guard',
    RESOLUTION: 'resolution',
    GROUP: 'step',
  };

  const nodes = agent.nodes.map((n) => {
    const cfg = n.config as any;
    return {
      id: n.id,
      type: cfg?.pfgType ?? pfgTypeMap[n.type] ?? 'action',
      position: n.position,
      data: {
        label: n.label,
        description: n.description ?? '',
        logic_snippet: cfg?.logicSnippet ?? n.label,
        source_section: cfg?.sourceSection ?? '',
        source_format: cfg?.sourceFormat ?? 'prose',
        order: cfg?.order ?? 0,
        tool: cfg?.tool ?? null,
        value: cfg?.value ?? null,
        outcome: cfg?.outcome ?? null,
        input_required: cfg?.inputRequired ?? null,
        rule_scope: cfg?.ruleScope ?? null,
        applies_to: cfg?.appliesTo ?? null,
        persona_scope: cfg?.personaScope ?? null,
        // Original source position metadata (set during prompt→graph conversion).
        // Used for graph-only reconstruction — the graph carries everything needed.
        _orig_row: (cfg?.origRow as number | undefined) ?? null,
        _orig_line: (cfg?.origLine as string | undefined) ?? null,
        _orig_blank_before: (cfg?.origBlankBefore as boolean | undefined) ?? null,
        _orig_snippet: (cfg?.origSnippet as string | undefined) ?? null,
        _generatedByEdit: cfg?._generatedByEdit ?? null,
        _modifiedByEdit: cfg?._modifiedByEdit ?? null,
      },
    };
  });

  // Exclude auto-wired edges (id starts with "auto-e") from reconstruction.
  // These are structural visualization edges that should not affect prompt fidelity.
  const edges = agent.connections
    .filter((c) => !c.id.startsWith('auto-e'))
    .map((c) => ({
      id: c.id,
      source: c.source,
      target: c.target,
      label: c.condition ?? '',
      data: { condition: c.condition ?? '', animation: 'pulse' },
    }));

  // Reconstruct global_rules and inputs registries from nodes
  const globalRuleNodes = nodes.filter((n) => n.data.rule_scope === 'global');
  const global_rules = globalRuleNodes.length > 0
    ? [{ id: 'gr1', label: 'Global Rules', rule_nodes: globalRuleNodes.map((n) => n.id), applies_to: 'all' }]
    : [];

  const inputNodes = nodes.filter((n) => n.type === 'input');
  const inputs = inputNodes.map((n) => ({ node_id: n.id, required: n.data.input_required ?? true }));

  return {
    metadata: {
      agent_id: agent.name.toLowerCase().replace(/\s+/g, '_'),
      description: agent.description ?? '',
      source_doc_format: 'plain_markdown',
      // Store the original prompt text inside the graph so reconstruction
      // is fully self-contained — no external originalPrompt reference needed.
      _source_text: agent.originalPrompt ?? '',
    },
    graph: { nodes, edges, conflicts: [], global_rules, inputs },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic prompt reconstruction from preprocessed PFG JSON.
//
// Strategy:
//   1. If we have the original prompt AND nodes with _orig_row metadata,
//      use the original prompt lines as the base and apply edits on top.
//      Unchanged graphs produce a byte-identical result (1:1).
//   2. Fallback: order-based assembly using node metadata for graphs
//      without position metadata.
// ─────────────────────────────────────────────────────────────────────────────

const normalizeSnippet = (s: string) =>
  s.replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#+\s+/, '')
    .trim();

// ─────────────────────────────────────────────────────────────────────────────
// Primary path: use original prompt as the base, overlay graph edits.
//
// Phase 1 — Walk every line of the original prompt:
//   • If a visible node claims the line via _orig_row and was edited,
//     replace the line preserving indent + marker.
//   • If claimed but unchanged, emit the original line verbatim → 1:1.
//   • Unclaimed lines (blanks, headings, short content PFG couldn't match)
//     are emitted verbatim.
//
// Phase 2 — Insert truly new nodes (no _orig_row, content NOT already in
//   the original prompt).  Positioned by section/order next to siblings.
//   Nodes without _orig_row whose snippet already appears in the original
//   text are sub-extractions by PFG (e.g. one line split into multiple
//   nodes) and are SKIPPED — this prevents the duplication bug.
// ─────────────────────────────────────────────────────────────────────────────
function reconstructFromOriginalBase(nodes: any[], originalPrompt: string): string {
  const origLines = originalPrompt.split('\n');
  const visible = nodes.filter((n: any) => !n.data._suppress && n.type !== 'end');

  const withRow = visible.filter((n: any) => n.data._orig_row != null);
  const noRow = visible.filter((n: any) => n.data._orig_row == null);

  // Map _orig_row → node
  const rowToNode = new Map<number, any>();
  for (const n of withRow) {
    rowToNode.set(n.data._orig_row as number, n);
  }

  // ── Phase 1: walk original lines, apply edits ────────────────────────────
  const out: string[] = [];
  // Track orig-row → output index for Phase 2 insertion positioning
  const rowToOutIdx = new Map<number, number>();

  for (let r = 0; r < origLines.length; r++) {
    const node = rowToNode.get(r);

    if (node) {
      // Line claimed by a node — check if edited
      const origLine = (node.data._orig_line as string) ?? origLines[r].trimEnd();
      const snippet = (node.data.logic_snippet as string) ?? '';
      const snippetNorm = normalizeSnippet(snippet);
      const origNorm = normalizeSnippet(origLine.trimStart());
      const origSnippet = (node.data._orig_snippet as string) ?? '';
      const origSnippetNorm = normalizeSnippet(origSnippet);

      // Determine if the user actually edited this node by comparing against
      // the original snippet stored at graph-creation time.  If _orig_snippet
      // is unavailable (old graphs), fall back to the previous heuristic.
      let isUnchanged: boolean;
      if (origSnippetNorm) {
        // New path: the node is unchanged iff its current snippet matches
        // the original snippet value from when the graph was first created.
        isUnchanged = snippetNorm === origSnippetNorm;
      } else {
        // Legacy path for old graphs without origSnippet.
        isUnchanged = !snippetNorm
          || origNorm === snippetNorm
          || (origNorm.includes(snippetNorm) && snippetNorm.length >= origNorm.length * 0.85);
      }

      if (isUnchanged) {
        // Unchanged — emit original line verbatim (preserves compound-line content)
        out.push(origLine);
      } else {
        // Edited — try surgical replacement on compound lines first
        const trimmedOrig = origLine.trimStart();
        const indentStr = origLine.substring(0, origLine.length - trimmedOrig.length);

        if (origSnippetNorm && origNorm.includes(origSnippetNorm) && origNorm !== origSnippetNorm) {
          // Compound line: the original line contains MORE content than just this
          // node's snippet.  Replace only the original snippet's span with the
          // new edited snippet, preserving surrounding content.
          const markerMatch = trimmedOrig.match(/^([-*]\s+|\d+\.\s+|#+\s+)/);
          const marker = markerMatch ? markerMatch[1] : '';
          const bodyAfterMarker = trimmedOrig.substring(marker.length);
          const replacedBody = bodyAfterMarker.replace(origSnippetNorm, snippetNorm);
          out.push(indentStr + marker + replacedBody);
        } else {
          // Simple line: the node covered the whole line — replace entirely.
          const marker = (trimmedOrig.match(/^([-*]\s+|\d+\.\s+|#+\s+)/) ?? [])[1] ?? '';
          out.push(indentStr + marker + snippetNorm);
        }
      }
      rowToOutIdx.set(r, out.length - 1);
    } else {
      // Unclaimed line — emit verbatim (blanks, headings, uncaptured content)
      out.push(origLines[r].trimEnd());
      rowToOutIdx.set(r, out.length - 1);
    }
  }

  // ── Phase 2: insert truly new nodes ──────────────────────────────────────
  // A node is "truly new" when:
  //  • it has no _orig_row (wasn't matched to any original line), AND
  //  • its snippet content doesn't already appear in the original prompt
  //    (if it does, it's a PFG sub-extraction, not user-added content)
  //
  // We use aggressive normalization to catch content that differs only in
  // markdown formatting (bold **markers**, `code` backticks, etc.) or
  // whitespace / special characters.
  const stripForComparison = (s: string) =>
    s.toLowerCase()
      .replace(/\*{1,2}/g, '')       // bold/italic markers
      .replace(/`{1,3}/g, '')        // code markers
      .replace(/[^\w\s]/g, ' ')      // non-word chars → space
      .replace(/\s+/g, ' ')          // collapse whitespace
      .trim();

  const originalStripped = stripForComparison(originalPrompt);

  // Phase 2a: handle edited sub-extraction nodes by surgically replacing their
  // origSnippet within the already-emitted Phase 1 output lines.  This avoids
  // the duplication bug where both the original compound line AND the edited
  // sub-extraction appear in the output.
  const editedSubExtractions: any[] = [];
  const trulyNewCandidates: any[] = [];

  for (const n of noRow) {
    const snippet = ((n.data.logic_snippet ?? '') as string).trim();
    if (!snippet) continue;
    const snipNorm = normalizeSnippet(snippet);
    if (snipNorm.length < 4) continue;

    const origSnippet = (n.data._orig_snippet as string | undefined);
    if (origSnippet) {
      const origSnipNorm = normalizeSnippet(origSnippet);
      if (origSnipNorm && snipNorm !== origSnipNorm) {
        // User edited this sub-extraction
        editedSubExtractions.push(n);
        continue;
      }
      if (origSnipNorm && snipNorm === origSnipNorm) {
        continue; // Unchanged sub-extraction → already in compound line
      }
    }
    trulyNewCandidates.push(n);
  }

  // Apply surgical replacements for edited sub-extractions: find the output
  // line that contains the original snippet and replace it in-place.
  for (const n of editedSubExtractions) {
    const snippet = ((n.data.logic_snippet ?? '') as string).trim();
    const snipNorm = normalizeSnippet(snippet);
    const origSnippet = (n.data._orig_snippet as string) ?? '';
    const origSnipNorm = normalizeSnippet(origSnippet);

    let replaced = false;
    for (let oi = 0; oi < out.length; oi++) {
      if (out[oi].includes(origSnipNorm)) {
        out[oi] = out[oi].replace(origSnipNorm, snipNorm);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      // Could not find the original snippet in any output line → treat as truly new
      trulyNewCandidates.push(n);
    }
  }

  // Phase 2b: filter truly new nodes (content not already in original prompt)
  const newNodes = trulyNewCandidates.filter((n: any) => {
    const snippet = ((n.data.logic_snippet ?? '') as string).trim();
    if (!snippet) return false;
    const snipNorm = normalizeSnippet(snippet);
    if (snipNorm.length < 4) return false;

    // Nodes explicitly added or modified by chat edits bypass overlap checks —
    // they are genuinely new content that must appear in the reconstructed prompt.
    if (n.data._generatedByEdit || n.data._modifiedByEdit) return true;

    // Legacy / no-origSnippet path: use original overlap checks
    const snipStripped = stripForComparison(snipNorm);
    if (snipStripped.length < 4) return false;
    if (originalStripped.includes(snipStripped)) return false;

    // Check 2: word-overlap — if 70%+ of the snippet's significant words
    // appear in the original, the content is already there (handles multi-line
    // snippets like JSON blocks where substring match fails).
    const words = snipStripped.split(' ').filter((w: string) => w.length > 2);
    if (words.length > 0) {
      const found = words.filter((w: string) => originalStripped.includes(w)).length;
      if (found / words.length >= 0.7) return false;
    }

    // Content is genuinely new — include it
    return true;
  });

  if (newNodes.length > 0) {
    newNodes.sort((a: any, b: any) => (a.data.order ?? 0) - (b.data.order ?? 0));

    let insertOffset = 0;
    for (const node of newNodes) {
      const snippet = (node.data.logic_snippet ?? '') as string;
      const nodeOrder = (node.data.order ?? 0) as number;

      // Find the output index of the last existing node with order < this one
      let bestOutIdx = -1;
      for (const existing of withRow) {
        if ((existing.data.order ?? 0) < nodeOrder) {
          const outIdx = rowToOutIdx.get(existing.data._orig_row as number);
          if (outIdx !== undefined && outIdx > bestOutIdx) bestOutIdx = outIdx;
        }
      }

      // Format the snippet according to source_format
      const fmt = (node.data.source_format ?? 'prose') as string;
      let formatted: string;
      switch (fmt) {
        case 'bulleted_list':
          formatted = snippet.match(/^[-*]\s/) ? snippet : `- ${snippet}`;
          break;
        case 'numbered_list':
          formatted = snippet.match(/^\d+\.\s/) ? snippet : `1. ${snippet}`;
          break;
        case 'heading':
          formatted = snippet.startsWith('#') ? snippet : `## ${snippet}`;
          break;
        default:
          formatted = snippet;
      }

      const insertIdx = bestOutIdx >= 0
        ? bestOutIdx + 1 + insertOffset
        : out.length;
      out.splice(Math.min(insertIdx, out.length), 0, formatted);
      insertOffset++;
    }
  }

  return out.join('\n').trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback: section-based reconstruction for graphs without position metadata.
// ─────────────────────────────────────────────────────────────────────────────
function reconstructFromOrder(pfgJson: any): string {
  const { nodes } = pfgJson.graph;

  const SKIP_TYPES = new Set(['end']);

  // Extract document title from the start node (PFG stores it as logic_snippet)
  const startNode = nodes.find((n: any) => n.type === 'start');
  const documentTitle = startNode?.data?.logic_snippet ?? '';

  // Separate heading nodes (section titles) from body nodes
  const headingNodes: any[] = [];
  const bodyNodes: any[] = [];
  for (const node of nodes) {
    if (SKIP_TYPES.has(node.type)) continue;
    if (node.type === 'start') continue; // handled separately as document title
    if (node.data._suppress) continue;
    if (node.data.source_format === 'heading') {
      headingNodes.push(node);
    } else {
      bodyNodes.push(node);
    }
  }

  // Build section → verbatim heading snippet lookup
  const sectionHeadingText = new Map<string, string>();
  for (const h of headingNodes) {
    const sec = h.data.source_section ?? '';
    if (!sectionHeadingText.has(sec)) {
      sectionHeadingText.set(sec, (h.data.logic_snippet ?? '') as string);
    }
  }

  // Group body nodes by source_section
  const sectionMap = new Map<string, any[]>();
  for (const node of bodyNodes) {
    const sec = node.data.source_section ?? '';
    if (!sectionMap.has(sec)) sectionMap.set(sec, []);
    sectionMap.get(sec)!.push(node);
  }
  // Ensure sections that only have a heading node still appear
  for (const h of headingNodes) {
    const sec = h.data.source_section ?? '';
    if (!sectionMap.has(sec)) sectionMap.set(sec, []);
  }

  // Sort sections by minimum node order value (document reading order).
  const sortedSections = [...sectionMap.entries()].sort((a, b) => {
    const minOrd = (sec: string, ns: any[]) => {
      if (ns.length > 0) return Math.min(...ns.map((n: any) => n.data.order ?? 0));
      const h = headingNodes.find((hn: any) => (hn.data.source_section ?? '') === sec);
      return h ? (h.data.order ?? 0) : Infinity;
    };
    return minOrd(a[0], a[1]) - minOrd(b[0], b[1]);
  });

  const out: string[] = [];

  // Emit document title from the start node if present
  if (documentTitle) {
    out.push(documentTitle.startsWith('#') ? documentTitle : `# ${documentTitle}`);
    out.push('');
  }

  for (const [secName, secNodes] of sortedSections) {
    secNodes.sort((a: any, b: any) => (a.data.order ?? 0) - (b.data.order ?? 0));

    // Emit section heading
    if (secName && secName !== 'Frontmatter') {
      const snippet = sectionHeadingText.get(secName) ?? '';
      out.push(snippet.startsWith('#') ? snippet : `## ${snippet || secName}`);
    } else if (secName === 'Frontmatter') {
      const snippet = sectionHeadingText.get(secName) ?? '';
      if (snippet && snippet !== documentTitle) {
        out.push(snippet.startsWith('#') ? snippet : `# ${snippet}`);
      }
    }

    let numberedIdx = 0;
    for (const node of secNodes) {
      const snippet = (node.data.logic_snippet ?? '') as string;
      if (!snippet) continue;

      if (node.data._merge_with_previous && out.length > 0 && out[out.length - 1] !== '') {
        out[out.length - 1] += ' ' + snippet;
        continue;
      }

      const fmt = node.data.source_format ?? 'prose';
      switch (fmt) {
        case 'bulleted_list':
          out.push(snippet.match(/^[-*]\s/) ? snippet : `- ${snippet}`);
          break;
        case 'numbered_list':
          numberedIdx++;
          out.push(snippet.match(/^\d+\.\s/) ? snippet : `${numberedIdx}. ${snippet}`);
          break;
        default:
          out.push(snippet);
          break;
      }
    }

    if (out.length > 0 && out[out.length - 1] !== '') {
      out.push('');
    }
  }

  return out.join('\n').trimEnd();
}

// ─────────────────────────────────────────────────────────────────────────────
// Choose the best reconstruction strategy based on available metadata.
// All data comes from the graph itself (nodes + metadata._source_text).
// The original prompt is NEVER referenced externally.
// ─────────────────────────────────────────────────────────────────────────────
function reconstructPrompt(pfgJson: any): string {
  const sourceText: string = pfgJson.metadata?._source_text ?? '';
  if (!sourceText) return reconstructFromOrder(pfgJson);

  const { nodes } = pfgJson.graph;
  const visible = nodes.filter((n: any) => n.type !== 'end' && !n.data._suppress);
  const withOrigRow = visible.filter((n: any) => n.data._orig_row != null);

  // Use orig-row path when we have reasonable row coverage (≥ 2 nodes matched).
  // sourceText is embedded in the graph metadata, so this is still graph-only.
  if (withOrigRow.length >= 2) {
    return reconstructFromOriginalBase(nodes, sourceText);
  }

  return reconstructFromOrder(pfgJson);
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-sync: reconstruct prompt from graph deterministically (no Gemini call).
// Reconstruction uses ONLY graph data (nodes, edges, metadata._source_text).
// apiKey kept in signature for backward compatibility but is no longer used.
// ─────────────────────────────────────────────────────────────────────────────
export async function reSyncGraphToPrompt(
  agent: AgentConfig,
  _apiKey?: string
): Promise<{ reconstructedPrompt: string; similarity: number; originalPrompt: string }> {
  // If editedPrompt exists (set by applyGraphEdits with correct AST placement),
  // use it directly — it IS the authoritative current prompt.
  const sourceText: string = agent.originalPrompt ?? '';
  if (agent.editedPrompt) {
    const similarity = computeSimilarity(sourceText, agent.editedPrompt);
    return { reconstructedPrompt: agent.editedPrompt, similarity, originalPrompt: sourceText };
  }

  const pfgJson = annotateProseContinuations(
    suppressEmbeddedNodes(
      normalizeDecisionBranchAnnotations(
        normalizeNodeSectionSequences(agentConfigToPfgJson(agent))
      )
    )
  );

  // sourceText comes from the graph metadata (set in agentConfigToPfgJson)
  const metaSourceText: string = pfgJson.metadata?._source_text ?? '';
  const reconstructedPrompt = reconstructPrompt(pfgJson);
  const similarity = computeSimilarity(metaSourceText, reconstructedPrompt);

  return { reconstructedPrompt, similarity, originalPrompt: metaSourceText };
}

// ─────────────────────────────────────────────────────────────────────────────
// Jaccard word-overlap similarity (0–1)
// ─────────────────────────────────────────────────────────────────────────────
function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    );
  const setA = tokenize(a);
  const setB = tokenize(b);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy sync helper (kept for compatibility — no API call)
// ─────────────────────────────────────────────────────────────────────────────
export function graphToPrompt(agent: AgentConfig): string {
  const logicSnippets = agent.nodes
    .filter((n) => n.config?.logicSnippet)
    .sort((a, b) => ((a.config?.order as number) ?? 0) - ((b.config?.order as number) ?? 0))
    .map((n) => n.config?.logicSnippet as string)
    .join(' ');

  return logicSnippets || agent.description || agent.name;
}

export async function validatePromptGraphConsistency(
  originalPrompt: string,
  agent: AgentConfig,
  _apiKey?: string
): Promise<{ isValid: boolean; similarity: number; reconstructedPrompt: string; issues: string[] }> {
  const reconstructedPrompt = graphToPrompt(agent);
  const similarity = computeSimilarity(originalPrompt, reconstructedPrompt);
  const issues: string[] = [];

  const incomingConnections = new Set(agent.connections.map((c) => c.target));
  const outgoingConnections = new Set(agent.connections.map((c) => c.source));

  const startNodes = agent.nodes.filter(
    (n) => (n.type === 'AGENT' || n.type === 'START') && !incomingConnections.has(n.id)
  );
  if (startNodes.length === 0) issues.push('No start node found');
  if (startNodes.length > 1)
    issues.push(`Multiple start nodes: ${startNodes.map((n) => n.label).join(', ')}`);

  const endNodes = agent.nodes.filter((n) => !outgoingConnections.has(n.id));
  if (endNodes.length === 0) issues.push('No end nodes found');

  const connectedNodes = new Set([...incomingConnections, ...outgoingConnections]);
  const orphanedNodes = agent.nodes.filter(
    (n) => !connectedNodes.has(n.id) && n.type !== 'AGENT' && n.type !== 'START'
  );
  if (orphanedNodes.length > 0) {
    issues.push(`Orphaned nodes: ${orphanedNodes.map((n) => n.label).join(', ')}`);
  }

  return {
    isValid: similarity > 0.3 && issues.length === 0,
    similarity,
    reconstructedPrompt,
    issues,
  };
}

