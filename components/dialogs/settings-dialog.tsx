'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { Info } from 'lucide-react';
import type { AgentSettings, GraphRuleSettings, ProviderConfig, AIProvider } from '@/lib/types';
import { DEFAULT_GRAPH_RULE_SETTINGS, GEMINI_MODELS, DEFAULT_GEMINI_MODEL, PROVIDER_MODELS, OPENAI_REASONING_MODELS, DEFAULT_PROVIDER_CONFIG } from '@/lib/types';
import { getGraphRuleSettings, saveGraphRuleSettings, getProviderConfig, saveProviderConfig } from '@/lib/storage/storage';

// ── InfoTooltip: small (i) icon with a rich tooltip ─────────────────────────
function InfoTooltip({ description, interactions, tokenImpact }: {
  description: string;
  interactions: string;
  tokenImpact: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors ml-1.5" aria-label="More info">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1.5 p-3 text-left bg-popover text-popover-foreground border shadow-md">
        <p className="text-xs">{description}</p>
        <p className="text-xs text-muted-foreground"><span className="font-medium">Works with:</span> {interactions}</p>
        <p className="text-xs text-muted-foreground"><span className="font-medium">Token impact:</span> {tokenImpact}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Tooltip data for all 7 Graph Rule toggles ────────────────────────────────
const TOGGLE_INFO: Record<string, { description: string; interactions: string; tokenImpact: string }> = {
  postParseValidation: {
    description: 'Runs structural validation (cycles, orphans, missing START/END) right after AI generation and shows violations inline.',
    interactions: 'All other toggles. Catches issues regardless of how the graph was built.',
    tokenImpact: 'None — runs locally after generation.',
  },
  strictChatEditMode: {
    description: 'Prevents chat-based edits from introducing critical DAG violations like cycles or removing the START node.',
    interactions: 'Post-parse validation (both validate, but at different stages).',
    tokenImpact: 'None — validation runs locally.',
  },
  preFlightRunnerCheck: {
    description: 'Validates the graph before agent execution starts. Blocks runs if critical violations exist.',
    interactions: 'Post-parse validation (catches issues early) + Strict chat edit (prevents bad edits).',
    tokenImpact: 'None — validation runs locally.',
  },
  injectDAGRulesInPrompts: {
    description: 'Adds structural DAG rules to the AI system prompt so Gemini avoids cycles, self-loops, and disconnected graphs during generation.',
    interactions: 'Enhanced edge rules (both modify the AI prompt). Auto-wire (safety net if AI misses).',
    tokenImpact: '~1.5-2x more tokens per AI call (Full AI mode only).',
  },
  autoWireDisconnected: {
    description: 'After generation, automatically connects floating right-column nodes (rules, config, tools) to relevant center-column targets.',
    interactions: 'Enhanced edge rules (reduces need for auto-wiring). Outcome chains (wires logging rules to LOGGING nodes).',
    tokenImpact: 'None — runs locally after generation.',
  },
  enhancedEdgePrompt: {
    description: 'Edge connectivity rules are now permanently built into the base PFG prompt. This toggle is always on.',
    interactions: 'No longer separate — rules are part of the core prompt.',
    tokenImpact: 'None — already included in base prompt.',
  },
  structuredOutcomeChains: {
    description: 'Post-parse: auto-injects LOGGING nodes for RESOLUTION outcomes when the prompt mentions logging/audit.',
    interactions: 'Auto-wire (connects logging rules to injected LOGGING nodes).',
    tokenImpact: 'None — runs locally after generation.',
  },
  outputFormat: {
    description: 'Controls the LLM output format. JSON is most reliable. YAML saves tokens but may need retries. JSON Compact uses abbreviated keys with reliable JSON parsing.',
    interactions: 'All generation modes. Non-JSON formats fall back to JSON on failure.',
    tokenImpact: 'JSON: baseline. YAML: ~25% fewer tokens. JSON Compact: ~30-40% fewer tokens.',
  },
  chatEditFormat: {
    description: 'Controls the LLM output format used by graph chat edits. When set to JSON Compact, both the input (graph snapshot) and output (edit diff) are compacted to save tokens.',
    interactions: 'Graph Chat panel edit requests only. The format info badge appears in each chat message. Independent from Generation output format above.',
    tokenImpact: 'JSON: baseline. YAML: ~20% fewer tokens. JSON Compact: ~40-60% fewer tokens (both input & output compressed).',
  },
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings?: AgentSettings;
  onSaveSettings: (settings: AgentSettings) => void;
  mcpServerUrl?: string;
  onOpenMcpPanel?: () => void;
  graphRuleSettings?: GraphRuleSettings;
  onSaveGraphRuleSettings?: (settings: GraphRuleSettings) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaveSettings,
  mcpServerUrl = 'http://localhost:3100',
  onOpenMcpPanel,
  onSaveGraphRuleSettings,
}: SettingsDialogProps) {
  // Legacy settings (kept for compatibility)
  const [llmProvider, setLlmProvider] = useState<AgentSettings['llmProvider']>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [mcpOnline, setMcpOnline] = useState<boolean | null>(null);
  const [graphRules, setGraphRules] = useState<GraphRuleSettings>(DEFAULT_GRAPH_RULE_SETTINGS);

  // New provider config
  const [providerCfg, setProviderCfg] = useState<ProviderConfig>(DEFAULT_PROVIDER_CONFIG);

  useEffect(() => {
    if (settings) {
      setLlmProvider(settings.llmProvider);
      setApiKey(settings.apiKey);
    }
  }, [settings]);

  useEffect(() => {
    if (open) {
      setGraphRules(getGraphRuleSettings());
      setProviderCfg(getProviderConfig());
    }
  }, [open]);

  // Check MCP server status on open
  useEffect(() => {
    if (!open) return;
    setMcpOnline(null);
    fetch(`${mcpServerUrl}/api/status`)
      .then(r => r.ok ? setMcpOnline(true) : setMcpOnline(false))
      .catch(() => setMcpOnline(false));
  }, [open, mcpServerUrl]);

  const isReasoningModel = OPENAI_REASONING_MODELS.has(providerCfg.model);
  const isAnthropicThinking = providerCfg.provider === 'anthropic' && providerCfg.extendedThinking;
  const showTemperature = !isReasoningModel && !isAnthropicThinking;

  function handleProviderChange(p: AIProvider) {
    const defaults: Record<AIProvider, string> = {
      gemini: 'gemini-3-flash-preview',
      openai: 'gpt-4o',
      anthropic: 'claude-sonnet-4-5-20251101',
      groq: 'llama-3.3-70b-versatile',
      custom: '',
    };
    setProviderCfg(prev => ({
      ...prev,
      provider: p,
      model: defaults[p],
      temperature: p === 'gemini' ? 0 : 0.7,
      extendedThinking: false,
      reasoningEffort: undefined,
    }));
  }

  const handleSave = () => {
    saveProviderConfig(providerCfg);
    onSaveSettings({
      llmProvider,
      apiKey,
      model: providerCfg.model,
      temperature: providerCfg.temperature ?? 0,
    });
    onOpenChange(false);
  };

  const PROVIDER_LABELS: Record<AIProvider, string> = {
    gemini: 'Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    groq: 'Groq',
    custom: 'Custom',
  };
  const VISIBLE_PROVIDERS: AIProvider[] = ['gemini', 'openai', 'anthropic', 'custom'];

  const isGemini = providerCfg.provider === 'gemini';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] w-[95vw] h-[85vh] max-h-[800px] flex flex-col p-0 overflow-hidden bg-background">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure LLM and MCP server settings
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="llm" className="flex-1 h-full min-h-0 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mb-2 shrink-0">
            <TabsTrigger value="llm">LLM</TabsTrigger>
            <TabsTrigger value="mcp">MCP Server</TabsTrigger>
            <TabsTrigger value="graph-rules">Graph Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="llm" className="flex-1 h-full min-h-0 flex flex-col overflow-hidden outline-none mt-0">
            <ScrollArea className="h-full w-full" data-slot="settings-scroll-area">
              <div className="space-y-5 px-6 py-4">

                {/* Provider selector */}
                <div className="space-y-2">
                  <Label>AI Provider</Label>
                  <p className="text-xs text-muted-foreground">Your prompt is provider-agnostic — it&apos;s sent verbatim to whichever model you pick here.</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {VISIBLE_PROVIDERS.map(p => (
                      <button
                        key={p}
                        onClick={() => handleProviderChange(p)}
                        className={`rounded-md border px-2 py-2 text-xs font-medium text-center transition-colors ${
                          providerCfg.provider === p
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/50 bg-card hover:border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {PROVIDER_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model selection */}
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  {providerCfg.provider === 'custom' ? (
                    <Input
                      id="model"
                      value={providerCfg.model}
                      onChange={e => setProviderCfg(p => ({ ...p, model: e.target.value }))}
                      placeholder="e.g. llama3.2, mistral, phi3"
                    />
                  ) : (
                    <Select
                      value={providerCfg.model}
                      onValueChange={m => setProviderCfg(p => ({ ...p, model: m, reasoningEffort: OPENAI_REASONING_MODELS.has(m) ? (p.reasoningEffort ?? 'medium') : undefined }))}
                    >
                      <SelectTrigger id="model"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROVIDER_MODELS[providerCfg.provider].map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Custom base URL */}
                {providerCfg.provider === 'custom' && (
                  <div className="space-y-3 rounded-md border border-border/50 bg-muted/20 p-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Presets</Label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: 'AI Foundry', url: 'https://YOUR-RESOURCE.services.ai.azure.com/models' },
                          { label: 'Ollama', url: 'http://localhost:11434/v1' },
                          { label: 'LM Studio', url: 'http://localhost:1234/v1' },
                        ].map(preset => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setProviderCfg(p => ({ ...p, baseUrl: preset.url }))}
                            className="rounded-md border border-border/50 bg-card hover:border-border px-2 py-1.5 text-xs transition-colors"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="baseUrl">Base URL</Label>
                      <Input
                        id="baseUrl"
                        value={providerCfg.baseUrl ?? ''}
                        onChange={e => setProviderCfg(p => ({ ...p, baseUrl: e.target.value }))}
                        placeholder="https://your-endpoint.example.com/v1"
                      />
                      <p className="text-xs text-muted-foreground">Any OpenAI-compatible endpoint. For Azure AI Foundry, paste your model deployment URL.</p>
                    </div>
                  </div>
                )}

                {/* Temperature */}
                {showTemperature && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Temperature</Label>
                      <span className="text-xs font-mono text-muted-foreground">{(providerCfg.temperature ?? 0).toFixed(1)}</span>
                    </div>
                    <Slider
                      min={0} max={2} step={0.1}
                      value={[providerCfg.temperature ?? 0]}
                      onValueChange={([v]) => setProviderCfg(p => ({ ...p, temperature: v }))}
                      disabled={isGemini}
                    />
                    {isGemini && <p className="text-xs text-muted-foreground">Locked to 0 for Gemini (deterministic graph generation)</p>}
                  </div>
                )}

                {/* Max tokens */}
                <div className="space-y-2">
                  <Label htmlFor="maxTokens">Max output tokens</Label>
                  <Input
                    id="maxTokens"
                    type="number"
                    min={256} max={32000} step={256}
                    value={providerCfg.maxTokens ?? 8192}
                    onChange={e => setProviderCfg(p => ({ ...p, maxTokens: Number(e.target.value) }))}
                  />
                </div>

                {/* OpenAI reasoning effort (o1/o3 models) */}
                {providerCfg.provider === 'openai' && isReasoningModel && (
                  <div className="space-y-2">
                    <Label>Reasoning effort</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['low', 'medium', 'high'] as const).map(e => (
                        <button
                          key={e}
                          onClick={() => setProviderCfg(p => ({ ...p, reasoningEffort: e }))}
                          className={`rounded-md border py-2 text-xs font-medium capitalize transition-colors ${
                            (providerCfg.reasoningEffort ?? 'medium') === e
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border/50 bg-card text-muted-foreground hover:border-border'
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {providerCfg.reasoningEffort === 'low' ? 'Faster and cheaper, less thorough reasoning.' :
                       providerCfg.reasoningEffort === 'high' ? 'Slower and more expensive, most thorough reasoning.' :
                       'Balanced speed and reasoning quality.'}
                    </p>
                  </div>
                )}

                {/* Anthropic extended thinking */}
                {providerCfg.provider === 'anthropic' && (
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Extended Thinking</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Let Claude reason step-by-step before responding</p>
                      </div>
                      <Switch
                        checked={providerCfg.extendedThinking ?? false}
                        onCheckedChange={v => setProviderCfg(p => ({ ...p, extendedThinking: v, temperature: v ? 1 : 0.7 }))}
                      />
                    </div>
                    {providerCfg.extendedThinking && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Thinking budget</Label>
                          <span className="text-xs font-mono text-muted-foreground">{((providerCfg.thinkingBudget ?? 8000) / 1000).toFixed(0)}K tokens</span>
                        </div>
                        <Slider
                          min={1000} max={32000} step={1000}
                          value={[providerCfg.thinkingBudget ?? 8000]}
                          onValueChange={([v]) => setProviderCfg(p => ({ ...p, thinkingBudget: v }))}
                        />
                        <p className="text-xs text-muted-foreground">Higher budget = more thorough but slower and more expensive. Temperature is locked to 1.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Personal API Key */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="personalApiKey">Personal API Key</Label>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                      Only you
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      id="personalApiKey"
                      type="password"
                      value={providerCfg.personalApiKey ?? ''}
                      onChange={e => setProviderCfg(p => ({ ...p, personalApiKey: e.target.value }))}
                      placeholder="Stored locally in your browser only"
                      className="pr-8 font-mono text-xs"
                    />
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                    <p>This key is saved in your browser&apos;s local storage and <span className="font-medium text-foreground">never sent to the server or shared with your group</span>. It overrides the group key for generation requests made from this device.</p>
                    {isGemini && <p>Get your key at <span className="font-mono">aistudio.google.com</span></p>}
                    {providerCfg.provider === 'openai' && <p>Get your key at <span className="font-mono">platform.openai.com</span></p>}
                    {providerCfg.provider === 'anthropic' && <p>Get your key at <span className="font-mono">console.anthropic.com</span></p>}
                    {providerCfg.provider === 'custom' && <p>For Azure AI Foundry, use your deployment key. For local models (Ollama, LM Studio), any non-empty value works.</p>}
                    <p className="pt-0.5 border-t border-border/40">Group keys are managed by your admin under <span className="font-medium text-foreground">Groups → API Keys</span>.</p>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="px-6 py-4 border-t shrink-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save Settings</Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="mcp" className="flex-1 h-full min-h-0 flex flex-col overflow-hidden outline-none mt-0">
            <ScrollArea className="h-full w-full">
              <div className="space-y-4 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${mcpOnline === null
                      ? 'bg-yellow-400'
                      : mcpOnline
                        ? 'bg-green-500'
                        : 'bg-red-500'
                      }`}
                  />
                  <span className="text-sm">
                    {mcpOnline === null
                      ? 'Checking…'
                      : mcpOnline
                        ? `Server running at ${mcpServerUrl}`
                        : `Server not running at ${mcpServerUrl}`}
                  </span>
                </div>

                <div className="space-y-1">
                  <Label>Server URL</Label>
                  <Input value={mcpServerUrl} readOnly className="font-mono text-sm" />
                  <p className="text-xs text-muted-foreground">
                    Start the server with <span className="font-mono">cd mcp-server && npm run dev</span>
                  </p>
                </div>

                {onOpenMcpPanel && (
                  <Button variant="outline" onClick={() => { onOpenChange(false); onOpenMcpPanel(); }}>
                    Open MCP Control Panel
                  </Button>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="graph-rules" className="flex-1 h-full min-h-0 flex flex-col overflow-hidden outline-none mt-0">
            <ScrollArea className="h-full w-full">
              <div className="space-y-4 px-6 py-4">
                <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-1.5">
                  <p className="text-[11px] text-green-600 dark:text-green-400">
                    All toggles are safe to enable together. No conflicts between settings.
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  Configure when DAG validation rules are enforced.
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="inline-flex items-center">Post-parse validation<InfoTooltip {...TOGGLE_INFO.postParseValidation} /></Label>
                      <p className="text-xs text-muted-foreground">
                        Validate graph after AI generation and show violations immediately
                      </p>
                    </div>
                    <Switch
                      checked={graphRules.postParseValidation}
                      onCheckedChange={(checked) =>
                        setGraphRules(prev => ({ ...prev, postParseValidation: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="inline-flex items-center">Strict chat edit mode<InfoTooltip {...TOGGLE_INFO.strictChatEditMode} /></Label>
                      <p className="text-xs text-muted-foreground">
                        Reject chat edits that create critical DAG violations
                      </p>
                    </div>
                    <Switch
                      checked={graphRules.strictChatEditMode}
                      onCheckedChange={(checked) =>
                        setGraphRules(prev => ({ ...prev, strictChatEditMode: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="inline-flex items-center">Pre-flight runner check<InfoTooltip {...TOGGLE_INFO.preFlightRunnerCheck} /></Label>
                      <p className="text-xs text-muted-foreground">
                        Validate DAG rules before executing an agent
                      </p>
                    </div>
                    <Switch
                      checked={graphRules.preFlightRunnerCheck}
                      onCheckedChange={(checked) =>
                        setGraphRules(prev => ({ ...prev, preFlightRunnerCheck: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="inline-flex items-center">DAG-aware AI generation<InfoTooltip {...TOGGLE_INFO.injectDAGRulesInPrompts} /></Label>
                      <p className="text-xs text-muted-foreground pr-4">
                        Inject DAG structural rules into AI prompts so Gemini actively avoids
                        producing cycles, self-loops, and disconnected graphs
                      </p>
                      <p className="text-xs text-amber-500">
                        Increases token usage by ~1.5-2x
                      </p>
                    </div>
                    <Switch
                      checked={graphRules.injectDAGRulesInPrompts}
                      onCheckedChange={(checked) =>
                        setGraphRules(prev => ({ ...prev, injectDAGRulesInPrompts: checked }))
                      }
                    />
                  </div>
                </div>

                <div className="border-t pt-4 mt-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 leading-none">Graph Connectivity</p>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <Label className="inline-flex items-center">Auto-wire disconnected nodes<InfoTooltip {...TOGGLE_INFO.autoWireDisconnected} /></Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically connect floating rule, config, and persona nodes
                        </p>
                      </div>
                      <Switch
                        checked={graphRules.autoWireDisconnected}
                        onCheckedChange={(checked) =>
                          setGraphRules(prev => ({ ...prev, autoWireDisconnected: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <Label className="inline-flex items-center">Enhanced edge rules<InfoTooltip {...TOGGLE_INFO.enhancedEdgePrompt} /></Label>
                        <p className="text-xs text-muted-foreground">
                          Edge rules are built into the base prompt
                        </p>
                        <p className="text-xs text-green-600">
                          Always active
                        </p>
                      </div>
                      <Switch
                        checked={true}
                        disabled={true}
                        onCheckedChange={() => { }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <Label className="inline-flex items-center">Structured outcome chains<InfoTooltip {...TOGGLE_INFO.structuredOutcomeChains} /></Label>
                        <p className="text-xs text-muted-foreground">
                          Auto-inject LOGGING nodes for resolution outcomes
                        </p>
                      </div>
                      <Switch
                        checked={graphRules.structuredOutcomeChains}
                        onCheckedChange={(checked) =>
                          setGraphRules(prev => ({ ...prev, structuredOutcomeChains: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="inline-flex items-center">Output format<InfoTooltip {...TOGGLE_INFO.outputFormat} /></Label>
                        <p className="text-xs text-muted-foreground">
                          LLM response format
                        </p>
                      </div>
                      <Select
                        value={graphRules.outputFormat ?? 'json'}
                        onValueChange={(value) =>
                          setGraphRules(prev => ({ ...prev, outputFormat: value as 'json' | 'yaml' | 'json-compact' }))
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="json">JSON</SelectItem>
                          <SelectItem value="yaml">YAML</SelectItem>
                          <SelectItem value="json-compact">JSON Compact</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="inline-flex items-center">Chat edit format<InfoTooltip {...TOGGLE_INFO.chatEditFormat} /></Label>
                        <p className="text-xs text-muted-foreground">
                          Format for chat edit requests
                        </p>
                      </div>
                      <Select
                        value={graphRules.chatEditFormat ?? 'json'}
                        onValueChange={(value) =>
                          setGraphRules(prev => ({ ...prev, chatEditFormat: value as 'json' | 'yaml' | 'json-compact' }))
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="json">JSON</SelectItem>
                          <SelectItem value="yaml">YAML</SelectItem>
                          <SelectItem value="json-compact">JSON Compact</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
              <Button
                onClick={() => {
                  saveGraphRuleSettings(graphRules);
                  onSaveGraphRuleSettings?.(graphRules);
                }}
                className="w-full"
              >
                Save Graph Rules
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog >
  );
}
