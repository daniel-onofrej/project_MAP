import type {
  AgentConfig, NodeData, NodeType,
  SimulationStep, SimulationStepStatus, DataChange, ConditionResult,
  SimulationErrorDetail, PreFlightIssue, SimulationResult,
} from './types';
import { callLLM } from './ai/llm-client';
import { validateAgentConfig } from './validation';
import { getGraphRuleSettings } from './storage/storage';

const MAX_STEPS = 50;
const MAX_INPUT_CHARS = 500;

const EXECUTABLE_TYPES: NodeType[] = ['AGENT', 'TASK', 'ACTION', 'STEP', 'TOOL', 'RESOLUTION'];
const PASSTHROUGH_TYPES: NodeType[] = ['START', 'RULE', 'CONFIG', 'PERSONA', 'REFERENCE', 'TRIGGER', 'LOGGING', 'INPUT', 'OPTION'];

/** Diff two JSON strings and return DataChange[] */
function computeDataChanges(inputStr: string, outputStr: string): DataChange[] {
  const changes: DataChange[] = [];
  try {
    const inputObj = JSON.parse(inputStr);
    const outputObj = JSON.parse(outputStr);
    if (typeof inputObj !== 'object' || typeof outputObj !== 'object') return changes;

    const allKeys = new Set([...Object.keys(inputObj || {}), ...Object.keys(outputObj || {})]);
    for (const key of allKeys) {
      const inVal = inputObj?.[key];
      const outVal = outputObj?.[key];
      if (inVal === undefined && outVal !== undefined) {
        changes.push({ field: key, before: null, after: JSON.stringify(outVal), changeType: 'added' });
      } else if (inVal !== undefined && outVal === undefined) {
        changes.push({ field: key, before: JSON.stringify(inVal), after: null, changeType: 'removed' });
      } else if (JSON.stringify(inVal) !== JSON.stringify(outVal)) {
        changes.push({ field: key, before: JSON.stringify(inVal), after: JSON.stringify(outVal), changeType: 'modified' });
      }
    }
  } catch {
    // If input/output aren't JSON, treat the whole thing as a single change
    if (inputStr !== outputStr) {
      changes.push({ field: '(raw)', before: inputStr.slice(0, 200), after: outputStr.slice(0, 200), changeType: 'modified' });
    }
  }
  return changes;
}

export class AgentRunner {
  private agent: AgentConfig;
  private initialInput: string;
  private memory: Map<string, string> = new Map();

  constructor(agent: AgentConfig, initialInput: string) {
    this.agent = agent;
    this.initialInput = initialInput;
  }

  /** Run structural pre-flight checks before execution */
  preFlightCheck(): PreFlightIssue[] {
    const issues: PreFlightIssue[] = [];
    const nodeMap = new Map(this.agent.nodes.map(n => [n.id, n]));

    // Check START node exists
    const startNode = this.agent.nodes.find(n => n.type === 'START');
    if (!startNode) {
      issues.push({
        severity: 'error',
        message: 'No START node found in agent graph',
        nodeIds: [],
        suggestion: 'Add a START node to begin the execution flow',
      });
    }

    // Check END node exists and is reachable
    const endNodes = this.agent.nodes.filter(n => n.type === 'END' || n.type === 'HANDOFF');
    if (endNodes.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'No END or HANDOFF node found — execution may not terminate cleanly',
        nodeIds: [],
        suggestion: 'Add an END node to mark completion of the flow',
      });
    }

    // Check for dead-end nodes (non-END/HANDOFF with no outgoing connections)
    const hasOutgoing = new Set(this.agent.connections.map(c => c.source));
    const deadEnds = this.agent.nodes.filter(
      n => !hasOutgoing.has(n.id) && n.type !== 'END' && n.type !== 'HANDOFF'
    );
    for (const node of deadEnds) {
      issues.push({
        severity: 'warning',
        message: `"${node.label}" has no outgoing connections — execution will stop here`,
        nodeIds: [node.id],
        suggestion: `Add a connection from "${node.label}" to the next step or an END node`,
      });
    }

    // Check DECISION nodes have >= 2 outgoing connections
    const decisionNodes = this.agent.nodes.filter(n => n.type === 'DECISION');
    for (const node of decisionNodes) {
      const outgoing = this.agent.connections.filter(c => c.source === node.id);
      if (outgoing.length < 2) {
        issues.push({
          severity: 'warning',
          message: `Decision "${node.label}" has only ${outgoing.length} outgoing path(s) — decisions should have at least 2`,
          nodeIds: [node.id],
          suggestion: 'Add more outgoing connections with conditions for each decision branch',
        });
      }
    }

    // Check GUARD nodes have escalation paths
    const guardNodes = this.agent.nodes.filter(n => n.type === 'GUARD');
    for (const node of guardNodes) {
      const escalation = this.agent.connections.find(
        c => c.source === node.id && c.type === 'escalation'
      );
      if (!escalation) {
        issues.push({
          severity: 'warning',
          message: `Guard "${node.label}" has no escalation path — blocked inputs will halt execution`,
          nodeIds: [node.id],
          suggestion: 'Add an escalation connection to handle blocked inputs',
        });
      }
    }

    // Check reachability from START
    if (startNode) {
      const reachable = new Set<string>();
      const queue = [startNode.id];
      reachable.add(startNode.id);
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const conn of this.agent.connections) {
          if (conn.source === current && !reachable.has(conn.target)) {
            reachable.add(conn.target);
            queue.push(conn.target);
          }
        }
      }
      const unreachable = this.agent.nodes.filter(n => !reachable.has(n.id));
      for (const node of unreachable) {
        issues.push({
          severity: 'warning',
          message: `"${node.label}" is unreachable from START node`,
          nodeIds: [node.id],
          suggestion: 'Connect this node to the main flow or remove it',
        });
      }
    }

    return issues;
  }

  async *run(): AsyncGenerator<SimulationStep> {
    if (!this.agent.settings?.apiKey) {
      throw new Error('No API key configured. Open Settings and add your Gemini API key.');
    }

    // Pre-flight DAG validation (if enabled)
    const graphRules = getGraphRuleSettings();
    if (graphRules.preFlightRunnerCheck) {
      const violations = validateAgentConfig(this.agent);
      const critical = violations.filter(v => v.type === 'error' && v.ruleCategory === 'dag');
      if (critical.length > 0) {
        yield {
          nodeId: '__preflight__',
          nodeType: 'GUARD' as NodeType,
          nodeLabel: 'Pre-flight DAG Check',
          status: 'warning' as SimulationStepStatus,
          input: '',
          output: `DAG validation warnings:\n${critical.map(v => `- ${v.message}`).join('\n')}`,
          dataTransformations: [],
          timestamp: Date.now(),
          tokenCount: 0,
        };
      }
    }

    const startNode = this.agent.nodes.find(n => n.type === 'START');
    if (!startNode) {
      throw new Error('No START node found in agent graph. Add a START node to run.');
    }

    let currentNodeId: string | null = startNode.id;
    let currentInput = this.initialInput;
    let stepCount = 0;

    while (currentNodeId && stepCount < MAX_STEPS) {
      const node = this.agent.nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      stepCount++;

      const step: SimulationStep = {
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.label,
        input: currentInput,
        output: '',
        dataTransformations: [],
        status: 'running',
        timestamp: Date.now(),
        tokenCount: 0,
      };

      // Yield running state for UI highlight
      yield { ...step };

      try {
        const result = await this.executeNode(node, currentInput, step);
        // Compute data changes
        result.step.dataTransformations = computeDataChanges(currentInput, result.output);
        currentInput = result.output;
        currentNodeId = result.nextNodeId;

        // Check for dead-end (non-terminal node with no next)
        if (!currentNodeId && node.type !== 'END' && node.type !== 'HANDOFF') {
          result.step.status = 'warning';
          result.step.errorDetail = {
            message: `"${node.label}" has no outgoing connection — execution stopped`,
            cause: 'dead_end',
            suggestion: `Add a connection from "${node.label}" to continue the flow`,
          };
        }

        yield result.step;

        if (node.type === 'END' || node.type === 'HANDOFF') break;
      } catch (err) {
        step.status = 'error';
        step.output = err instanceof Error ? err.message : 'Unknown error';
        step.errorDetail = {
          message: step.output,
          cause: 'llm_error',
          suggestion: 'Check your API key and network connection, then try again',
        };
        yield { ...step };
        break;
      }
    }

    if (stepCount >= MAX_STEPS) {
      yield {
        nodeId: 'safety-limit',
        nodeType: 'GUARD' as NodeType,
        nodeLabel: 'Safety Limit',
        input: currentInput,
        output: `Execution stopped after ${MAX_STEPS} steps to prevent infinite loops.`,
        dataTransformations: [],
        status: 'blocked',
        timestamp: Date.now(),
        tokenCount: 0,
      };
    }
  }

  private async executeNode(
    node: NodeData,
    input: string,
    stepRef: SimulationStep
  ): Promise<{ step: SimulationStep; output: string; nextNodeId: string | null }> {
    const settings = this.agent.settings!;
    // Truncate input sent to LLM to keep token usage low
    const llmInput = input.length > MAX_INPUT_CHARS ? input.slice(0, MAX_INPUT_CHARS) + '…' : input;
    let output = input;
    let status: SimulationStepStatus = 'complete';
    let nextNodeId: string | null = null;

    if (node.type === 'END') {
      output = input;
      status = 'complete';
      nextNodeId = null;

    } else if (node.type === 'HANDOFF') {
      output = `Handoff requested: ${node.description || node.label}`;
      status = 'handoff';
      nextNodeId = null;

    } else if (node.type === 'MEMORY') {
      const key = node.label;
      if (input && input !== this.initialInput) {
        this.memory.set(key, input);
        output = `Stored in memory: "${key}"`;
      } else {
        output = this.memory.get(key) ?? `(no memory for "${key}")`;
      }
      status = 'complete';
      nextNodeId = this.getNextNode(node.id);

    } else if (node.type === 'DECISION') {
      const outgoing = this.agent.connections.filter(c => c.source === node.id);
      const allPaths = outgoing.map(c => c.condition || this.agent.nodes.find(n => n.id === c.target)?.label || c.target);

      const validEnumValues = outgoing.map(c => c.condition || c.target).filter(Boolean);
      if (validEnumValues.length === 0) validEnumValues.push('default_path');

      const systemPrompt = `You are a decision evaluator. Based on the input, select the branch condition that matches best.`;

      const responseSchema = {
        type: 'OBJECT',
        properties: {
          selectedBranch: {
            type: 'STRING',
            enum: validEnumValues,
            description: "The exact branch condition that best applies given the input."
          }
        },
        required: ['selectedBranch']
      };

      let tokens = 0;
      const responseJsonStr = await callLLM(settings, systemPrompt, llmInput, (t) => {
        tokens += t.length;
        stepRef.streamingText = (stepRef.streamingText ?? '') + t;
      }, responseSchema, 'application/json');
      stepRef.tokenCount = tokens;

      let chosen = validEnumValues[0] ?? '';
      try {
        const parsed = JSON.parse(responseJsonStr);
        if (parsed.selectedBranch) {
          chosen = parsed.selectedBranch;
        }
      } catch (e) {
        // Fallback robustly if JSON parse fails
        chosen = responseJsonStr.trim();
      }

      const chosenLower = chosen.toLowerCase();
      const matchedConn = outgoing.find(c =>
        (c.condition ?? c.target).toLowerCase() === chosenLower ||
        (c.condition ?? c.target).toLowerCase().includes(chosenLower) ||
        chosenLower.includes((c.condition ?? '').toLowerCase())
      ) ?? outgoing[0];

      // Track conditions evaluated
      stepRef.conditionsEvaluated = outgoing.map(c => ({
        condition: c.condition || this.agent.nodes.find(n => n.id === c.target)?.label || c.target,
        result: c.id === matchedConn?.id,
        evaluatedValue: chosen.trim(),
      }));

      const matchedLabel = matchedConn?.condition || this.agent.nodes.find(n => n.id === matchedConn?.target)?.label || matchedConn?.target;
      stepRef.pathTaken = matchedLabel || undefined;
      stepRef.alternativePaths = allPaths.filter(p => p !== matchedLabel);

      output = `Decision: ${chosen.trim()}`;
      nextNodeId = matchedConn?.target ?? null;
      status = 'complete';

      // Warn if no exact match found (highly unlikely with schema, but kept for fallback cases)
      if (!matchedConn || matchedConn === outgoing[0]) {
        const exactMatch = outgoing.find(c =>
          (c.condition ?? c.target).toLowerCase() === chosenLower
        );
        if (!exactMatch && outgoing.length > 0) {
          status = 'warning';
          stepRef.errorDetail = {
            message: `No exact condition match found — defaulted to first path`,
            cause: 'no_matching_path',
            suggestion: 'Review the decision conditions to ensure all possible inputs are handled',
          };
        }
      }

    } else if (node.type === 'GUARD' || node.type === 'CONDITION') {
      const ruleDesc = node.description || node.label;
      const systemPrompt = `You are a safety/condition checker. Evaluate whether the following input violates this rule: "${ruleDesc}". Respond with only "YES" (it violates) or "NO" (it does not violate).`;

      let tokens = 0;
      const verdict = await callLLM(settings, systemPrompt, llmInput, (t) => {
        tokens += t.length;
        stepRef.streamingText = (stepRef.streamingText ?? '') + t;
      });
      stepRef.tokenCount = tokens;

      const blocked = verdict.trim().toUpperCase().startsWith('YES');

      // Track condition result
      stepRef.conditionsEvaluated = [{
        condition: ruleDesc,
        result: !blocked,
        evaluatedValue: verdict.trim(),
      }];

      if (blocked) {
        const escalationConn = this.agent.connections.find(
          c => c.source === node.id && c.type === 'escalation'
        );
        output = `Guard blocked: ${verdict.trim()}`;
        status = 'blocked';
        nextNodeId = escalationConn?.target ?? null;
        stepRef.pathTaken = escalationConn ? 'escalation' : undefined;

        stepRef.errorDetail = {
          message: `Input blocked by guard "${node.label}": ${verdict.trim()}`,
          cause: 'guard_blocked',
          suggestion: escalationConn
            ? 'Input routed to escalation path'
            : 'Add an escalation connection to handle blocked inputs gracefully',
        };
      } else {
        output = input;
        status = 'complete';
        nextNodeId = this.getNextNode(node.id);
        stepRef.pathTaken = 'passed';
      }

    } else if (EXECUTABLE_TYPES.includes(node.type)) {
      const rules = this.getAttachedRules(node.id);
      const ruleText = rules.length > 0
        ? `\n\nApply these rules:\n${rules.map(r => `- ${r.description || r.label}`).join('\n')}`
        : '';

      const systemPrompt = (node.description || node.label) + ruleText + '\n\nBe concise — respond in 1-3 sentences max.';

      let tokens = 0;
      output = await callLLM(settings, systemPrompt, llmInput, (t) => {
        tokens += t.length;
        stepRef.streamingText = (stepRef.streamingText ?? '') + t;
      });
      stepRef.tokenCount = tokens;
      status = 'complete';
      nextNodeId = this.getNextNode(node.id);

    } else if (PASSTHROUGH_TYPES.includes(node.type)) {
      output = input;
      status = 'passthrough';
      nextNodeId = this.getNextNode(node.id);

    } else {
      output = input;
      status = 'passthrough';
      nextNodeId = this.getNextNode(node.id);
    }

    const finalStep: SimulationStep = {
      ...stepRef,
      output,
      status,
      tokenCount: stepRef.tokenCount,
    };

    return { step: finalStep, output, nextNodeId };
  }

  private getNextNode(nodeId: string): string | null {
    const conn = this.agent.connections.find(c => c.source === nodeId);
    return conn?.target ?? null;
  }

  private getAttachedRules(nodeId: string): NodeData[] {
    const ruleIds = this.agent.connections
      .filter(c => c.target === nodeId)
      .map(c => c.source);
    return this.agent.nodes.filter(n => ruleIds.includes(n.id) && n.type === 'RULE');
  }
}
