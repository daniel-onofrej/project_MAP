import type { NodeData, Connection } from '../types';

export function applyForceDirectedLayout(
  nodes: NodeData[],
  connections: Connection[],
  iterations: number = 50
): NodeData[] {
  if (nodes.length === 0) return nodes;

  const width = 800;
  const height = 600;
  const nodeRadius = 50;
  const repulsionForce = 5000;
  const attractionForce = 0.01;
  const damping = 0.85;

  // Initialize velocities
  const velocities = nodes.map(() => ({ x: 0, y: 0 }));

  // Clone nodes with initial random positions if they don't have positions
  let layoutNodes = nodes.map((node) => ({
    ...node,
    position: node.position.x === 0 && node.position.y === 0
      ? { x: Math.random() * width, y: Math.random() * height }
      : { ...node.position },
  }));

  for (let iter = 0; iter < iterations; iter++) {
    // Calculate forces
    const forces = layoutNodes.map(() => ({ x: 0, y: 0 }));

    // Repulsion between all nodes
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const dx = layoutNodes[j].position.x - layoutNodes[i].position.x;
        const dy = layoutNodes[j].position.y - layoutNodes[i].position.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        const force = repulsionForce / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        forces[i].x -= fx;
        forces[i].y -= fy;
        forces[j].x += fx;
        forces[j].y += fy;
      }
    }

    // Attraction along edges
    connections.forEach((conn) => {
      const sourceIdx = layoutNodes.findIndex((n) => n.id === conn.source);
      const targetIdx = layoutNodes.findIndex((n) => n.id === conn.target);

      if (sourceIdx >= 0 && targetIdx >= 0) {
        const dx = layoutNodes[targetIdx].position.x - layoutNodes[sourceIdx].position.x;
        const dy = layoutNodes[targetIdx].position.y - layoutNodes[sourceIdx].position.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        const force = distance * attractionForce;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        forces[sourceIdx].x += fx;
        forces[sourceIdx].y += fy;
        forces[targetIdx].x -= fx;
        forces[targetIdx].y -= fy;
      }
    });

    // Apply forces with damping
    layoutNodes = layoutNodes.map((node, i) => {
      velocities[i].x = (velocities[i].x + forces[i].x) * damping;
      velocities[i].y = (velocities[i].y + forces[i].y) * damping;

      return {
        ...node,
        position: {
          x: Math.max(nodeRadius, Math.min(width - nodeRadius, node.position.x + velocities[i].x)),
          y: Math.max(nodeRadius, Math.min(height - nodeRadius, node.position.y + velocities[i].y)),
        },
      };
    });
  }

  return layoutNodes;
}
