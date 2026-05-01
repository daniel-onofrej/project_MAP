'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Alert, AlertDescription } from '../ui/alert';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Users,
  Bot,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Crown,
} from 'lucide-react';
import type { MultiAgentDetection, AgentConfig } from '@/lib/types';
import type { AgentGenProgress } from '@/lib/prompt-to-graph/v4';

export interface MultiAgentJob {
  agents: AgentGenProgress[];
  status: 'running' | 'done' | 'error';
}

interface MultiAgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detection: MultiAgentDetection;
  masterPrompt: string;
  apiKey: string;
  onComplete: (master: AgentConfig, subAgents: AgentConfig[]) => void;
  onCancel: () => void;
  onJobChange?: (job: MultiAgentJob | null) => void;
}

export function MultiAgentWizard({
  open,
  onOpenChange,
  detection,
  masterPrompt,
  apiKey,
  onComplete,
  onCancel,
  onJobChange,
}: MultiAgentWizardProps) {
  const totalSteps = detection.subAgentRoles.length + 1; // N subagents + review (master is auto-filled, skip its step)
  const [currentStep, setCurrentStep] = useState(0);
  const [masterPromptValue] = useState(masterPrompt);
  const [subAgentPrompts, setSubAgentPrompts] = useState<string[]>(
    () => detection.subAgentRoles.map(() => '')
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentProgress, setAgentProgress] = useState<AgentGenProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  const updateSubAgentPrompt = useCallback((index: number, value: string) => {
    setSubAgentPrompts(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const canProceed = () => {
    if (currentStep < detection.subAgentRoles.length) {
      return subAgentPrompts[currentStep]?.trim().length > 0;
    }
    return true; // review step
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setAgentProgress([]);

    const subAgentInputs = detection.subAgentRoles.map((role, i) => ({
      role,
      prompt: subAgentPrompts[i],
    }));

    // Close the dialog immediately — generation runs in background (sidebar shows progress)
    onOpenChange(false);

    try {
      const { generateMultiAgentGraphs } = await import('@/lib/prompt-to-graph/v4');

      const result = await generateMultiAgentGraphs(
        masterPromptValue,
        subAgentInputs,
        { apiKey },
        (progress) => {
          setAgentProgress([...progress]);
          const allDone = progress.every(p => p.status === 'done');
          const anyError = progress.some(p => p.status === 'error');
          onJobChange?.({
            agents: progress,
            status: anyError ? 'error' : allDone ? 'done' : 'running',
          });
        },
        detection.masterRole || 'MASTER'
      );

      // Apply API key to all agents
      const applyKey = (agent: AgentConfig) => {
        agent.settings = {
          ...(agent.settings ?? { llmProvider: 'gemini' as const, model: 'gemini-3-flash-preview', temperature: 0 }),
          apiKey,
        };
      };
      applyKey(result.master);
      result.subAgents.forEach(applyKey);

      onComplete(result.master, result.subAgents);
      resetState();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        onJobChange?.(null);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setError(msg);
      onJobChange?.({ agents: agentProgress, status: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetState = () => {
    setCurrentStep(0);
    setSubAgentPrompts(detection.subAgentRoles.map(() => ''));
    setError(null);
    setAgentProgress([]);
  };

  const handleClose = (openState: boolean) => {
    if (!openState) {
      resetState();
      if (!isGenerating) onCancel();
    }
    onOpenChange(openState);
  };

  const isReviewStep = currentStep === totalSteps - 1;
  const subAgentIndex = isReviewStep ? -1 : currentStep;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Multi-Agent Setup
            <Badge variant="outline" className="ml-2">
              {currentStep + 1} / {totalSteps}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {detection.subAgentRoles.length} sub-agents detected. Provide a prompt for each agent.
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1 mb-2">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i < currentStep
                  ? 'bg-green-500'
                  : i === currentStep
                    ? 'bg-blue-500'
                    : 'bg-muted'
                }`}
            />
          ))}
        </div>

        <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-4 pr-4 pb-2">
            {/* Sub-agent steps */}
            {!isReviewStep && subAgentIndex >= 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  <span className="font-semibold text-lg">
                    Sub-Agent: {detection.subAgentRoles[subAgentIndex]}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {subAgentIndex + 1} of {detection.subAgentRoles.length}
                  </Badge>
                </div>
                {detection.subAgentPromptHints[subAgentIndex] && (
                  <p className="text-sm text-muted-foreground">
                    {detection.subAgentPromptHints[subAgentIndex]}
                  </p>
                )}
                <Textarea
                  value={subAgentPrompts[subAgentIndex]}
                  onChange={(e) => updateSubAgentPrompt(subAgentIndex, e.target.value)}
                  placeholder={`Paste the full prompt for ${detection.subAgentRoles[subAgentIndex]} agent...`}
                  className="min-h-[300px] font-mono text-sm resize-y"
                />
                <div className="text-xs text-muted-foreground text-right">
                  {(subAgentPrompts[subAgentIndex] || '').length} characters
                </div>
              </div>
            )}

            {/* Review step */}
            {isReviewStep && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="font-semibold text-lg">Review & Generate</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Review your multi-agent setup before generating all graphs.
                </p>
                <div className="space-y-2">
                  {/* Master */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-orange-50 dark:bg-orange-950/20">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-orange-500" />
                      <span className="font-medium">{detection.masterRole || 'MASTER'}</span>
                      <Badge variant="outline" className="text-xs">Master</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {masterPromptValue.length} chars
                    </span>
                  </div>
                  {/* Sub-agents */}
                  {detection.subAgentRoles.map((role, i) => (
                    <div
                      key={role}
                      className={`flex items-center justify-between p-3 rounded-lg border ${subAgentPrompts[i]?.trim()
                          ? 'bg-blue-50 dark:bg-blue-950/20'
                          : 'bg-red-50 dark:bg-red-950/20 border-red-200'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">{role}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {subAgentPrompts[i]?.trim()
                          ? `${subAgentPrompts[i].length} chars`
                          : 'Empty!'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Per-agent live generation status */}
                {isGenerating && agentProgress.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    <p className="text-xs font-medium text-muted-foreground">Generation progress</p>
                    {agentProgress.map((ap, i) => (
                      <div
                        key={ap.role}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs border transition-colors ${ap.status === 'done'
                            ? 'bg-green-500/10 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400'
                            : ap.status === 'generating'
                              ? 'bg-blue-500/10 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400'
                              : ap.status === 'error'
                                ? 'bg-red-500/10 border-red-200 dark:border-red-900 text-red-600'
                                : 'bg-muted/40 border-border text-muted-foreground'
                          }`}
                      >
                        <span className="flex-shrink-0">
                          {ap.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5" />}
                          {ap.status === 'generating' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {ap.status === 'error' && <XCircle className="h-3.5 w-3.5" />}
                          {ap.status === 'pending' && (
                            <span className="h-3.5 w-3.5 rounded-full border-2 border-current inline-block" />
                          )}
                        </span>
                        {i === 0
                          ? <Crown className="h-3 w-3 flex-shrink-0 text-orange-500" />
                          : <Bot className="h-3 w-3 flex-shrink-0 text-blue-500" />
                        }
                        <span className="font-medium">{ap.role}</span>
                        <span className="ml-auto capitalize opacity-75">{ap.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        {/* Navigation buttons */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              if (currentStep === 0) {
                handleClose(false);
              } else {
                setCurrentStep(prev => prev - 1);
              }
            }}
            disabled={isGenerating}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </Button>

          {isReviewStep ? (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || subAgentPrompts.some(p => !p.trim())}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Generate All ({1 + detection.subAgentRoles.length} agents)
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => setCurrentStep(prev => prev + 1)}
              disabled={!canProceed()}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
