'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import {
  Play, RotateCcw, Sparkles, Loader2, Bot, Zap, Trash2,
  ChevronDown, ChevronRight, AlertTriangle, XCircle, CheckCircle2,
  ArrowRight, Info, ShieldAlert, GitBranch,
} from 'lucide-react';
import type {
  AgentConfig, SimulationStep, PreFlightIssue, DataChange, ConditionResult,
} from '@/lib/types';
import { AgentRunner } from '@/lib/agent-runner';
import { DeterministicRunner } from '@/lib/simulation-runner';

type SimMode = 'deterministic' | 'llm';

interface TestCase {
  id: string;
  name: string;
  input: string;
  timestamp: string;
}

interface SimulationStudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentConfig | null;
  onNodeHighlight: (nodeId: string | null) => void;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Error/warning summary banner */
function ErrorSummaryBanner({
  preFlightIssues,
  steps,
  onJumpToStep,
}: {
  preFlightIssues: PreFlightIssue[];
  steps: SimulationStep[];
  onJumpToStep: (index: number) => void;
}) {
  const errors = steps.filter(s => s.status === 'error');
  const warnings = steps.filter(s => s.status === 'warning' || s.status === 'blocked');
  const preErrors = preFlightIssues.filter(i => i.severity === 'error');
  const preWarnings = preFlightIssues.filter(i => i.severity === 'warning');

  if (preFlightIssues.length === 0 && errors.length === 0 && warnings.length === 0) {
    if (steps.length > 0) {
      return (
        <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/20 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          All steps completed successfully
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-1.5 p-2 rounded-md bg-muted/50 border text-xs">
      {/* Pre-flight */}
      <div className="flex items-center gap-2">
        <span className="font-medium">Pre-flight:</span>
        {preErrors.length > 0 ? (
          <span className="text-red-500 flex items-center gap-1">
            <XCircle className="h-3 w-3" /> {preErrors.length} error(s)
          </span>
        ) : (
          <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Structure OK
          </span>
        )}
        {preWarnings.length > 0 && (
          <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {preWarnings.length} warning(s)
          </span>
        )}
      </div>

      {/* Runtime */}
      {steps.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="font-medium">Runtime:</span>
          {errors.length > 0 && (
            <span className="text-red-500 flex items-center gap-1">
              <XCircle className="h-3 w-3" /> {errors.length} error(s)
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {warnings.length} warning(s)
            </span>
          )}
          {errors.length === 0 && warnings.length === 0 && (
            <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> OK
            </span>
          )}
        </div>
      )}

      {/* Clickable issue list */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="pt-1 space-y-0.5">
          {steps.map((step, idx) => {
            if (step.status !== 'error' && step.status !== 'warning' && step.status !== 'blocked') return null;
            return (
              <button
                key={idx}
                className="w-full text-left px-1.5 py-0.5 rounded hover:bg-muted transition-colors flex items-center gap-1.5"
                onClick={() => onJumpToStep(idx)}
              >
                {step.status === 'error' ? <XCircle className="h-3 w-3 text-red-500 shrink-0" /> : <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />}
                <span>Step {idx + 1}: {step.errorDetail?.message || step.nodeLabel}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Pre-flight issues */}
      {preFlightIssues.length > 0 && (
        <div className="pt-1 space-y-0.5 border-t border-border mt-1">
          {preFlightIssues.map((issue, idx) => (
            <div key={idx} className="flex items-start gap-1.5 px-1.5 py-0.5">
              {issue.severity === 'error'
                ? <XCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                : <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />}
              <div>
                <span>{issue.message}</span>
                {issue.suggestion && <span className="text-muted-foreground ml-1">— {issue.suggestion}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Single step card in the timeline */
function StepCard({
  step,
  index,
  isActive,
  showAlternatives,
  onClick,
}: {
  step: SimulationStep;
  index: number;
  isActive: boolean;
  showAlternatives: boolean;
  onClick: () => void;
}) {
  const statusIcon = {
    complete: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    passthrough: <CheckCircle2 className="h-3.5 w-3.5 text-green-500/60" />,
    error: <XCircle className="h-3.5 w-3.5 text-red-500" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />,
    blocked: <ShieldAlert className="h-3.5 w-3.5 text-orange-500" />,
    running: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
    skipped: <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />,
    handoff: <ArrowRight className="h-3.5 w-3.5 text-purple-500" />,
  }[step.status] || <Info className="h-3.5 w-3.5" />;

  const statusBorder = {
    complete: 'border-green-500/20',
    passthrough: 'border-green-500/10',
    error: 'border-red-500/30 bg-red-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
    blocked: 'border-orange-500/30 bg-orange-500/5',
    running: 'border-blue-500/30 bg-blue-500/5 animate-pulse',
    skipped: 'border-border',
    handoff: 'border-purple-500/20 bg-purple-500/5',
  }[step.status] || 'border-border';

  return (
    <button
      className={`w-full text-left border rounded-lg p-2.5 transition-colors cursor-pointer ${statusBorder} ${isActive ? 'ring-2 ring-primary/50 bg-primary/5' : 'hover:bg-accent/50'
        }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-xs font-mono text-muted-foreground">{index + 1}.</span>
          <span className="text-sm font-medium truncate">{step.nodeLabel}</span>
        </div>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">{step.nodeType}</Badge>
      </div>

      {/* Path taken for decisions */}
      {step.pathTaken && (
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          Took: <span className="font-medium text-foreground">{step.pathTaken}</span>
          {step.alternativePaths && step.alternativePaths.length > 0 && (
            <span className="text-muted-foreground">
              (of {(step.alternativePaths?.length ?? 0) + 1} options)
            </span>
          )}
        </div>
      )}

      {/* Error detail */}
      {step.errorDetail && (
        <div className="mt-1.5 text-xs space-y-0.5">
          <div className={step.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}>
            {step.errorDetail.message}
          </div>
          {step.errorDetail.suggestion && (
            <div className="text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3 shrink-0" /> {step.errorDetail.suggestion}
            </div>
          )}
        </div>
      )}

      {/* Alternative paths (when toggle is on) */}
      {showAlternatives && step.alternativePaths && step.alternativePaths.length > 0 && (
        <div className="mt-2 p-2 rounded bg-muted/50 border border-border text-xs space-y-0.5">
          <div className="font-medium text-muted-foreground mb-1">Alternative paths:</div>
          {step.alternativePaths.map((path, i) => (
            <div key={i} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-[10px]">○</span> {path} <span className="text-[10px]">(not matched)</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

/** Data inspector panel — shows details for the selected step */
function DataInspector({ step }: { step: SimulationStep | null }) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['input', 'output', 'changes', 'conditions'])
  );

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  if (!step) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4 text-center">
        Click a step in the timeline to inspect its data flow
      </div>
    );
  }

  const SectionHeader = ({ id, label, count }: { id: string; label: string; count?: number }) => (
    <button
      className="flex items-center gap-1.5 w-full text-left text-xs font-medium py-1.5 hover:text-foreground transition-colors"
      onClick={() => toggleSection(id)}
    >
      {expandedSections.has(id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      {label}
      {count !== undefined && count > 0 && (
        <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-auto">{count}</Badge>
      )}
    </button>
  );

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-1">
        {/* Step header */}
        <div className="flex items-center gap-2 pb-2 border-b">
          <Badge variant="outline" className="text-[10px]">{step.nodeType}</Badge>
          <span className="text-sm font-medium">{step.nodeLabel}</span>
        </div>

        {/* Input */}
        <div>
          <SectionHeader id="input" label="Input" />
          {expandedSections.has('input') && (
            <div className="mt-1 p-2 rounded bg-muted/50 border">
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {formatData(step.input)}
              </pre>
            </div>
          )}
        </div>

        {/* Output */}
        <div>
          <SectionHeader id="output" label="Output" />
          {expandedSections.has('output') && (
            <div className="mt-1 p-2 rounded bg-muted/50 border">
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {formatData(step.output)}
              </pre>
            </div>
          )}
        </div>

        {/* Data changes */}
        {step.dataTransformations.length > 0 && (
          <div>
            <SectionHeader id="changes" label="Data Changes" count={step.dataTransformations.length} />
            {expandedSections.has('changes') && (
              <div className="mt-1 p-2 rounded bg-muted/50 border space-y-1">
                {step.dataTransformations.map((change, i) => (
                  <DataChangeRow key={i} change={change} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Conditions */}
        {step.conditionsEvaluated && step.conditionsEvaluated.length > 0 && (
          <div>
            <SectionHeader id="conditions" label="Conditions" count={step.conditionsEvaluated.length} />
            {expandedSections.has('conditions') && (
              <div className="mt-1 p-2 rounded bg-muted/50 border space-y-1.5">
                {step.conditionsEvaluated.map((cond, i) => (
                  <ConditionRow key={i} condition={cond} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function DataChangeRow({ change }: { change: DataChange }) {
  const icon = {
    added: <span className="text-green-500 font-mono text-xs">+</span>,
    removed: <span className="text-red-500 font-mono text-xs">-</span>,
    modified: <span className="text-yellow-500 font-mono text-xs">~</span>,
  }[change.changeType];

  const color = {
    added: 'text-green-600 dark:text-green-400',
    removed: 'text-red-600 dark:text-red-400',
    modified: 'text-yellow-600 dark:text-yellow-400',
  }[change.changeType];

  return (
    <div className={`text-[11px] font-mono flex items-start gap-1.5 ${color}`}>
      {icon}
      <span className="font-semibold">{change.field}:</span>
      {change.changeType === 'modified' ? (
        <span>{change.before} → {change.after}</span>
      ) : change.changeType === 'added' ? (
        <span>{change.after}</span>
      ) : (
        <span className="line-through">{change.before}</span>
      )}
    </div>
  );
}

function ConditionRow({ condition }: { condition: ConditionResult }) {
  return (
    <div className="text-[11px] flex items-start gap-1.5">
      {condition.result ? (
        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
      )}
      <div>
        <span className="font-medium">{condition.condition}</span>
        {condition.evaluatedValue && (
          <span className="text-muted-foreground ml-1">({condition.evaluatedValue})</span>
        )}
      </div>
    </div>
  );
}

function formatData(data: string): string {
  if (!data) return '(empty)';
  try {
    const parsed = JSON.parse(data);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return data;
  }
}

// ─── AI input generation ─────────────────────────────────────────────────────

function buildAgentSummary(agent: AgentConfig): string {
  const lines: string[] = [];
  lines.push(`Agent: ${agent.name}`);
  if (agent.description) lines.push(`Description: ${agent.description}`);
  if (agent.originalPrompt) lines.push(`\nOriginal instructions:\n${agent.originalPrompt}`);
  else {
    lines.push(`\nGraph nodes (${agent.nodes.length}):`);
    agent.nodes.slice(0, 30).forEach(n => {
      const snippet = (n.config?.logicSnippet as string) ?? n.description ?? '';
      lines.push(`  [${n.type}] ${n.label}${snippet ? ': ' + snippet.slice(0, 120) : ''}`);
    });
  }
  return lines.join('\n');
}

async function aiGenerateInput(agent: AgentConfig, apiKey: string): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const summary = buildAgentSummary(agent);

  let result = '';
  const stream = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    config: {
      temperature: 0,
      topP: 0,
      systemInstruction:
        'You generate realistic test inputs for AI agents. ' +
        'Output ONLY the raw test input text the user would send — no labels, no quotes, no explanation.',
    } as any,
    contents: [{
      role: 'user',
      parts: [{ text: `Generate one realistic, specific test input for this agent:\n\n${summary}` }],
    }],
  });
  for await (const chunk of stream) result += chunk.text ?? '';
  return result.trim();
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SimulationStudioDialog({
  open,
  onOpenChange,
  agent,
  onNodeHighlight,
}: SimulationStudioDialogProps) {
  const [input, setInput] = useState('');
  const [simMode, setSimMode] = useState<SimMode>('llm');
  const [steps, setSteps] = useState<SimulationStep[]>([]);
  const [preFlightIssues, setPreFlightIssues] = useState<PreFlightIssue[]>([]);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isGeneratingInput, setIsGeneratingInput] = useState(false);
  const [isGeneratingSamples, setIsGeneratingSamples] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [wipDismissed, setWipDismissed] = useState(false);
  const abortRef = useRef(false);

  const apiKey = agent?.settings?.apiKey ?? '';
  const canRun = !!apiKey && !!agent && !!input.trim();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    abortRef.current = true;
    setSteps([]);
    setPreFlightIssues([]);
    setSelectedStepIndex(null);
    setIsRunning(false);
    setIsGeneratingSamples(false);
    onNodeHighlight(null);
  }, [onNodeHighlight]);

  const handleRunLLM = useCallback(async () => {
    if (!agent || !input.trim()) return;
    handleReset();
    abortRef.current = false;
    setIsRunning(true);

    const runner = new AgentRunner(agent, input);

    // Pre-flight
    const issues = runner.preFlightCheck();
    setPreFlightIssues(issues);

    // Check for blocking errors
    const blockingErrors = issues.filter(i => i.severity === 'error');
    if (blockingErrors.length > 0) {
      setIsRunning(false);
      return;
    }

    try {
      for await (const step of runner.run()) {
        if (abortRef.current) break;
        setSteps(prev => {
          const existingIdx = prev.findIndex(s => s.timestamp === step.timestamp && s.status === 'running');
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = step;
            return updated;
          }
          return [...prev, step];
        });
        onNodeHighlight(step.nodeId);
      }
    } catch (err) {
      // Error already captured in steps
    } finally {
      setIsRunning(false);
      onNodeHighlight(null);
    }
  }, [agent, input, handleReset, onNodeHighlight]);

  const handleRunDeterministic = useCallback(async () => {
    if (!agent || !input.trim()) return;
    handleReset();
    abortRef.current = false;
    setIsRunning(true);
    setIsGeneratingSamples(true);

    const runner = new DeterministicRunner(agent, input);

    // Pre-flight
    const issues = runner.preFlightCheck();
    setPreFlightIssues(issues);

    const blockingErrors = issues.filter(i => i.severity === 'error');
    if (blockingErrors.length > 0) {
      setIsRunning(false);
      setIsGeneratingSamples(false);
      return;
    }

    try {
      // Generate sample data (single LLM call)
      await runner.generateSampleData();
      setIsGeneratingSamples(false);

      if (abortRef.current) return;

      // Walk graph deterministically
      for await (const step of runner.run()) {
        if (abortRef.current) break;
        setSteps(prev => [...prev, step]);
        onNodeHighlight(step.nodeId);
        // Small delay for visual effect
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      setSteps(prev => [...prev, {
        nodeId: '__error__',
        nodeType: 'GUARD' as any,
        nodeLabel: 'Simulation Error',
        input: '',
        output: err instanceof Error ? err.message : 'Unknown error',
        dataTransformations: [],
        status: 'error' as any,
        errorDetail: {
          message: err instanceof Error ? err.message : 'Unknown error',
          cause: 'llm_error' as any,
          suggestion: 'Check your API key and try again',
        },
        timestamp: Date.now(),
        tokenCount: 0,
      }]);
    } finally {
      setIsRunning(false);
      setIsGeneratingSamples(false);
      onNodeHighlight(null);
    }
  }, [agent, input, handleReset, onNodeHighlight]);

  const handleRun = simMode === 'llm' ? handleRunLLM : handleRunDeterministic;

  const handleGenerateInput = async () => {
    if (!apiKey || !agent) return;
    setIsGeneratingInput(true);
    try {
      const generated = await aiGenerateInput(agent, apiKey);
      setInput(generated);
    } catch {
      // silently fail
    } finally {
      setIsGeneratingInput(false);
    }
  };

  const handleSaveTestCase = () => {
    if (!input.trim()) return;
    setTestCases(prev => [...prev, {
      id: `test-${Date.now()}`,
      name: input.substring(0, 40) + (input.length > 40 ? '...' : ''),
      input,
      timestamp: new Date().toISOString(),
    }]);
  };

  const handleSelectStep = (index: number) => {
    setSelectedStepIndex(index);
    const step = steps[index];
    if (step) onNodeHighlight(step.nodeId);
  };

  const selectedStep = selectedStepIndex !== null ? steps[selectedStepIndex] : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-[95vw] w-[95vw] h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <DialogTitle className="text-lg flex items-center gap-2">Simulation Studio <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400">WIP</Badge></DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Test your agent with sample inputs and visualize execution flow
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${simMode === 'deterministic' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              onClick={() => { setSimMode('deterministic'); handleReset(); }}
            >
              <Zap className="h-3 w-3" />
              Preview
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors opacity-50 cursor-not-allowed ${simMode === 'llm' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                }`}
              disabled
            >
              <Bot className="h-3 w-3" />
              LLM Simulation (Coming Soon)
            </button>
          </div>
          {simMode === 'llm' && (
            <div className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-400">
              Each executable node = 1 LLM call. Uses more tokens than Preview.
            </div>
          )}
          {simMode === 'deterministic' && (
            <div className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400">
              1 LLM call generates sample data for all nodes, then walks the graph instantly.
            </div>
          )}
        </div>

        <Separator />

        {/* WIP banner */}
        {!wipDismissed && (
          <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1"><strong>Work in Progress</strong> — This feature is experimental and may not work as expected. Some simulations may produce incorrect results or fail.</span>
            <button onClick={() => setWipDismissed(true)} className="shrink-0 text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 transition-colors">
              <XCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* 3-column layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr_340px] gap-0 min-h-0">

          {/* ── Left: Input Panel ── */}
          <div className="flex flex-col gap-3 p-4 border-r overflow-y-auto">
            <div className="space-y-2">
              <label className="text-xs font-medium">Test Input</label>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter test input for your agent..."
                className="min-h-[100px] resize-none text-sm"
                disabled={isRunning}
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateInput}
                  disabled={isGeneratingInput || !apiKey || !agent}
                  className="text-xs"
                >
                  {isGeneratingInput
                    ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    : <Sparkles className="h-3 w-3 mr-1" />}
                  Generate
                </Button>
                <Button size="sm" variant="outline" onClick={handleSaveTestCase} disabled={!input.trim()} className="text-xs">
                  Save
                </Button>
              </div>
            </div>

            <Separator />

            {/* Controls */}
            <div className="space-y-2">
              <label className="text-xs font-medium">Controls</label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleRun}
                  disabled={isRunning || !canRun}
                  className="flex-1"
                >
                  {isRunning ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      {isGeneratingSamples ? 'Generating...' : 'Running...'}</>
                  ) : (
                    <><Play className="h-3.5 w-3.5 mr-1.5" />Run</>
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={handleReset} disabled={steps.length === 0 && !isRunning}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
              {!apiKey && (
                <div className="text-[10px] text-muted-foreground">Configure API key in Settings to run simulations</div>
              )}
            </div>

            <Separator />

            {/* Test cases */}
            <div className="space-y-2 flex-1 min-h-0">
              <label className="text-xs font-medium">Saved Test Cases</label>
              <ScrollArea className="h-[200px] rounded-md border">
                {testCases.length === 0 ? (
                  <div className="p-3 text-center text-xs text-muted-foreground">No saved test cases yet</div>
                ) : (
                  <div className="p-1.5 space-y-1">
                    {testCases.map(tc => (
                      <div
                        key={tc.id}
                        className="flex items-start gap-1.5 p-2 rounded-md border hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => { setInput(tc.input); handleReset(); }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{tc.name}</div>
                          <div className="text-[10px] text-muted-foreground">{new Date(tc.timestamp).toLocaleString()}</div>
                        </div>
                        <Button
                          size="icon" variant="ghost" className="h-5 w-5 shrink-0"
                          onClick={e => { e.stopPropagation(); setTestCases(prev => prev.filter(t => t.id !== tc.id)); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* What-if toggle */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="show-alternatives"
                checked={showAlternatives}
                onChange={e => setShowAlternatives(e.target.checked)}
                className="h-3 w-3 rounded"
              />
              <label htmlFor="show-alternatives" className="text-xs text-muted-foreground cursor-pointer">
                Show alternative paths
              </label>
            </div>
          </div>

          {/* ── Center: Step Timeline ── */}
          <div className="flex flex-col gap-3 p-4 overflow-hidden">
            {/* Error summary */}
            <ErrorSummaryBanner
              preFlightIssues={preFlightIssues}
              steps={steps}
              onJumpToStep={handleSelectStep}
            />

            {/* Timeline */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Step Timeline</label>
              {steps.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {steps.filter(s => s.status !== 'running').length} step(s)
                </span>
              )}
            </div>
            <ScrollArea className="flex-1 min-h-0">
              {steps.length === 0 && !isRunning ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-20">
                  Enter a test input and click Run to start the simulation
                </div>
              ) : (
                <div className="space-y-1.5 pr-2">
                  {steps
                    .filter(s => s.status !== 'running')
                    .map((step, index) => (
                      <StepCard
                        key={`${step.nodeId}-${step.timestamp}`}
                        step={step}
                        index={index}
                        isActive={selectedStepIndex === index}
                        showAlternatives={showAlternatives}
                        onClick={() => handleSelectStep(index)}
                      />
                    ))}
                  {isRunning && (
                    <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {isGeneratingSamples ? 'Generating sample data...' : 'Processing next step...'}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* ── Right: Data Inspector ── */}
          <div className="flex flex-col border-l overflow-hidden">
            <div className="px-4 py-3 border-b">
              <label className="text-xs font-medium">Data Inspector</label>
            </div>
            <div className="flex-1 overflow-hidden p-3">
              <DataInspector step={selectedStep} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
