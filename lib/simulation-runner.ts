import type {
  AgentConfig, NodeData, NodeType,
  SimulationStep, SimulationStepStatus, DataChange, ConditionResult,
  PreFlightIssue,
} from './types';
import { callLLM } from './ai/llm-client';

interface NodeSampleData {
  nodeId: string;
  expectedInput: string;
  expectedOutput: string;
  conditionResults?: { condition: string; result: boolean; evaluatedValue?: string }[];
  chosenPath?: string;
}

/** Deterministic simulation runner.
 * Calls Gemini once to generate realistic sample data for the entire graph,
 * then walks through nodes instantly using that pre-generated data.
 */
export class DeterministicRunner {
  private agent: AgentConfig;
  private initialInput: string;
  private sampleData: Map<string, NodeSampleData> = new Map();

  constructor(agent: AgentConfig, initialInput: string) {
    this.agent = agent;
    this.initialInput = initialInput;
  }

  /** Generate sample data for all nodes in one LLM call */
  async generateSampleData(onChunk?: (text: string) => void): Promise<void> {
    if (!this.agent.settings?.apiKey) {
      throw new Error('No API key configured. Open Settings and add your Gemini API key.');
    }

    const graphDescription = this.agent.nodes.map(n => {
      const outgoing = this.agent.connections.filter(c => c.source === n.id);
      const targets = outgoing.map(c => {
        const targetNode = this.agent.nodes.find(t => t.id === c.target);
        return `→ ${targetNode?.label || c.target}${c.condition ? ` (if: ${c.condition})` : ''}`;
      });
      return `- [${n.type}] "${n.label}" (id: ${n.id})${n.description ? `: ${n.description}` : ''}${targets.length > 0 ? `\n    ${targets.join('\n    ')}` : ''}`;
    }).join('\n');

    const systemPrompt = `You are a simulation data generator. Given an agent graph and test input, generate realistic sample data showing what each node would receive and produce.

Return ONLY a JSON array. Each element must have:
- "nodeId": the node's id
- "expectedInput": realistic input string this node would receive (max 80 chars, be concise)
- "expectedOutput": realistic output string this node would produce (max 80 chars, be concise)
- "conditionResults": (only for DECISION/GUARD/CONDITION nodes) array of { "condition": string, "result": boolean, "evaluatedValue": string }
- "chosenPath": (only for DECISION nodes) which path label was chosen

Be realistic — use concrete values, not placeholders. Keep input/output strings short and factual. Follow the actual logic described in each node.`;

    const userMessage = `Agent: ${this.agent.name}
${this.agent.description ? `Description: ${this.agent.description}` : ''}

Graph nodes and connections:
${graphDescription}

Test input: ${this.initialInput}

Generate the sample data JSON array:`;

    let raw = '';
    raw = await callLLM(this.agent.settings!, systemPrompt, userMessage, onChunk);

    // Parse the JSON response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to generate sample data — LLM response did not contain valid JSON array');
    }

    try {
      const samples: NodeSampleData[] = JSON.parse(jsonMatch[0]);
      for (const sample of samples) {
        this.sampleData.set(sample.nodeId, sample);
      }
    } catch (e) {
      throw new Error('Failed to parse sample data JSON: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  /** Run pre-flight structural checks */
  preFlightCheck(): PreFlightIssue[] {
    const issues: PreFlightIssue[] = [];

    const startNode = this.agent.nodes.find(n => n.type === 'START');
    if (!startNode) {
      issues.push({
        severity: 'error',
        message: 'No START node found in agent graph',
        nodeIds: [],
        suggestion: 'Add a START node to begin the execution flow',
      });
    }

    const endNodes = this.agent.nodes.filter(n => n.type === 'END' || n.type === 'HANDOFF');
    if (endNodes.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'No END or HANDOFF node found',
        nodeIds: [],
        suggestion: 'Add an END node to mark completion',
      });
    }

    const hasOutgoing = new Set(this.agent.connections.map(c => c.source));
    const deadEnds = this.agent.nodes.filter(
      n => !hasOutgoing.has(n.id) && n.type !== 'END' && n.type !== 'HANDOFF'
    );
    for (const node of deadEnds) {
      issues.push({
        severity: 'warning',
        message: `"${node.label}" has no outgoing connections`,
        nodeIds: [node.id],
        suggestion: `Add a connection from "${node.label}" to continue the flow`,
      });
    }

    return issues;
  }

  /** Walk the graph using pre-generated sample data */
  async *run(): AsyncGenerator<SimulationStep> {
    const startNode = this.agent.nodes.find(n => n.type === 'START');
    if (!startNode) {
      throw new Error('No START node found');
    }

    let currentNodeId: string | null = startNode.id;
    let currentInput = this.initialInput;
    let stepCount = 0;
    const visited = new Set<string>();

    while (currentNodeId && stepCount < 50) {
      const node = this.agent.nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      // Cycle detection
      if (visited.has(node.id)) {
        yield {
          nodeId: node.id,
          nodeType: node.type,
          nodeLabel: node.label,
          input: currentInput,
          output: 'Cycle detected — stopping',
          dataTransformations: [],
          status: 'error',
          errorDetail: {
            message: `Cycle detected at "${node.label}" — this node was already visited`,
            cause: 'dead_end',
            suggestion: 'Remove the circular connection to prevent infinite loops',
          },
          timestamp: Date.now(),
          tokenCount: 0,
        };
        break;
      }
      visited.add(node.id);
      stepCount++;

      const sample = this.sampleData.get(node.id);
      const output = sample?.expectedOutput ?? currentInput;

      const step: SimulationStep = {
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.label,
        input: currentInput,
        output,
        dataTransformations: computeDataChanges(currentInput, output),
        conditionsEvaluated: sample?.conditionResults?.map(cr => ({
          condition: cr.condition,
          result: cr.result,
          evaluatedValue: cr.evaluatedValue,
        })),
        pathTaken: sample?.chosenPath,
        status: 'complete' as SimulationStepStatus,
        timestamp: Date.now(),
        tokenCount: 0,
      };

      // Determine next node
      let nextNodeId: string | null = null;

      if (node.type === 'END' || node.type === 'HANDOFF') {
        step.status = node.type === 'HANDOFF' ? 'handoff' : 'complete';
        yield step;
        break;
      } else if (node.type === 'DECISION') {
        const outgoing = this.agent.connections.filter(c => c.source === node.id);
        const allPaths = outgoing.map(c => c.condition || this.agent.nodes.find(n => n.id === c.target)?.label || c.target);
        step.alternativePaths = allPaths.filter(p => p !== step.pathTaken);

        // Find matching connection
        if (sample?.chosenPath) {
          const match = outgoing.find(c =>
            (c.condition || this.agent.nodes.find(n => n.id === c.target)?.label || '')
              .toLowerCase().includes(sample.chosenPath!.toLowerCase())
          );
          nextNodeId = match?.target ?? outgoing[0]?.target ?? null;
        } else {
          nextNodeId = outgoing[0]?.target ?? null;
        }

        if (!nextNodeId) {
          step.status = 'error';
          step.errorDetail = {
            message: 'No matching path found for decision',
            cause: 'no_matching_path',
            suggestion: 'Ensure all decision branches have connections',
          };
        }
      } else if (node.type === 'GUARD' || node.type === 'CONDITION') {
        const passed = sample?.conditionResults?.[0]?.result ?? true;
        if (!passed) {
          step.status = 'blocked';
          const escalation = this.agent.connections.find(
            c => c.source === node.id && c.type === 'escalation'
          );
          nextNodeId = escalation?.target ?? null;
          step.pathTaken = escalation ? 'escalation' : 'blocked';
          step.errorDetail = {
            message: `Guard "${node.label}" blocked the input`,
            cause: 'guard_blocked',
            suggestion: escalation ? 'Routed to escalation path' : 'Add an escalation connection',
          };
        } else {
          step.pathTaken = 'passed';
          nextNodeId = this.getNextNode(node.id);
        }
      } else {
        nextNodeId = this.getNextNode(node.id);
        step.status = ['START', 'RULE', 'CONFIG', 'PERSONA', 'REFERENCE', 'TRIGGER', 'LOGGING', 'INPUT', 'OPTION'].includes(node.type)
          ? 'passthrough' : 'complete';
      }

      // Dead-end check
      if (!nextNodeId && (node.type as string) !== 'END' && (node.type as string) !== 'HANDOFF' && step.status !== 'error' && step.status !== 'blocked') {
        step.status = 'warning';
        step.errorDetail = {
          message: `"${node.label}" has no outgoing connection`,
          cause: 'dead_end',
          suggestion: `Add a connection from "${node.label}" to continue the flow`,
        };
      }

      yield step;
      currentInput = output;
      currentNodeId = nextNodeId;
    }
  }

  private getNextNode(nodeId: string): string | null {
    const conn = this.agent.connections.find(c => c.source === nodeId);
    return conn?.target ?? null;
  }
}

/** Diff two strings and return DataChange[] (shared with agent-runner.ts) */
function computeDataChanges(inputStr: string, outputStr: string): DataChange[] {
  const changes: DataChange[] = [];
  try {
    const inputObj = JSON.parse(inputStr);
    const outputObj = JSON.parse(outputStr);
    if (typeof inputObj !== 'object' || typeof outputObj !== 'object') {
      if (inputStr !== outputStr) {
        changes.push({ field: '(raw)', before: inputStr.slice(0, 200), after: outputStr.slice(0, 200), changeType: 'modified' });
      }
      return changes;
    }

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
    if (inputStr !== outputStr) {
      changes.push({ field: '(raw)', before: inputStr.slice(0, 200), after: outputStr.slice(0, 200), changeType: 'modified' });
    }
  }
  return changes;
}
