/**
 * Unified provider client — routes generation calls to the correct AI provider
 * using their REST APIs directly (no SDK dependencies).
 *
 * Returns the raw text content of the model's first message, suitable for
 * JSON parsing by the calling pipeline.
 */

import { GoogleGenAI } from '@google/genai';
import type { ProviderConfig } from '../types';
import { OPENAI_REASONING_MODELS } from '../types';
import { DEFAULT_GEMINI_MODEL } from '../types';

export interface ProviderCallOptions {
  config: ProviderConfig;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  /** Optional streaming callback — receives token chunks as they arrive */
  onChunk?: (text: string) => void;
}

export async function callProvider(options: ProviderCallOptions): Promise<string> {
  const { config, apiKey, systemPrompt, userPrompt, onChunk } = options;

  switch (config.provider) {
    case 'gemini':
      return callGemini(config, apiKey, systemPrompt, userPrompt, onChunk);
    case 'openai':
      return callOpenAI(config, apiKey, systemPrompt, userPrompt, onChunk);
    case 'anthropic':
      return callAnthropic(config, apiKey, systemPrompt, userPrompt, onChunk);
    case 'groq':
      return callOpenAICompatible(config, apiKey, 'https://api.groq.com/openai/v1', systemPrompt, userPrompt, onChunk);
    case 'custom':
      if (!config.baseUrl) throw new Error('Custom provider requires a base URL.');
      return callOpenAICompatible(config, apiKey, config.baseUrl, systemPrompt, userPrompt, onChunk);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(
  config: ProviderConfig,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  if (!apiKey) throw new Error('Gemini API key not configured.');
  const ai = new GoogleGenAI({ apiKey });
  const model = config.model || DEFAULT_GEMINI_MODEL;

  let raw = '';
  const stream = await (ai.models as any).generateContentStream({
    model,
    config: {
      temperature: config.temperature ?? 0,
      maxOutputTokens: config.maxTokens,
      systemInstruction: systemPrompt,
    },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  });

  for await (const chunk of stream) {
    const text = (chunk as any).text ?? '';
    if (text) { onChunk?.(text); raw += text; }
  }
  return raw;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function callOpenAI(
  config: ProviderConfig,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  if (!apiKey) throw new Error('OpenAI API key not configured.');
  return callOpenAICompatible(config, apiKey, 'https://api.openai.com/v1', systemPrompt, userPrompt, onChunk);
}

// ── OpenAI-compatible (OpenAI, Groq, Custom) ─────────────────────────────────

async function callOpenAICompatible(
  config: ProviderConfig,
  apiKey: string,
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const isReasoningModel = OPENAI_REASONING_MODELS.has(config.model);

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: !!onChunk,
  };

  if (isReasoningModel) {
    // o1/o3 models: use reasoning_effort instead of temperature
    if (config.reasoningEffort) body.reasoning_effort = config.reasoningEffort;
    // temperature is not supported for reasoning models
  } else {
    if (config.temperature !== undefined) body.temperature = config.temperature;
  }

  if (config.maxTokens) body.max_completion_tokens = config.maxTokens;

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  // Streaming
  if (onChunk && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const data = JSON.parse(line.slice(6));
          const text = data.choices?.[0]?.delta?.content ?? '';
          if (text) { onChunk(text); raw += text; }
        } catch { /* skip malformed SSE lines */ }
      }
    }
    return raw;
  }

  // Non-streaming
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function callAnthropic(
  config: ProviderConfig,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  if (!apiKey) throw new Error('Anthropic API key not configured.');

  const useThinking = config.extendedThinking === true;

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens ?? (useThinking ? 16000 : 8192),
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    stream: !!onChunk,
  };

  if (useThinking) {
    body.thinking = { type: 'enabled', budget_tokens: config.thinkingBudget ?? 8000 };
    // Temperature must be 1 when extended thinking is enabled
    body.temperature = 1;
  } else {
    if (config.temperature !== undefined) body.temperature = config.temperature;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'interleaved-thinking-2025-05-14',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  // Streaming
  if (onChunk && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          // Skip thinking blocks, only stream text blocks
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text ?? '';
            if (text) { onChunk(text); raw += text; }
          }
        } catch { /* skip malformed lines */ }
      }
    }
    return raw;
  }

  // Non-streaming — extract only text blocks (skip thinking blocks)
  const data = await res.json();
  return (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
}
