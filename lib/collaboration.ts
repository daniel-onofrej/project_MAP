export interface Comment {
  id: string;
  nodeId?: string;
  content: string;
  author: string;
  timestamp: string;
  resolved: boolean;
}

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  cursorPosition?: { x: number; y: number };
  selectedNodeId?: string;
}

export function generateCollaboratorColor(id: string): string {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
  ];
  
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export function addComment(
  comments: Comment[],
  content: string,
  author: string,
  nodeId?: string
): Comment[] {
  const newComment: Comment = {
    id: `comment-${Date.now()}`,
    nodeId,
    content,
    author,
    timestamp: new Date().toISOString(),
    resolved: false,
  };
  
  return [...comments, newComment];
}

export function resolveComment(comments: Comment[], commentId: string): Comment[] {
  return comments.map(c =>
    c.id === commentId ? { ...c, resolved: true } : c
  );
}

export function getNodeComments(comments: Comment[], nodeId: string): Comment[] {
  return comments.filter(c => c.nodeId === nodeId && !c.resolved);
}
