// Prompt-to-Graph V6 — Type Classification (Stage 0.5)
// Fast single LLM call (max 64 tokens) to detect prompt category before main generation.

import { GoogleGenAI } from '@google/genai';
import type { Ledger, PromptType, V6Options } from './types';
import { DEFAULT_GEMINI_MODEL } from '../../types';
import { formatLedger } from './parse';

/**
 * Classify the prompt type using a fast Gemini call.
 * Returns the detected category and confidence score.
 *
 * This is Stage 0.5 of the V6 pipeline — a lightweight pre-flight classification
 * that informs which specialized system prompt is used in the main generation stage.
 */
export async function classifyPromptType(
  ledger: Ledger,
  options: V6Options,
): Promise<{ type: PromptType; confidence: number }> {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const apiKey = options.apiKey;

  const systemPrompt = `Classify this prompt as exactly one of:
  business-flow   — customer service, refunds, support, approval workflows
  skill-workflow  — developer skill or command with phases, checklists, "When to Use"
  agent-spec      — named agent definition with role, responsibilities, methodology
  loop-pattern    — iterative cycle, DAG orchestration, continuous loop, pipeline

Reply with ONLY a JSON object: {"type": "<one of above>", "confidence": 0.0-1.0}`;

  const userMessage = `Classify this prompt:\n\n${formatLedger(ledger)}`;

  // Retry up to 3 times on transient errors
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        config: {
          temperature: 0,
          topP: 0,
          thinkingConfig: { thinkingLevel: 'MINIMAL' } as any,
          maxOutputTokens: 64,
          responseMimeType: 'application/json',
          systemInstruction: systemPrompt,
        } as any,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      });

      const raw = response.text?.trim() ?? '';
      if (!raw) {
        throw new Error('Empty response from LLM');
      }

      // Parse JSON response
      const parsed = JSON.parse(raw);

      // Validate response
      const validTypes: PromptType[] = ['business-flow', 'skill-workflow', 'agent-spec', 'loop-pattern'];
      if (!validTypes.includes(parsed.type)) {
        throw new Error(`Invalid type: ${parsed.type}`);
      }
      if (typeof parsed.confidence !== 'number') {
        throw new Error('Invalid confidence value');
      }

      // Clamp confidence to [0, 1]
      const confidence = Math.max(0, Math.min(1, parsed.confidence));

      // If confidence is too low, treat as uncertain
      if (confidence < 0.7) {
        return { type: 'business-flow', confidence: 0.5 };
      }

      return { type: parsed.type as PromptType, confidence };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a transient error worth retrying
      const errorMsg = lastError.message.toLowerCase();
      const isTransient =
        errorMsg.includes('fetch failed') ||
        errorMsg.includes('timeout') ||
        errorMsg.includes('429') ||
        errorMsg.includes('503');

      if (!isTransient && attempt > 0) {
        // Non-transient error after first attempt: bail out
        break;
      }

      // If this was the last attempt, don't retry
      if (attempt === 2) {
        break;
      }

      // Exponential backoff before retry: 100ms * 2^attempt
      const delayMs = 100 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Fallback on any error: return business-flow with low confidence
  console.error('[classify] LLM call failed:', lastError?.message ?? 'unknown error');
  return { type: 'business-flow', confidence: 0.5 };
}
