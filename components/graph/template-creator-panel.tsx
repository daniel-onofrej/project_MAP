'use client';

import { useState, useCallback } from 'react';
import {
  X, Sparkles, MousePointer2, Copy, Check, Loader2, Wand2,
  Info, AlertCircle, Tag, FileText,
} from 'lucide-react';
import { NODE_COLORS, NODE_ICONS, type NodeType } from '@/lib/types';
import type { NodeData } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Placeholder {
  token: string;
  hint: string;
}

interface AiExtractResult {
  name: string;
  description: string;
  category: string;
  complexity: string;
  promptTemplate: string;
  placeholders: Placeholder[];
}

interface TemplateCreatorPanelProps {
  // Manual tab
  selectedNodeIds: string[];
  allNodes: NodeData[];
  promptFragment: string;
  onNodeDeselect: (id: string) => void;
  // AI tab
  originalPrompt?: string;
  apiKey?: string;
  onNodesAiSelect: (ids: string[], name: string, desc: string) => void;
  // Save / close
  onSave: (overrideTemplate?: string) => void;
  onClose: () => void;
}

type TabId = 'manual' | 'ai';

export function TemplateCreatorPanel({
  selectedNodeIds,
  allNodes,
  promptFragment,
  originalPrompt,
  apiKey,
  onNodeDeselect,
  onNodesAiSelect,
  onSave,
  onClose,
}: TemplateCreatorPanelProps) {
  const [tab, setTab] = useState<TabId>('manual');
  const [copied, setCopied] = useState(false);

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiResult, setAiResult] = useState<AiExtractResult | null>(null);

  const selectedNodes = allNodes.filter((n) => selectedNodeIds.includes(n.id));

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, []);

  // AI Extract — works on full prompt, no node selection needed
  const handleAiExtract = useCallback(async () => {
    if (!originalPrompt?.trim() && allNodes.length === 0) return;
    setAiLoading(true);
    setAiError('');
    setAiResult(null);

    try {
      const res = await fetch('/api/patterns/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: allNodes.map((n) => ({
            type: n.type,
            label: n.label,
            description: n.description,
          })),
          fullPrompt: originalPrompt,
          apiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed');
      setAiResult(data.pattern);
      // Pre-fill save dialog with AI meta
      onNodesAiSelect(selectedNodeIds, data.pattern.name ?? '', data.pattern.description ?? '');
    } catch (e: any) {
      setAiError(e.message ?? 'Something went wrong');
    } finally {
      setAiLoading(false);
    }
  }, [allNodes, originalPrompt, apiKey, selectedNodeIds, onNodesAiSelect]);

  return (
    <div className="h-full flex flex-col bg-background border-l border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-indigo-500/20 flex items-center justify-center">
            <Wand2 className="h-3 w-3 text-indigo-400" />
          </div>
          <span className="text-sm font-semibold text-foreground">Create Template</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        <TabBtn active={tab === 'manual'} icon={<MousePointer2 className="h-3 w-3" />} label="Select Nodes" onClick={() => setTab('manual')} />
        <TabBtn active={tab === 'ai'} icon={<Sparkles className="h-3 w-3" />} label="AI Extract" onClick={() => setTab('ai')} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'manual' ? (
          <ManualTab
            selectedNodes={selectedNodes}
            promptFragment={promptFragment}
            copied={copied}
            onNodeDeselect={onNodeDeselect}
            onCopy={handleCopy}
          />
        ) : (
          <AiExtractTab
            hasPrompt={!!originalPrompt?.trim() || allNodes.length > 0}
            nodeCount={allNodes.length}
            aiLoading={aiLoading}
            aiError={aiError}
            aiResult={aiResult}
            copied={copied}
            onExtract={handleAiExtract}
            onCopy={handleCopy}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border shrink-0 space-y-2">
        {tab === 'ai' ? (
          aiResult ? (
            <button
              onClick={() => onSave(aiResult.promptTemplate)}
              className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="h-3 w-3" />
              Save Extracted Template
            </button>
          ) : null
        ) : (
          <button
            onClick={() => onSave()}
            disabled={selectedNodeIds.length < 2}
            className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <Wand2 className="h-3 w-3" />
            Save as Template
            {selectedNodeIds.length > 0 && (
              <span className="ml-1 bg-indigo-400/30 text-indigo-200 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">
                {selectedNodeIds.length} nodes
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2',
        active
          ? 'text-indigo-400 border-indigo-500 bg-indigo-500/5'
          : 'text-muted-foreground border-transparent hover:text-foreground',
      )}
    >
      {icon}{label}
    </button>
  );
}

// ── Manual Tab ────────────────────────────────────────────────────────────────
function ManualTab({
  selectedNodes, promptFragment, copied, onNodeDeselect, onCopy,
}: {
  selectedNodes: NodeData[];
  promptFragment: string;
  copied: boolean;
  onNodeDeselect: (id: string) => void;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="px-4 py-3 space-y-4">
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-indigo-500/8 border border-indigo-500/20">
        <Info className="h-3 w-3 text-indigo-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-indigo-300/80 leading-relaxed">
          Click nodes on the canvas to select them. The prompt preview updates live.
          For a fully auto-extracted template, use the <strong>AI Extract</strong> tab.
        </p>
      </div>

      {/* Node chips */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Selected Nodes</span>
          {selectedNodes.length > 0 && (
            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/15 px-1.5 py-0.5 rounded-full">
              {selectedNodes.length}
            </span>
          )}
        </div>

        {selectedNodes.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <MousePointer2 className="h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No nodes selected yet</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
            {selectedNodes.map((node) => {
              const color = NODE_COLORS[node.type as NodeType] ?? '#6366f1';
              const icon = NODE_ICONS[node.type as NodeType] ?? '◉';
              return (
                <div
                  key={node.id}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs group"
                  style={{ backgroundColor: `${color}12`, border: `1px solid ${color}28` }}
                >
                  <span className="text-sm leading-none shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{node.label}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color }}>{node.type}</div>
                  </div>
                  <button
                    onClick={() => onNodeDeselect(node.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {promptFragment && (
        <FormattedPromptPreview text={promptFragment} label="Prompt Preview" copied={copied} onCopy={onCopy} />
      )}
    </div>
  );
}

// ── AI Extract Tab ────────────────────────────────────────────────────────────
function AiExtractTab({
  hasPrompt, nodeCount, aiLoading, aiError, aiResult, copied, onExtract, onCopy,
}: {
  hasPrompt: boolean;
  nodeCount: number;
  aiLoading: boolean;
  aiError: string;
  aiResult: AiExtractResult | null;
  copied: boolean;
  onExtract: () => void;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="px-4 py-3 space-y-4">
      {/* What this does */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-violet-500/8 border border-violet-500/20">
        <Sparkles className="h-3 w-3 text-violet-400 mt-0.5 shrink-0" />
        <div className="text-[11px] text-violet-300/80 leading-relaxed space-y-1.5">
          <p>
            AI reads your <strong>entire agent prompt</strong> and extracts its reusable structural pattern —
            replacing domain-specific details with{' '}
            <code className="text-amber-300 bg-amber-500/12 border border-amber-500/25 px-0.5 rounded font-mono">
              {'{PLACEHOLDER}'}
            </code>{' '}
            tokens.
          </p>
          <p className="text-violet-400/60">
            Example: a Facebook API connector becomes a generic{' '}
            <em>{'{PLATFORM_NAME}'} OAuth Integration</em> pattern — reusable for YouTube, Instagram, TikTok, etc.
          </p>
        </div>
      </div>

      {/* Source info */}
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="text-[11px] text-muted-foreground">
          {hasPrompt ? (
            <span>Source: <strong className="text-foreground">{nodeCount} nodes</strong> + full agent prompt</span>
          ) : (
            <span className="text-amber-400">No prompt found — open a graph first</span>
          )}
        </div>
      </div>

      <button
        onClick={onExtract}
        disabled={aiLoading || !hasPrompt}
        className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
      >
        {aiLoading ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" />Extracting pattern…</>
        ) : (
          <><Sparkles className="h-3.5 w-3.5" />Extract Reusable Pattern</>
        )}
      </button>

      {aiError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {aiError}
        </div>
      )}

      {aiResult && (
        <>
          {/* Meta card */}
          <div className="rounded-lg bg-green-500/8 border border-green-500/25 px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
              <Check className="h-3.5 w-3.5" />
              Pattern Extracted
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug">{aiResult.name}</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{aiResult.description}</p>
            <div className="flex items-center gap-2">
              <Badge color="violet">{aiResult.category}</Badge>
              <Badge color="blue">{aiResult.complexity}</Badge>
            </div>
          </div>

          {/* Placeholders */}
          {aiResult.placeholders?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="h-3 w-3 text-amber-400 shrink-0" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Placeholders ({aiResult.placeholders.length})
                </span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {aiResult.placeholders.map((p) => (
                  <div key={p.token} className="flex gap-2 items-start text-[11px]">
                    <code className="text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded shrink-0 font-mono text-[10px] mt-0.5">
                      {p.token}
                    </code>
                    <span className="text-muted-foreground leading-relaxed">{p.hint}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Template preview */}
          <FormattedPromptPreview
            text={aiResult.promptTemplate}
            label="Pattern Template"
            copied={copied}
            onCopy={onCopy}
            highlightPlaceholders
          />
        </>
      )}

      {/* Usage guide — shown before extraction */}
      {!aiResult && !aiLoading && (
        <UsageGuide />
      )}
    </div>
  );
}

// ── Usage guide ───────────────────────────────────────────────────────────────
function UsageGuide() {
  const examples = [
    { from: 'Facebook API connector', to: '{PLATFORM_NAME} OAuth Integration' },
    { from: 'Refund request handler', to: '{REQUEST_TYPE} Processing Flow' },
    { from: 'Stripe payment validator', to: '{PAYMENT_PROVIDER} Validation Pattern' },
    { from: 'Customer support router', to: '{DEPARTMENT} Routing & Escalation' },
  ];
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Examples</p>
      <div className="space-y-1.5">
        {examples.map((ex) => (
          <div key={ex.from} className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground truncate flex-1">{ex.from}</span>
            <span className="text-muted-foreground/40 shrink-0">→</span>
            <span className="text-amber-300/80 truncate flex-1 text-right font-mono text-[10px]">{ex.to}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Formatted Prompt Preview ──────────────────────────────────────────────────
function FormattedPromptPreview({
  text, label, copied, onCopy, highlightPlaceholders = false,
}: {
  text: string; label: string; copied: boolean;
  onCopy: (t: string) => void; highlightPlaceholders?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</span>
        <button
          onClick={() => onCopy(text)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied
            ? <><Check className="h-3 w-3 text-green-400" /><span className="text-green-400">Copied</span></>
            : <><Copy className="h-3 w-3" />Copy</>}
        </button>
      </div>
      <div className="bg-[#0d0d14] border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
        <PromptRenderer text={text} highlightPlaceholders={highlightPlaceholders} />
      </div>
    </div>
  );
}

// ── Prompt Renderer ───────────────────────────────────────────────────────────
function PromptRenderer({ text, highlightPlaceholders }: { text: string; highlightPlaceholders: boolean }) {
  return (
    <div className="p-3 text-[11px] leading-relaxed font-mono space-y-0.5">
      {text.split('\n').map((line, i) => (
        <PromptLine key={i} line={line} highlight={highlightPlaceholders} />
      ))}
    </div>
  );
}

function PromptLine({ line, highlight }: { line: string; highlight: boolean }) {
  if (!line.trim()) return <div className="h-2" />;
  if (/^# /.test(line)) return (
    <div className="text-[13px] font-bold text-foreground pt-2 pb-1 border-b border-border/30">
      {renderInline(line.replace(/^# /, ''), highlight)}
    </div>
  );
  if (/^## /.test(line)) return (
    <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wide pt-2 pb-0.5">
      {renderInline(line.replace(/^## /, ''), highlight)}
    </div>
  );
  if (/^### /.test(line)) return (
    <div className="text-[11px] font-semibold text-indigo-200/80 pt-1">
      {renderInline(line.replace(/^### /, ''), highlight)}
    </div>
  );
  const bulletMatch = line.match(/^(\s*)[*\-] (.*)$/);
  if (bulletMatch) return (
    <div className="flex gap-1.5" style={{ paddingLeft: (bulletMatch[1]?.length ?? 0) * 4 }}>
      <span className="text-indigo-400/70 shrink-0 mt-0.5 select-none">•</span>
      <span className="text-neutral-300">{renderInline(bulletMatch[2], highlight)}</span>
    </div>
  );
  const numMatch = line.match(/^(\s*)(\d+)\. (.*)$/);
  if (numMatch) return (
    <div className="flex gap-1.5" style={{ paddingLeft: (numMatch[1]?.length ?? 0) * 4 }}>
      <span className="text-indigo-400/50 shrink-0 w-4 text-right select-none">{numMatch[2]}.</span>
      <span className="text-neutral-300">{renderInline(numMatch[3], highlight)}</span>
    </div>
  );
  if (/^```/.test(line)) return <div className="text-neutral-600 text-[9px]">{line}</div>;
  return <div className="text-neutral-400">{renderInline(line, highlight)}</div>;
}

function renderInline(text: string, highlight: boolean): React.ReactNode {
  const parts = text.split(/(\{[A-Z_0-9]+\}|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (highlight && /^\{[A-Z_0-9]+\}$/.test(part)) {
          return (
            <span key={i} className="text-amber-300 bg-amber-500/15 border border-amber-500/30 px-0.5 rounded font-semibold not-italic">
              {part}
            </span>
          );
        }
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          return <strong key={i} className="text-neutral-200 font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ children, color }: { children: React.ReactNode; color: 'violet' | 'blue' | 'green' }) {
  const s = {
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
    blue:   'bg-blue-500/15 text-blue-300 border-blue-500/25',
    green:  'bg-green-500/15 text-green-300 border-green-500/25',
  };
  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', s[color])}>
      {children}
    </span>
  );
}
