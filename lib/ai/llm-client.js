import { GoogleGenAI } from '@google/genai';
import { DEFAULT_GEMINI_MODEL } from '../types';
/**
 * Calls the LLM configured in agent settings and returns the full response text.
 * Fires onChunk for each token if provided (for streaming UI).
 * Currently supports Gemini only; settings.llmProvider is checked so other
 * providers can be wired in later.
 */
export async function callLLM(settings, systemPrompt, userMessage, onChunk, responseSchema, responseMimeType) {
    if (!settings.apiKey) {
        throw new Error('No API key configured. Open Settings and add your API key.');
    }
    if (settings.llmProvider !== 'gemini' && settings.llmProvider !== 'custom') {
        // For now only Gemini is supported for execution
        // Other providers can be added later without changing callers
        throw new Error(`Provider "${settings.llmProvider}" is not yet supported for agent execution. Switch to Gemini in Settings.`);
    }
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const model = settings.model || DEFAULT_GEMINI_MODEL;
    const temperature = settings.temperature ?? 0.7;
    let raw = '';
    const stream = await ai.models.generateContentStream({
        model,
        config: {
            temperature,
            systemInstruction: systemPrompt,
            responseSchema,
            responseMimeType,
        },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    });
    for await (const chunk of stream) {
        const text = chunk.text ?? '';
        onChunk?.(text);
        raw += text;
    }
    return raw;
}
//# sourceMappingURL=llm-client.js.map