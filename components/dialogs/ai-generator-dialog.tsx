'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Sparkles, Loader2, AlertCircle, Key, TriangleAlert, Info, Cpu } from 'lucide-react';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { AgentConfig, GenerationMode, ProviderConfig } from '@/lib/types';
import { DEFAULT_GEMINI_MODEL } from '@/lib/types';
import { getProviderConfig } from '@/lib/storage/storage';

import { ScrollArea } from '../ui/scroll-area';

export interface TokenUsage {
  promptTokens?: number;
  responseTokens?: number;
  thoughtsTokens?: number;
  totalTokens?: number;
}

export interface GenerationJob {
  prompt: string;
  status: 'running' | 'done' | 'error';
  error?: string;
  charCount?: number;
  tokenCount?: TokenUsage;
  abort?: () => void;
  phaseLabel?: string;
}

interface AIGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (agent: AgentConfig) => void;
  onGenerationJobChange?: (job: GenerationJob | null) => void;
  apiKey?: string;
  currentAgent?: AgentConfig | null;
  onPreGenerate?: (prompt: string, apiKey: string) => Promise<boolean>;
  activeWorkspace?: { id: string | null; name: string };
}

export function AIGeneratorDialog({
  open,
  onOpenChange,
  onGenerate,
  onGenerationJobChange,
  apiKey: apiKeyProp,
  currentAgent,
  onPreGenerate,
  activeWorkspace,
}: AIGeneratorDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [localApiKey, setLocalApiKey] = useState('');
  const apiKey = apiKeyProp || localApiKey;
  const [generationMode, setGenerationMode] = useState<GenerationMode>('full-ai-v6');
  const [graphStyle, setGraphStyle] = useState<'A' | 'C'>('A');
  const [error, setError] = useState<string | null>(null);
  const [providerCfg, setProviderCfg] = useState<ProviderConfig | null>(null);

  useEffect(() => {
    if (open) {
      setProviderCfg(getProviderConfig());
    }
  }, [open]);

  const PROVIDER_LABELS: Record<string, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    groq: 'Groq',
    custom: 'Custom',
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a description');
      return;
    }
    if (!apiKey) {
      setError('Please enter your Gemini API key below');
      return;
    }

    const capturedPrompt = prompt;
    const capturedApiKey = apiKey;
    const capturedModel = (generationMode === 'full-ai-v4' || generationMode === 'full-ai-v6' || generationMode === 'full-ai-v7')
      ? DEFAULT_GEMINI_MODEL
      : currentAgent?.settings?.model;

    // V7: code-based multi-agent detection (no LLM call needed)
    if (generationMode === 'full-ai-v7') {
      const { splitMultiAgentPrompt, generateMultiAgentGraphsV7 } = await import('@/lib/prompt-to-graph/v7');
      const split = splitMultiAgentPrompt(capturedPrompt);
      if (split) {
        setPrompt('');
        onOpenChange(false);
        const abortController = new AbortController();
        onGenerationJobChange?.({
          prompt: capturedPrompt,
          status: 'running',
          charCount: 0,
          abort: () => abortController.abort(),
          phaseLabel: `V7 Multi-Agent DNA (Style ${graphStyle}) | ${split.subAgents.length + 1} agents`,
        });
        try {
          const result = await generateMultiAgentGraphsV7(capturedPrompt, {
            apiKey: capturedApiKey,
            model: capturedModel,
            graphStyle,
            signal: abortController.signal,
            onProgress: (agents) => {
              const done = agents.filter(a => a.status === 'done').length;
              onGenerationJobChange?.({
                prompt: capturedPrompt,
                status: 'running',
                charCount: done,
                abort: () => abortController.abort(),
                phaseLabel: `V7 Multi-Agent: ${done}/${agents.length} done`,
              });
            },
          });
          if (result) {
            onGenerate(result.master);
            for (const sub of result.subAgents) onGenerate(sub);
            onGenerationJobChange?.({ prompt: capturedPrompt, status: 'done' });
            return;
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            onGenerationJobChange?.({ prompt: capturedPrompt, status: 'error', error: 'Aborted' });
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          console.error('[V7 Multi-Agent] Generation failed:', err);
          onGenerationJobChange?.({ prompt: capturedPrompt, status: 'error', error: message });
          return;
        }
        // Not multi-agent — fall through to single-agent V7 path below
      }
    }

    // Check for multi-agent pattern before proceeding
    if (onPreGenerate) {
      setError(null);
      try {
        const isMultiAgent = await onPreGenerate(capturedPrompt, capturedApiKey);
        if (isMultiAgent) {
          // Wizard takes over — close this dialog
          setPrompt('');
          onOpenChange(false);
          return;
        }
      } catch {
        // Detection failed, proceed with single-agent
      }
    }

    setError(null);

    // Close dialog immediately — generation runs in background
    setPrompt('');
    onOpenChange(false);

    const abortController = new AbortController();
    let charCount = 0;
    let latestTokenCount: TokenUsage | undefined;
    let latestPhaseLabel: string = generationMode === 'full-ai-v7'
      ? `V7 DNA (Style ${graphStyle}) | input: ${capturedPrompt.length.toLocaleString()} chars`
      : generationMode === 'full-ai-v6'
      ? `V6 Multi-Agent | input: ${capturedPrompt.length.toLocaleString()} chars`
      : `V4 Single-Call | input: ${capturedPrompt.length.toLocaleString()} chars`;

    // Notify parent that generation has started
    onGenerationJobChange?.({
      prompt: capturedPrompt,
      status: 'running',
      charCount: 0,
      abort: () => abortController.abort(),
      phaseLabel: latestPhaseLabel,
    });

    // Throttle UI updates to max once per 3 seconds to prevent ReactFlow render lag on long outputs
    let lastUpdateTime = 0;
    const updateJob = (force = false) => {
      const now = Date.now();
      if (!force && now - lastUpdateTime < 3000) return;
      lastUpdateTime = now;

      onGenerationJobChange?.({
        prompt: capturedPrompt,
        status: 'running',
        charCount,
        tokenCount: latestTokenCount,
        abort: () => abortController.abort(),
        phaseLabel: latestPhaseLabel,
      });
    };

    try {
      let agent: AgentConfig;

      if (generationMode === 'full-ai-v7') {
        const { promptToGraphV7 } = await import('@/lib/prompt-to-graph/v7');
        agent = await promptToGraphV7(capturedPrompt, {
          apiKey: capturedApiKey,
          model: capturedModel,
          graphStyle,
          signal: abortController.signal,
          onChunk: (text: string) => {
            charCount += text.length;
            updateJob();
          },
          onUsage: (u) => { latestTokenCount = u; },
          onPhaseChange: (_phase, name, status) => {
            if (status === 'started') { latestPhaseLabel = `V7: ${name}…`; updateJob(true); }
          },
        });
      } else if (generationMode === 'full-ai-v6') {
        const { promptToGraphV6 } = await import('@/lib/prompt-to-graph/v6');
        agent = await promptToGraphV6(capturedPrompt, {
          apiKey: capturedApiKey,
          model: capturedModel,
          signal: abortController.signal,
          onChunk: (text: string) => {
            charCount += text.length;
            updateJob();
          },
          onPhaseChange: (phase: number, name: string, status: 'started' | 'done') => {
            if (status === 'started') {
              latestPhaseLabel = `V6 Phase ${phase}: ${name}`;
              updateJob(true);
            }
          },
          onUsage: (usage: any) => {
            latestTokenCount = {
              promptTokens: usage.promptTokens,
              responseTokens: usage.responseTokens,
              thoughtsTokens: usage.thoughtsTokens,
              totalTokens: usage.totalTokens,
            };
            updateJob();
          },
        } as any);
      } else if (generationMode === 'full-ai-v4') {
        const { promptToGraphV4 } = await import('@/lib/prompt-to-graph/v4');
        agent = await promptToGraphV4(capturedPrompt, {
          apiKey: capturedApiKey,
          model: capturedModel,
          signal: abortController.signal,
          onChunk: (text) => {
            charCount += text.length;
            updateJob();
          },
          onPhaseChange: (phase, name, status) => {
            if (status === 'started') {
              latestPhaseLabel = `V4 Phase ${phase}: ${name}`;
              updateJob(true);
            }
          },
          onUsage: (usage) => {
            latestTokenCount = {
              promptTokens: usage.promptTokens,
              responseTokens: usage.responseTokens,
              thoughtsTokens: usage.thoughtsTokens,
              totalTokens: usage.totalTokens,
            };
            updateJob();
          },
        });
      } else {
        const { promptToGraphV4 } = await import('@/lib/prompt-to-graph/v4');
        agent = await promptToGraphV4(capturedPrompt, {
          apiKey: capturedApiKey,
          model: capturedModel,
          signal: abortController.signal,
          onChunk: (text) => { charCount += text.length; updateJob(); },
          onUsage: (usage) => {
            latestTokenCount = { promptTokens: usage.promptTokens, responseTokens: usage.responseTokens, thoughtsTokens: usage.thoughtsTokens, totalTokens: usage.totalTokens };
            updateJob();
          },
        });
      }

      agent.generatedWith =
        generationMode === 'full-ai-v7' ? 'v7' as any
        : generationMode === 'full-ai-v6' ? 'v6' as any
        : 'v4';

      agent.settings = { ...(agent.settings ?? { llmProvider: 'gemini', model: capturedModel ?? DEFAULT_GEMINI_MODEL, temperature: 0 }), apiKey: capturedApiKey };
      onGenerate(agent);
      onGenerationJobChange?.({ prompt: capturedPrompt, status: 'done', tokenCount: latestTokenCount });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        onGenerationJobChange?.(null);
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to generate agent';
      onGenerationJobChange?.({ prompt: capturedPrompt, status: 'error', error: message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[780px] !max-w-[90vw] max-h-[90vh] flex flex-col pt-6 pb-0 overflow-hidden sm:max-w-[780px]">
        <DialogHeader className="shrink-0 px-6">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Agent Generator
          </DialogTitle>
          <DialogDescription className="text-sm">
            Describe your autonomous agent in detail. The graph handles layout and wiring automatically based on your prompt.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6">
          <div className="flex flex-col gap-4 py-4">

            {/* Context info — workspace + API key source */}
            <div className="rounded-lg border border-border/50 bg-muted/30 divide-y divide-border/30 text-sm shrink-0">
              <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                <span className="text-muted-foreground flex items-center gap-1.5 shrink-0">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
                  Saving to
                </span>
                <div className="flex items-center gap-1.5 font-medium truncate">
                  <div className="h-4 w-4 rounded bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                    {(activeWorkspace?.name ?? 'P').slice(0, 1).toUpperCase()}
                  </div>
                  <span className="truncate">{activeWorkspace?.name ?? 'Personal'}</span>
                  <span className="text-xs text-muted-foreground font-normal shrink-0">
                    {activeWorkspace?.id ? 'Group workspace' : 'Personal workspace'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                <span className="text-muted-foreground flex items-center gap-1.5 shrink-0">
                  <Key className="h-3.5 w-3.5" />
                  API key
                </span>
                {apiKeyProp ? (
                  <div className="flex items-center gap-1.5 text-green-500 font-medium">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {apiKeyProp.slice(0, 4)}…{apiKeyProp.slice(-4)}
                    <span className="text-xs text-muted-foreground font-normal">from agent settings</span>
                  </div>
                ) : (
                  <span className="text-amber-500 font-medium flex items-center gap-1.5">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    Enter below
                  </span>
                )}
              </div>
              {providerCfg && (
                <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                  <span className="text-muted-foreground flex items-center gap-1.5 shrink-0">
                    <Cpu className="h-3.5 w-3.5" />
                    AI provider
                  </span>
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    <span>{PROVIDER_LABELS[providerCfg.provider] ?? providerCfg.provider}</span>
                    <span className="text-xs text-muted-foreground font-normal font-mono">{providerCfg.model}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Generation mode selector */}
            <div className="space-y-1.5 shrink-0">
              <label className="text-sm font-medium">Generation Pipeline Model</label>
              <Select value={generationMode} onValueChange={(v) => setGenerationMode(v as GenerationMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-ai-v7">
                    <div className="flex justify-between w-full">
                      <span>Full AI V7 (DNA)</span>
                      <span className="text-xs text-muted-foreground ml-3">content DNA · style A/C · zero buried text</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full-ai-v6">
                    <div className="flex justify-between w-full">
                      <span>Full AI V6 (Multi-Agent)</span>
                      <span className="text-xs text-muted-foreground ml-3">flash-lite · multi-agent · best coverage</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full-ai-v4">
                    <div className="flex justify-between w-full">
                      <span>Full AI V4 (Single-Call)</span>
                      <span className="text-xs text-muted-foreground ml-3">gemini-3 · 1 call · bidirectional</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {generationMode === 'full-ai-v7' && 'V7 two-pass DNA pipeline. Every bullet and sentence becomes a visible node — nothing buried. Style A: rules as annotations. Style C: rules as decision branches.'}
                {generationMode === 'full-ai-v6' && 'V6 multi-agent pipeline. Dedicated agents for classifier, generator, and validator. Best overall coverage in the V1–V8 audit (composite 87.6).'}
                {generationMode === 'full-ai-v4' && 'Single-call pipeline (V4). One LLM call produces nodes + edges. Perfect 1:1 bidirectional: graph ↔ prompt round-trip. Most efficient mode.'}
              </p>
              {generationMode === 'full-ai-v7' && (
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">Graph style:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setGraphStyle('A')}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${graphStyle === 'A' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    >
                      A — Annotated
                    </button>
                    <button
                      type="button"
                      onClick={() => setGraphStyle('C')}
                      className={`px-3 py-1 text-xs rounded border transition-colors ${graphStyle === 'C' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    >
                      C — Branching
                    </button>
                  </div>
                </div>
              )}
            </div>



            {/* Inline API key input — shown only when no key is available from settings and mode requires AI */}
            {!apiKeyProp && (
              <div className="space-y-1.5 shrink-0">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  Gemini API Key
                </label>
                <Input
                  type="password"
                  value={localApiKey}
                  onChange={(e) => setLocalApiKey(e.target.value)}
                  placeholder="AIza..."
                />
                <p className="text-xs text-muted-foreground">Saved to the agent after generation. You can also set it in Settings.</p>
              </div>
            )}

            {/* Prompt input — fixed height with internal scroll */}
            <div className="space-y-1.5 flex flex-col">
              <label className="text-sm font-medium">Agent Description</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: Create a customer support agent that filters profanity, checks if the issue is simple or complex, and escalates to a human agent..."
                className={[
                  'h-[280px] resize-none overflow-y-auto font-medium text-sm leading-relaxed p-4 focus-visible:bg-background border shadow-inner transition-colors',
                  prompt.length > 80000
                    ? 'bg-red-500/10 border-red-500/60'
                    : prompt.length > 40000
                      ? 'bg-orange-500/10 border-orange-500/50'
                      : prompt.length > 10000
                        ? 'bg-yellow-500/10 border-yellow-500/40'
                        : 'bg-muted/10',
                ].join(' ')}
              />
              {/* Size indicator bar */}
              {prompt.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  {/* Progress bar */}
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={[
                        'h-full rounded-full transition-all duration-300',
                        prompt.length > 80000 ? 'bg-red-500' :
                          prompt.length > 40000 ? 'bg-orange-500' :
                            prompt.length > 10000 ? 'bg-yellow-500' : 'bg-primary/40',
                      ].join(' ')}
                      style={{ width: `${Math.min(100, (prompt.length / 100000) * 100)}%` }}
                    />
                  </div>
                  <span className={[
                    'text-xs tabular-nums shrink-0',
                    prompt.length > 80000 ? 'text-red-500 font-semibold' :
                      prompt.length > 40000 ? 'text-orange-500 font-medium' :
                        prompt.length > 10000 ? 'text-yellow-500' : 'text-muted-foreground',
                  ].join(' ')}>
                    {prompt.length.toLocaleString()} chars
                  </span>
                </div>
              )}
              {/* Warning banners */}
              {prompt.length > 80000 && (
                <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                  <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Prompt is very large ({(prompt.length / 1000).toFixed(0)}K chars). Generation may fail or exceed token limits. Consider trimming.</span>
                </div>
              )}
              {prompt.length > 40000 && prompt.length <= 80000 && (
                <div className="flex items-start gap-2 rounded-md bg-orange-500/10 border border-orange-500/30 px-3 py-2 text-xs text-orange-400">
                  <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Large prompt ({(prompt.length / 1000).toFixed(0)}K chars). §-indexed mode is recommended and auto-enabled to improve coverage.</span>
                </div>
              )}
              {prompt.length > 10000 && prompt.length <= 40000 && (
                <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-xs text-yellow-400">
                  <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Prompt over 10K chars — §-indexed mode auto-enabled for better source coverage.</span>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive" className="shrink-0 py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs ml-2">{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        {/* Action buttons */}
        <div className="flex justify-end gap-2 p-6 shrink-0 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!prompt.trim()}>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Agent
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
