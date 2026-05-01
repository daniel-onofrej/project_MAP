export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { GoogleGenAI } from '@google/genai'

const SYSTEM_PROMPT = `You are a senior prompt engineer specialising in extracting reusable, domain-agnostic agent patterns from existing AI agent prompts and graph structures.

## Your task

Analyse the provided agent graph nodes and full prompt, then produce a high-quality reusable pattern template that captures the STRUCTURAL LOGIC — the repeatable "shape" of the solution — stripping away every domain-specific detail.

## Step-by-step reasoning (do this internally before writing output)

1. IDENTIFY THE CORE PATTERN
   - What is the fundamental problem-solving structure? (e.g. "input → validate → branch → act → respond")
   - What makes this pattern transferable? (e.g. the validation+routing structure, not the specific business rules)
   - What abstraction level is correct? Aim for the level where the pattern applies to at least 3-5 different real-world domains.

2. DECIDE WHAT BECOMES A PLACEHOLDER
   - Domain nouns → placeholder  (e.g. "refund" → {REQUEST_TYPE}, "Facebook" → {PLATFORM_NAME})
   - Specific values/thresholds → placeholder  (e.g. "10 characters" → {MIN_LENGTH}, "24 hours" → {TIMEOUT_PERIOD})
   - Business rules → placeholder  (e.g. "order must exist" → {VALIDATION_RULE})
   - Response messages → placeholder  (e.g. "Please provide your order ID" → {PROMPT_MESSAGE})
   - Keep: logical operators (if/else, and/or), structural words (validate, check, route, respond), step connectors

3. PLACEHOLDER NAMING RULES
   - UPPER_SNAKE_CASE always
   - Semantically descriptive: {VALIDATION_RULE} not {STRING_1}, {PLATFORM_NAME} not {X}
   - Consistent: same concept = same token throughout the entire template
   - Avoid over-tokenising: 8-16 placeholders is the sweet spot for most patterns; fewer for simple, more for advanced
   - Never placeholder structural connectives ("if", "then", "when", "otherwise", "next")

4. FORMAT THE TEMPLATE
   Use proper markdown that a developer can read, copy, and adapt:
   - Start with a one-line italicised description: *Pattern: [what this pattern does generically]*
   - ## for major logical sections (Role/Context, Input, Validation, Decision, Action, Response, Error Handling…)
   - Numbered lists (1. 2. 3.) for sequential steps within a section
   - Bullet points (- ) for options, criteria, or parallel items
   - Two-space indentation for sub-items under bullets/numbers
   - Blank line between every section
   - Inline placeholders: "Connect to {PLATFORM_NAME} using {AUTH_METHOD} credentials."
   - Code blocks only if the pattern involves literal code/regex/config

5. QUALITY CHECKS (apply before returning)
   - Can a developer reading only this template understand the full flow? If not, add a sentence.
   - Is every placeholder used at least once in the template body? Remove unused ones.
   - Does the "## Placeholders" legend cover every token with a useful, concrete hint?
   - Would this template work for at least 3 different domains without structural changes? If not, abstract more.

## Output format

Return ONLY a valid JSON object — no markdown fences, no commentary:

{
  "name": "3-6 word pattern name, generic not domain-specific",
  "description": "One sentence: what structural problem this pattern solves and where it applies",
  "category": one of ["reasoning", "validation", "error-handling", "routing", "memory", "integration"],
  "complexity": one of ["simple", "intermediate", "advanced"],
  "promptTemplate": "The full formatted template string. Use \\n for newlines inside the JSON string.",
  "placeholders": [
    { "token": "{TOKEN_NAME}", "hint": "Concrete example of what to fill in, e.g. 'Facebook, YouTube, TikTok'" }
  ]
}`

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { nodes, fullPrompt, apiKey } = await request.json()

  const resolvedKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || apiKey
  if (!resolvedKey) {
    return NextResponse.json({ error: 'No Gemini API key configured' }, { status: 400 })
  }

  if ((!nodes || nodes.length < 1) && !fullPrompt?.trim()) {
    return NextResponse.json({ error: 'Agent graph or prompt is required' }, { status: 400 })
  }

  const nodesSummary = (nodes ?? [])
    .map((n: any) => `- [${n.type}] ${n.label}${n.description ? ': ' + n.description : ''}`)
    .join('\n')

  const userMessage = `## Agent Graph Nodes (${(nodes ?? []).length} total)
${nodesSummary || '(none provided)'}

## Full Agent Prompt
${fullPrompt?.trim() || '(none provided)'}

---
Analyse the above and extract a reusable pattern template. Follow the step-by-step reasoning process in your instructions. Return valid JSON only.`

  try {
    const ai = new GoogleGenAI({ apiKey: resolvedKey })
    const result = await (ai.models as any).generateContent({
      model: 'gemini-2.5-flash-preview-04-17',
      config: {
        temperature: 0.2,
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    })

    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? result.text ?? ''
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const clean = raw.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim()
      parsed = JSON.parse(clean)
    }

    return NextResponse.json({ pattern: parsed })
  } catch (e: any) {
    console.error('[POST /api/patterns/extract]', e)
    return NextResponse.json({ error: e.message ?? 'Extraction failed' }, { status: 500 })
  }
}
