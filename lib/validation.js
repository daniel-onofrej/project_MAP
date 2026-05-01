const PASSIVE_NODE_TYPES = [
    'PERSONA',
    'INPUT',
    'TRIGGER',
    'CONFIG',
    'REFERENCE',
    'LOGGING',
    'GROUP',
    'RULE',
    'TOOL',
    'MEMORY',
    'GUARD',
];
// Helper: map node IDs to their prompt source positions (if available)
function getPromptLines(nodes, nodeIds) {
    const lines = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const id of nodeIds) {
        const node = nodeMap.get(id);
        const pos = node?.config?.source_position;
        if (pos && typeof pos.start_line === 'number' && typeof pos.end_line === 'number') {
            lines.push({ start: pos.start_line, end: pos.end_line });
        }
    }
    return lines.length > 0 ? lines : undefined;
}
export function validateAgentConfig(config) {
    const conflicts = [];
    const nodeMap = new Map(config.nodes.map(n => [n.id, n]));
    // Check for start node (AGENT type with no incoming connections)
    const hasIncoming = new Set();
    config.connections.forEach(conn => {
        // Exclude edges FROM passive nodes — they are contextual/event metadata, not logic flow
        const sourceNode = nodeMap.get(conn.source);
        if (sourceNode && PASSIVE_NODE_TYPES.includes(sourceNode.type))
            return;
        hasIncoming.add(conn.target);
    });
    const startNodes = config.nodes.filter(node => (node.type === 'START' || node.type === 'AGENT') && !hasIncoming.has(node.id));
    if (startNodes.length === 0 && config.nodes.length > 0) {
        conflicts.push({
            id: 'struct-no-start',
            type: 'error',
            message: 'Agent graph must have a start node with no incoming connections',
            nodeIds: [],
            ruleCategory: 'structural',
        });
    }
    else if (startNodes.length > 1) {
        conflicts.push({
            id: 'struct-multi-start',
            type: 'warning',
            message: `Multiple start nodes detected: ${startNodes.map(n => n.label).join(', ')}`,
            nodeIds: startNodes.map(n => n.id),
            ruleCategory: 'structural',
        });
    }
    // Check for end nodes (nodes with no outgoing connections)
    const hasOutgoing = new Set();
    config.connections.forEach(conn => {
        hasOutgoing.add(conn.source);
    });
    const endNodes = config.nodes.filter(node => !hasOutgoing.has(node.id));
    if (endNodes.length === 0 && config.nodes.length > 1) {
        conflicts.push({
            id: 'struct-no-end',
            type: 'warning',
            message: 'Agent graph should have at least one end node (node with no outgoing connections)',
            nodeIds: [],
            ruleCategory: 'structural',
        });
    }
    // Check for dangerous operations
    const dangerousNodes = config.nodes.filter(node => node.isDangerous);
    if (dangerousNodes.length > 0) {
        dangerousNodes.forEach(node => {
            conflicts.push({
                id: 'struct-dangerous',
                type: 'warning',
                message: `⚠️ DANGEROUS OPERATION: ${node.label} - ${node.dangerReason || 'This operation may have significant consequences'}`,
                nodeIds: [node.id],
                ruleCategory: 'structural',
            });
        });
    }
    // Check for duplicate node IDs
    const nodeIdSet = new Set();
    config.nodes.forEach(node => {
        if (nodeIdSet.has(node.id)) {
            conflicts.push({
                id: 'struct-dup-id',
                type: 'error',
                message: `Duplicate node ID: ${node.id}`,
                nodeIds: [node.id],
                ruleCategory: 'structural',
            });
        }
        nodeIdSet.add(node.id);
    });
    // Check for orphaned connections
    const validNodeIds = new Set(config.nodes.map(n => n.id));
    config.connections.forEach(conn => {
        if (!validNodeIds.has(conn.source)) {
            conflicts.push({
                id: 'edge-invalid',
                type: 'error',
                message: `Connection references non-existent source node: ${conn.source}`,
                nodeIds: [conn.source],
                ruleCategory: 'structural',
            });
        }
        if (!validNodeIds.has(conn.target)) {
            conflicts.push({
                id: 'edge-invalid',
                type: 'error',
                message: `Connection references non-existent target node: ${conn.target}`,
                nodeIds: [conn.target],
                ruleCategory: 'structural',
            });
        }
    });
    // DAG Rule: No self-loops — no edge (v, v)
    config.connections.forEach(conn => {
        if (conn.source === conn.target) {
            conflicts.push({
                id: 'dag-self-loop',
                type: 'error',
                message: `Self-loop detected: node "${nodeMap.get(conn.source)?.label || conn.source}" has an edge pointing to itself`,
                nodeIds: [conn.source],
                promptLines: getPromptLines(config.nodes, [conn.source]),
                ruleCategory: 'dag',
            });
        }
    });
    // Check for circular dependencies
    const circularPaths = findCircularDependencies(config);
    circularPaths.forEach(path => {
        const labels = path.map(id => nodeMap.get(id)?.label || id);
        conflicts.push({
            id: 'dag-cycle',
            type: 'error',
            message: `Directed cycle detected: ${labels.join(' → ')} → ${labels[0]}`,
            nodeIds: path,
            promptLines: getPromptLines(config.nodes, path),
            ruleCategory: 'dag',
        });
    });
    // Compute degree maps
    const inDegree = new Map();
    const outDegree = new Map();
    config.nodes.forEach(n => {
        inDegree.set(n.id, 0);
        outDegree.set(n.id, 0);
    });
    config.connections.forEach(conn => {
        if (conn.source === conn.target)
            return;
        // Exclude PASSIVE edges from degree computation
        const sourceNode = nodeMap.get(conn.source);
        const targetNode = nodeMap.get(conn.target);
        if (sourceNode && PASSIVE_NODE_TYPES.includes(sourceNode.type))
            return;
        if (targetNode && PASSIVE_NODE_TYPES.includes(targetNode.type))
            return;
        inDegree.set(conn.target, (inDegree.get(conn.target) || 0) + 1);
        outDegree.set(conn.source, (outDegree.get(conn.source) || 0) + 1);
    });
    const sourceNodes = config.nodes.filter(n => (inDegree.get(n.id) || 0) === 0);
    const sinkNodes = config.nodes.filter(n => (outDegree.get(n.id) || 0) === 0);
    if (sourceNodes.length === 0 && config.nodes.length > 0) {
        conflicts.push({
            id: 'dag-no-source',
            type: 'error',
            message: 'DAG must have at least one source node (a node with no incoming edges)',
            nodeIds: [],
            ruleCategory: 'dag',
        });
    }
    if (sinkNodes.length === 0 && config.nodes.length > 0) {
        conflicts.push({
            id: 'dag-no-sink',
            type: 'error',
            message: 'DAG must have at least one sink node (a node with no outgoing edges)',
            nodeIds: [],
            ruleCategory: 'dag',
        });
    }
    // DAG Rule: Topological sortability
    {
        const kahnInDegree = new Map();
        config.nodes.forEach(n => kahnInDegree.set(n.id, 0));
        const adjList = new Map();
        config.connections.forEach(conn => {
            if (conn.source === conn.target)
                return;
            const sourceNode = nodeMap.get(conn.source);
            const targetNode = nodeMap.get(conn.target);
            // Skip edges involving passive nodes for topological sort
            if (sourceNode && PASSIVE_NODE_TYPES.includes(sourceNode.type))
                return;
            if (targetNode && PASSIVE_NODE_TYPES.includes(targetNode.type))
                return;
            kahnInDegree.set(conn.target, (kahnInDegree.get(conn.target) || 0) + 1);
            if (!adjList.has(conn.source))
                adjList.set(conn.source, []);
            adjList.get(conn.source).push(conn.target);
        });
        const queue = [];
        kahnInDegree.forEach((deg, id) => { if (deg === 0)
            queue.push(id); });
        let sortedCount = 0;
        while (queue.length > 0) {
            const node = queue.shift();
            sortedCount++;
            for (const neighbor of (adjList.get(node) || [])) {
                const newDeg = (kahnInDegree.get(neighbor) || 1) - 1;
                kahnInDegree.set(neighbor, newDeg);
                if (newDeg === 0)
                    queue.push(neighbor);
            }
        }
        if (sortedCount !== config.nodes.length && config.nodes.length > 0) {
            const unsorted = config.nodes
                .filter(n => (kahnInDegree.get(n.id) || 0) > 0)
                .map(n => n.id);
            conflicts.push({
                id: 'dag-topo-fail',
                type: 'warning',
                message: `Graph is not topologically sortable — ${config.nodes.length - sortedCount} node(s) are involved in cycles or have unresolvable dependencies`,
                nodeIds: unsorted,
                promptLines: getPromptLines(config.nodes, unsorted),
                ruleCategory: 'dag',
            });
        }
    }
    // DAG Rule: Reachability from sources
    if (sourceNodes.length > 0) {
        const reachable = new Set();
        const bfsQueue = sourceNodes.map(n => n.id);
        bfsQueue.forEach(id => reachable.add(id));
        while (bfsQueue.length > 0) {
            const current = bfsQueue.shift();
            config.connections.forEach(conn => {
                if (conn.source === current && !reachable.has(conn.target)) {
                    reachable.add(conn.target);
                    bfsQueue.push(conn.target);
                }
            });
        }
        const unreachable = config.nodes.filter(n => !reachable.has(n.id));
        unreachable.forEach(node => {
            conflicts.push({
                id: 'dag-unreachable',
                type: 'warning',
                message: `Node "${node.label}" is unreachable from any source node`,
                nodeIds: [node.id],
                promptLines: getPromptLines(config.nodes, [node.id]),
                ruleCategory: 'dag',
            });
        });
    }
    // DAG Rule: Path to sink
    if (sinkNodes.length > 0) {
        const canReachSink = new Set();
        const revQueue = sinkNodes.map(n => n.id);
        revQueue.forEach(id => canReachSink.add(id));
        while (revQueue.length > 0) {
            const current = revQueue.shift();
            config.connections.forEach(conn => {
                if (conn.target === current && !canReachSink.has(conn.source)) {
                    canReachSink.add(conn.source);
                    revQueue.push(conn.source);
                }
            });
        }
        const noPathToSink = config.nodes.filter(n => !canReachSink.has(n.id));
        noPathToSink.forEach(node => {
            conflicts.push({
                id: 'dag-no-path-sink',
                type: 'warning',
                message: `Node "${node.label}" has no path to any sink node`,
                nodeIds: [node.id],
                promptLines: getPromptLines(config.nodes, [node.id]),
                ruleCategory: 'dag',
            });
        });
    }
    // DAG Rule: Disconnected components (Union-Find)
    if (config.nodes.length > 1) {
        const parent = new Map();
        config.nodes.forEach(n => parent.set(n.id, n.id));
        function find(x) {
            while (parent.get(x) !== x) {
                parent.set(x, parent.get(parent.get(x)));
                x = parent.get(x);
            }
            return x;
        }
        function union(a, b) {
            parent.set(find(a), find(b));
        }
        config.connections.forEach(conn => {
            if (parent.has(conn.source) && parent.has(conn.target)) {
                union(conn.source, conn.target);
            }
        });
        const components = new Map();
        config.nodes.forEach(n => {
            const root = find(n.id);
            if (!components.has(root))
                components.set(root, []);
            components.get(root).push(n.id);
        });
        if (components.size > 1) {
            const sizes = [...components.values()].map(c => c.length).sort((a, b) => b - a);
            conflicts.push({
                id: 'dag-disconnected',
                type: 'warning',
                message: `Graph has ${components.size} disconnected components (sizes: ${sizes.join(', ')})`,
                nodeIds: [...components.values()].flatMap(c => c.length < sizes[0] ? c : []),
                ruleCategory: 'dag',
            });
        }
    }
    // DAG Rule: Duplicate edges
    const edgeKeys = new Map();
    config.connections.forEach(conn => {
        const key = `${conn.source}->${conn.target}`;
        if (!edgeKeys.has(key))
            edgeKeys.set(key, []);
        edgeKeys.get(key).push(conn.id);
    });
    edgeKeys.forEach((ids, key) => {
        if (ids.length > 1) {
            const [src, tgt] = key.split('->');
            conflicts.push({
                id: 'dag-dup-edge',
                type: 'warning',
                message: `Duplicate edges: ${ids.length} edges from "${nodeMap.get(src)?.label || src}" to "${nodeMap.get(tgt)?.label || tgt}"`,
                nodeIds: [src, tgt],
                promptLines: getPromptLines(config.nodes, [src, tgt]),
                ruleCategory: 'dag',
            });
        }
    });
    // INFO: Handshaking lemma sanity check
    {
        let degreeSum = 0;
        config.nodes.forEach(n => {
            degreeSum += (inDegree.get(n.id) || 0) + (outDegree.get(n.id) || 0);
        });
        const validEdges = config.connections.filter(conn => {
            if (conn.source === conn.target)
                return false;
            const sourceNode = nodeMap.get(conn.source);
            const targetNode = nodeMap.get(conn.target);
            if (sourceNode && PASSIVE_NODE_TYPES.includes(sourceNode.type))
                return false;
            if (targetNode && PASSIVE_NODE_TYPES.includes(targetNode.type))
                return false;
            return true;
        }).length;
        if (degreeSum !== 2 * validEdges) {
            conflicts.push({
                id: 'dag-handshake',
                type: 'info',
                message: `Handshaking lemma inconsistency: degree sum (${degreeSum}) ≠ 2 × relevant flow edges (${2 * validEdges}).`,
                nodeIds: [],
                ruleCategory: 'dag',
            });
        }
    }
    // INFO: High-degree nodes
    if (config.nodes.length > 3) {
        const avgDegree = config.connections.length * 2 / config.nodes.length;
        config.nodes.forEach(node => {
            const totalDeg = (inDegree.get(node.id) || 0) + (outDegree.get(node.id) || 0);
            if (totalDeg > avgDegree * 2 && totalDeg >= 6) {
                conflicts.push({
                    id: 'dag-high-degree',
                    type: 'info',
                    message: `Node "${node.label}" has high connectivity (${totalDeg} edges, average is ${avgDegree.toFixed(1)}). Consider splitting into sub-nodes.`,
                    nodeIds: [node.id],
                    promptLines: getPromptLines(config.nodes, [node.id]),
                    ruleCategory: 'dag',
                });
            }
        });
    }
    return conflicts;
}
function findCircularDependencies(config) {
    const nodeMap = new Map();
    config.nodes.forEach(n => nodeMap.set(n.id, n));
    const graph = new Map();
    config.connections.forEach(conn => {
        if (conn.source === conn.target)
            return;
        const sourceNode = nodeMap.get(conn.source);
        const targetNode = nodeMap.get(conn.target);
        // Skip edges involving passive nodes for cycle detection
        if (sourceNode && PASSIVE_NODE_TYPES.includes(sourceNode.type))
            return;
        if (targetNode && PASSIVE_NODE_TYPES.includes(targetNode.type))
            return;
        if (!graph.has(conn.source))
            graph.set(conn.source, []);
        graph.get(conn.source).push(conn.target);
    });
    const cycles = [];
    const visited = new Set();
    const recursionStack = new Set();
    const currentPath = [];
    function dfs(node) {
        visited.add(node);
        recursionStack.add(node);
        currentPath.push(node);
        const neighbors = graph.get(node) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs(neighbor);
            }
            else if (recursionStack.has(neighbor)) {
                const cycleStart = currentPath.indexOf(neighbor);
                cycles.push(currentPath.slice(cycleStart));
            }
        }
        currentPath.pop();
        recursionStack.delete(node);
    }
    config.nodes.forEach(node => {
        if (!visited.has(node.id)) {
            dfs(node.id);
        }
    });
    return cycles;
}
//# sourceMappingURL=validation.js.map