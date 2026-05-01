'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2, Undo2, FlaskConical, Pencil } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import type { AgentConfig } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatStats {
  addedNodes: number;
  addedConnections: number;
  removedNodes: number;
  removedConnections: number;
  updatedNodes: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  mode: 'edit' | 'chat';   // which panel mode sent this message
  stats?: ChatStats;
  formatInfo?: {
    inputFormat: 'json' | 'json-compact';
    outputFormat: 'json' | 'yaml' | 'json-compact';
    rawOutputChars: number;
  };
  error?: string;
  isPending?: boolean;      // true while the edit awaits Accept/Decline
}

export interface GraphChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentAgent: AgentConfig | null;
  apiKey?: string;
  onApplyEdit: (message: string, useExperimental?: boolean) => Promise<{
    summary: string;
    stats: ChatStats;
    usedPartialGraph?: boolean;
    detectedNodeIds?: string[];
    formatInfo?: {
      inputFormat: 'json' | 'json-compact';
      outputFormat: 'json' | 'yaml' | 'json-compact';
      rawOutputChars: number;
    }
  }>;
  onAskQuestion: (message: string) => Promise<{ answer: string }>;
  hasPendingEdit: boolean;
  onAcceptEdit: () => void;
  onDeclineEdit: () => void;
  canUndo: boolean;
  onUndo: () => void;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  /** Currently selected node on the canvas — used by experimental partial-graph mode. */
  selectedNodeId?: string | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export function GraphChatPanel({
  isOpen,
  onClose,
  currentAgent,
  apiKey,
  onApplyEdit,
  onAskQuestion,
  hasPendingEdit,
  onAcceptEdit,
  onDeclineEdit,
  canUndo,
  onUndo,
  messages,
  onMessagesChange,
  selectedNodeId,
}: GraphChatPanelProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [experimentalMode, setExperimentalMode] = useState(false);
  const [chatMode, setChatMode] = useState<'edit' | 'chat'>('edit');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Keep a ref to always read latest messages without stale closure issues
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Slash command responses (local, no API call) ─────────────────────────

  const SLASH_COMMANDS: Record<string, string> = {
    '/help': `MAP Graph Chat — available commands

/help — show this message
/mcp  — learn about the MCP Server integration

Graph edits (natural language):
• Add a node — "Add a GUARD node before the output"
• Remove a node — "Remove the ToxicityFilter node and rewire"
• Relabel — "Change 'Order Over 90 Days?' to 'Late Claim?'"
• Add connections — "Connect IntentClassifier to Escalation"
• Add a rule — "Add rule: if score < 0.5 → reject"
• Add escalation — "Add an escalation path if amount > $500"

Tips:
• Enable ⚗ Experimental mode to edit around a selected node (saves tokens)
• Press Ctrl+Z or the undo button to revert any edit
• Press Ctrl+Enter to send`,

    '/mcp': `MCP Server (Work in Progress ⚠️)

Lets Claude Desktop, Cursor, or any MCP client control MAP directly.

Start the server:
  cd mcp-server && npm run dev
  Runs at http://localhost:3100

Available tools (13):
  create_agent_from_prompt
  list_agents / get_agent / update_agent / delete_agent
  add_node / remove_node
  add_connection / remove_connection
  run_agent
  validate_agent / analyze_conflicts / get_complexity_metrics
  resync_graph_to_prompt / export_agent / import_agent

Connect: open Settings → MCP Server tab for the config snippet,
or click the 🔌 button in the toolbar.

⚠️ Functionality not guaranteed — early-stage feature.`,
  };

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || hasPendingEdit) return;

    const userMsgId = `msg-${Date.now()}`;
    const assistantMsgId = `msg-${Date.now() + 1}`;

    // Slash commands only work in edit mode
    if (chatMode === 'edit') {
      const slashKey = trimmed.split(' ')[0].toLowerCase();
      if (SLASH_COMMANDS[slashKey]) {
        onMessagesChange([
          ...messagesRef.current,
          { id: userMsgId, role: 'user' as const, content: trimmed, timestamp: new Date(), mode: 'edit' },
          { id: assistantMsgId, role: 'assistant' as const, content: SLASH_COMMANDS[slashKey], timestamp: new Date(), mode: 'edit' },
        ]);
        setInput('');
        return;
      }
    }

    const withUserMsg = [
      ...messagesRef.current,
      { id: userMsgId, role: 'user' as const, content: trimmed, timestamp: new Date(), mode: chatMode },
    ];
    onMessagesChange(withUserMsg);
    setInput('');
    setIsLoading(true);

    try {
      if (chatMode === 'chat') {
        const { answer } = await onAskQuestion(trimmed);
        onMessagesChange([
          ...messagesRef.current,
          { id: assistantMsgId, role: 'assistant' as const, content: answer, timestamp: new Date(), mode: 'chat' },
        ]);
      } else {
        const { summary, stats, usedPartialGraph, detectedNodeIds, formatInfo } = await onApplyEdit(trimmed, experimentalMode);
        let prefix = '';
        if (usedPartialGraph) {
          const detectedInfo = detectedNodeIds?.length
            ? ` (auto-detected ${detectedNodeIds.length} node${detectedNodeIds.length > 1 ? 's' : ''})`
            : ' (selected node)';
          prefix = `⚡${detectedInfo} `;
        }
        onMessagesChange([
          ...messagesRef.current,
          { id: assistantMsgId, role: 'assistant' as const, content: prefix + summary, timestamp: new Date(), mode: 'edit', stats, formatInfo, isPending: true },
        ]);
      }
    } catch (err) {
      onMessagesChange([
        ...messagesRef.current,
        {
          id: assistantMsgId,
          role: 'assistant' as const,
          content: 'Failed.',
          timestamp: new Date(),
          mode: chatMode,
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, hasPendingEdit, chatMode, onApplyEdit, onAskQuestion, experimentalMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  if (!isOpen) return null;

  const hasApiKey = !!apiKey;
  const hasAgent = !!currentAgent;
  const userCount = messages.filter(m => m.role === 'user').length;

  const editExamples = [
    '/help',
    '/mcp',
    'Add a rule: order over 90 days AND unopened → store credit',
    'Add an escalation path if refund amount exceeds $500',
  ];

  const chatExamples = [
    'What does this graph do?',
    'Why does X connect to Y?',
    'How many decision nodes are there?',
    'Explain the retry loop',
  ];

  return (
    <div
      className="fixed right-4 bottom-4 top-16 w-80 z-50 flex flex-col rounded-xl border border-border bg-background shadow-2xl shadow-black/20 overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 5rem)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Graph Chat</span>
          {userCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {userCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {chatMode === 'edit' && (
            <>
              <Button
                size="icon"
                variant={experimentalMode ? 'default' : 'ghost'}
                className={`h-7 w-7 ${experimentalMode ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}`}
                onClick={() => setExperimentalMode(v => !v)}
                title={experimentalMode
                  ? 'Experimental: partial graph mode ON — select a node to send only its neighborhood (saves tokens)'
                  : 'Click to enable experimental partial graph mode'}
              >
                <FlaskConical className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={onUndo}
                disabled={!canUndo}
                title="Undo last graph edit"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onClose}
            title="Close chat panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Mode toggle strip */}
      <div className="flex items-center gap-1 p-1 border-b border-border bg-muted/20 shrink-0">
        <button
          onClick={() => setChatMode('edit')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1 px-2 rounded-md transition-all ${chatMode === 'edit'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
        <button
          onClick={() => setChatMode('chat')}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-1 px-2 rounded-md transition-all ${chatMode === 'chat'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          <MessageSquare className="h-3 w-3" />
          Chat
        </button>
      </div>

      {/* Experimental mode banner (edit mode only) */}
      {chatMode === 'edit' && experimentalMode && hasAgent && (
        <div className="px-4 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 border-b border-amber-500/20 shrink-0 flex items-center gap-1.5">
          <FlaskConical className="h-3 w-3 shrink-0" />
          {selectedNodeId
            ? <>Partial graph — editing around selected node</>
            : <>Partial graph — auto-detects relevant nodes from your message</>
          }
        </div>
      )}

      {/* Warning banners */}
      {!hasAgent && (
        <div className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          No agent loaded. Create or select an agent first.
        </div>
      )}
      {hasAgent && !hasApiKey && (
        <div className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          No API key configured. Go to Settings to add your Gemini key.
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-8 select-none">
            <MessageSquare className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {chatMode === 'chat'
                ? 'Ask anything about this graph.'
                : 'Describe changes to make to the graph, or type a command.'}
            </p>
            <div className="text-left space-y-1.5 px-2">
              {(chatMode === 'edit' ? editExamples : chatExamples).map(example => (
                <button
                  key={example}
                  onClick={() => setInput(example)}
                  className="w-full text-left text-[11px] text-muted-foreground/70 hover:text-foreground bg-muted/30 hover:bg-muted/60 rounded-lg px-3 py-2 leading-snug transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-xs leading-relaxed">
                {msg.content}
              </div>
            ) : (
              <div
                className={`max-w-[92%] rounded-2xl rounded-tl-sm px-3 py-2 text-xs leading-relaxed border ${msg.error
                    ? 'bg-destructive/10 border-destructive/20 text-destructive'
                    : 'bg-muted/60 border-border text-foreground'
                  }`}
              >
                {msg.error ? (
                  <>
                    <p className="font-medium mb-1">Failed</p>
                    <p className="text-[11px] opacity-80 break-words">{msg.error}</p>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.stats && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {msg.stats.addedNodes > 0 && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 font-mono">
                            +{msg.stats.addedNodes} node{msg.stats.addedNodes !== 1 ? 's' : ''}
                          </span>
                        )}
                        {msg.stats.addedConnections > 0 && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 font-mono">
                            +{msg.stats.addedConnections} edge{msg.stats.addedConnections !== 1 ? 's' : ''}
                          </span>
                        )}
                        {msg.stats.removedNodes > 0 && (
                          <span className="text-[10px] text-red-500 dark:text-red-400 font-mono">
                            -{msg.stats.removedNodes} node{msg.stats.removedNodes !== 1 ? 's' : ''}
                          </span>
                        )}
                        {msg.stats.removedConnections > 0 && (
                          <span className="text-[10px] text-red-500 dark:text-red-400 font-mono">
                            -{msg.stats.removedConnections} edge{msg.stats.removedConnections !== 1 ? 's' : ''}
                          </span>
                        )}
                        {msg.stats.updatedNodes > 0 && (
                          <span className="text-[10px] text-blue-500 dark:text-blue-400 font-mono">
                            ~{msg.stats.updatedNodes} updated
                          </span>
                        )}
                      </div>
                    )}
                    {msg.formatInfo && (
                      <div className="flex flex-wrap gap-1 mt-1.5 opacity-60">
                        <span className="text-[9px] bg-muted-foreground/10 px-1 py-0.5 rounded leading-none">
                          In: {msg.formatInfo.inputFormat === 'json-compact' ? 'Compact' : 'JSON'}
                        </span>
                        <span className="text-[9px] bg-muted-foreground/10 px-1 py-0.5 rounded leading-none">
                          Out: {msg.formatInfo.outputFormat === 'json-compact' ? 'Compact' : msg.formatInfo.outputFormat === 'yaml' ? 'YAML' : 'JSON'}
                        </span>
                        <span className="text-[9px] bg-muted-foreground/10 px-1 py-0.5 rounded leading-none">
                          {msg.formatInfo.rawOutputChars} chars
                        </span>
                      </div>
                    )}
                    {/* Accept / Decline for pending edits */}
                    {msg.isPending && (
                      <div className="flex gap-2 mt-3 pt-2 border-t border-border/50">
                        <button
                          onClick={() => {
                            onAcceptEdit();
                            onMessagesChange(messagesRef.current.map(m =>
                              m.id === msg.id ? { ...m, isPending: false } : m
                            ));
                          }}
                          className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-colors"
                        >
                          ✓ Accept
                        </button>
                        <button
                          onClick={() => {
                            onDeclineEdit();
                            onMessagesChange(messagesRef.current.map(m =>
                              m.id === msg.id ? { ...m, isPending: false } : m
                            ));
                          }}
                          className="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                        >
                          ✗ Decline
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 px-1">
              <span className="text-[10px] text-muted-foreground/40">
                {msg.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {msg.role === 'user' && (
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${msg.mode === 'chat'
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                  }`}>
                  {msg.mode === 'chat' ? 'Chat' : 'Edit'}
                </span>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-tl-sm bg-muted/60 border border-border px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border p-3 shrink-0 bg-background">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={chatMode === 'chat'
              ? 'Ask anything about this graph… (Ctrl+Enter)'
              : 'Describe a graph edit or type /help… (Ctrl+Enter)'}
            disabled={isLoading || !hasAgent || !hasApiKey || hasPendingEdit}
            className="min-h-[60px] max-h-32 resize-none text-xs leading-relaxed"
            rows={2}
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || !hasAgent || !hasApiKey || hasPendingEdit}
            className="h-9 w-9 shrink-0"
            title="Send (Ctrl+Enter)"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 mt-1.5 text-right">
          {hasPendingEdit ? 'Accept or Decline the pending edit first' : 'Ctrl+Enter to send'}
        </p>
      </div>
    </div>
  );
}
