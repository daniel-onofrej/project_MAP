import { GoogleGenAI } from '@google/genai';
import type { AgentConfig } from '../types';
import { DEFAULT_GEMINI_MODEL } from '../types';

const GRAPH_CHAT_SYSTEM_PROMPT = `## Graph Chat Agent

You are a read-only assistant that answers questions about a visual AI workflow graph.

You receive:
1. The current agent graph as JSON (nodes + connections + originalPrompt)
2. A question from the user

Rules:
- Answer clearly and concisely in plain text (markdown is fine).
- NEVER output JSON. NEVER modify or propose changes to the graph.
- Draw on the graph structure, node labels, descriptions, logic_snippets, and connections to give accurate answers.
- If asked about a specific node, quote its label and describe its role.
- If asked about flow, trace paths through the connections.
- If the question cannot be answered from the graph, say so honestly.`;

export interface GraphChatAgentOptions {
  userMessage: string;
  currentAgent: AgentConfig;
  apiKey: string;
  model?: string;
}

export interface GraphChatAgentResult {
  answer: string;
}

export async function graphChatAgent(
  options: GraphChatAgentOptions
): Promise<GraphChatAgentResult> {
  const { userMessage, currentAgent, apiKey, model = DEFAULT_GEMINI_MODEL } = options;

  const agentSnapshot = {
    id: currentAgent.id,
    name: currentAgent.name,
    originalPrompt: currentAgent.originalPrompt ?? '',
    nodes: currentAgent.nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
      description: n.description ?? '',
      logicSnippet: (n.config as Record<string, unknown>)?.logicSnippet ?? '',
    })),
    connections: currentAgent.connections.map(c => ({
      id: c.id,
      source: c.source,
      target: c.target,
      condition: c.condition ?? '',
    })),
  };

  const userPrompt = `AGENT GRAPH:
${JSON.stringify(agentSnapshot, null, 2)}

QUESTION:
${userMessage}`;

  const ai = new GoogleGenAI({ apiKey });

  let answer = '';
  const stream = await (ai.models as any).generateContentStream({
    model,
    config: {
      temperature: 0.3,
      topP: 0.9,
      systemInstruction: GRAPH_CHAT_SYSTEM_PROMPT,
    },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  });

  for await (const chunk of stream) {
    answer += (chunk as any).text ?? '';
  }

  return { answer: answer.trim() };
}
