'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Textarea } from '../ui/textarea';
import { MessageSquare, Check, AtSign, Bell } from 'lucide-react';
import type { Comment } from '@/lib/collaboration';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type UserSuggestion = { id: string; name: string; email: string };

interface CommentsPanelProps {
  comments: Comment[];
  selectedNodeId?: string;
  currentUser: string;
  onAddComment: (content: string, nodeId?: string, mentions?: string[]) => void;
  onResolveComment: (commentId: string) => void;
}

export function CommentsPanel({
  comments,
  selectedNodeId,
  currentUser,
  onAddComment,
  onResolveComment,
}: CommentsPanelProps) {
  const [newComment, setNewComment] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<UserSuggestion[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract @mentions from content
  function extractMentions(text: string): string[] {
    return Array.from(text.matchAll(/@(\w[\w.]*)/g)).map(m => m[1]);
  }

  // Search users when @ is typed
  async function searchUsers(q: string) {
    if (!q) { setMentionSuggestions([]); return }
    const res = await fetch(`/api/users?search=${encodeURIComponent(q)}`)
    if (res.ok) {
      const data = await res.json()
      setMentionSuggestions(data.users ?? [])
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setNewComment(val)

    // Detect @ trigger — find the last @ before cursor
    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const atMatch = before.match(/@(\w*)$/)

    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionIndex(0)
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
      searchTimeout.current = setTimeout(() => searchUsers(atMatch[1]), 200)
    } else {
      setMentionQuery(null)
      setMentionSuggestions([])
    }
  }

  function applyMention(user: UserSuggestion) {
    if (!textareaRef.current) return
    const cursor = textareaRef.current.selectionStart
    const before = newComment.slice(0, cursor)
    const after = newComment.slice(cursor)
    // Replace the @query with @name
    const replaced = before.replace(/@(\w*)$/, `@${user.name.replace(/\s+/g, '')} `)
    setNewComment(replaced + after)
    setMentionQuery(null)
    setMentionSuggestions([])
    // Restore focus
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        const pos = replaced.length
        textareaRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Navigate mention dropdown
    if (mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyMention(mentionSuggestions[mentionIndex])
        return
      }
      if (e.key === 'Escape') { setMentionQuery(null); setMentionSuggestions([]); return }
    }

    // Submit on Ctrl/Cmd+Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleAddComment()
    }
  }

  function handleAddComment() {
    if (!newComment.trim()) return
    const mentions = extractMentions(newComment)
    onAddComment(newComment, selectedNodeId, mentions)

    // Toast notification — tag mentioned users
    if (mentions.length > 0) {
      toast(`Comment added`, {
        description: `Mentioned: ${mentions.map(m => `@${m}`).join(', ')}`,
        icon: <Bell className="h-4 w-4" />,
      })
    } else {
      toast.success('Comment added')
    }

    setNewComment('')
    setMentionQuery(null)
    setMentionSuggestions([])
  }

  const filteredComments = comments.filter(c => {
    if (!showResolved && c.resolved) return false
    if (selectedNodeId) return c.nodeId === selectedNodeId
    return true
  })

  // Highlight @mentions in comment text
  function renderContent(text: string) {
    const parts = text.split(/(@\w[\w.]*)/)
    return parts.map((part, i) =>
      part.startsWith('@')
        ? <span key={i} className="text-primary font-medium">{part}</span>
        : <span key={i}>{part}</span>
    )
  }

  return (
    <div className="flex flex-col h-full bg-sidebar border-l border-sidebar-border">
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-sidebar-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments
          </h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs"
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? 'Hide' : 'Show'} Resolved
          </Button>
        </div>

        {selectedNodeId && (
          <Badge variant="secondary" className="text-xs">
            Node selected
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        {filteredComments.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {selectedNodeId
              ? 'No comments on this node yet'
              : 'No comments yet. Add one to start collaborating.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredComments.map((comment) => (
              <div
                key={comment.id}
                className={cn(
                  'p-3 rounded-md border',
                  comment.resolved ? 'bg-muted/50 opacity-60' : 'bg-card'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[10px]">
                        {comment.author?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{comment.author}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(comment.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {!comment.resolved && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => onResolveComment(comment.id)}
                      title="Resolve"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {renderContent(comment.content)}
                </p>
                {comment.resolved && (
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    Resolved
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input area with @mention autocomplete */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={newComment}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={`Add a comment… (Ctrl+Enter to send)\nType @ to mention someone`}
            className="text-xs min-h-[72px] resize-none pr-7"
          />
          <AtSign className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />

          {/* @mention dropdown */}
          {mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg overflow-hidden z-50">
              {mentionSuggestions.map((u, idx) => (
                <button
                  key={u.id}
                  onMouseDown={(e) => { e.preventDefault(); applyMention(u) }}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors',
                    idx === mentionIndex && 'bg-accent'
                  )}
                >
                  <Avatar className="h-5 w-5 shrink-0">
                    <AvatarFallback className="text-[9px]">{u.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{u.name}</span>
                  <span className="text-muted-foreground truncate">{u.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          size="sm"
          onClick={handleAddComment}
          disabled={!newComment.trim()}
          className="w-full"
        >
          <MessageSquare className="h-3 w-3 mr-2" />
          Add Comment
        </Button>
      </div>
    </div>
  )
}
