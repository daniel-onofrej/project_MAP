import type { AgentSettings } from '../types';
/**
 * Calls the LLM configured in agent settings and returns the full response text.
 * Fires onChunk for each token if provided (for streaming UI).
 * Currently supports Gemini only; settings.llmProvider is checked so other
 * providers can be wired in later.
 */
export declare function callLLM(settings: AgentSettings, systemPrompt: string, userMessage: string, onChunk?: (text: string) => void, responseSchema?: any, responseMimeType?: string): Promise<string>;
