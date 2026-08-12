import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { validateLiveFramingResponse, validateCompactFramingResponse } from '../../../lib/validation';
import { assembleLiveFraming } from '../../../lib/assembleFraming';
import { stagedFraming } from '../../../lib/stagedContent';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// COMPACT LIVE-AI SCHEMA
// Live AI generates ONLY the genuinely dynamic framing delta:
// - priority_order: investigation priority among the canonical A/B/C variables
// - priority_rationale: one short rationale per variable
// - interaction: at most one interaction worth investigating (or null)
// - missing_evidence: one concise missing-evidence observation
// Everything else (source text, project facts, prepared-pilot content, evidence)
// is server-owned and assembled around this delta in assembleLiveFraming().
const COMPACT_PROMPT = `You are an AI decision consultant for building performance professionals. A Chicago office façade/envelope decision has three canonical adjustable variables:

A = Window Area (south window area: baseline 16.56 m² vs reduced 12.42 m² = 75% of baseline)
B = Overhang Depth (main south overhang: baseline 1.3m vs extended 2.0m)
C = Wall Insulation (exterior wall insulation IN02 thickness: baseline 0.090m vs increased 0.140m)

Constraints: retain ≥70% of baseline south window area (11.59 m² minimum), reduce cooling energy, avoid major HVAC redesign, avoid deep/visually dominant projections, prefer lower construction complexity.

Task: produce ONLY a compact framing delta — do not restate project facts, do not invent performance numbers, energy savings, costs, or payback periods.

Return valid JSON only (no markdown), exactly this shape:
{
  "priority_order": ["A","B","C"],
  "priority_rationale": {
    "A": "one short sentence, conceptual only, no invented numbers",
    "B": "one short sentence, conceptual only, no invented numbers",
    "C": "one short sentence, conceptual only, no invented numbers"
  },
  "interaction": {"variable_ids": ["A","B"], "rationale": "one short sentence, conceptual only, no invented numbers"},
  "missing_evidence": "one concise sentence naming what evidence is still needed"
}

Rules:
- priority_order must be a permutation of exactly ["A","B","C"], most important first.
- interaction may include 1-3 of A/B/C, or be null if no interaction stands out.
- Do not use raw identifiers with underscores. Do not quantify predicted outcomes (no "%", "GJ", "kWh", "$", "payback", "low-cost", "low-risk").
- Be concise: each rationale is one sentence.`;

// Minimal thinking budget: this installed SDK/API requires thinking budget_tokens >= 1024
// when thinking is enabled, so the fastest safe option for a compact structured JSON
// response is to disable thinking entirely for this call.
const THINKING_CONFIG = { type: 'disabled' as const };
const COMPACT_MAX_TOKENS = 1024;

async function callCompactFraming(prompt: string) {
  const stream = anthropic.messages.stream(
    {
      model,
      max_tokens: COMPACT_MAX_TOKENS,
      thinking: THINKING_CONFIG,
      messages: [{ role: 'user', content: prompt }]
    },
    { maxRetries: 0 }
  );

  const message = await stream.finalMessage();
  const textContent = message.content.find((c: any) => c.type === 'text') as any;
  if (!textContent || !textContent.text) {
    throw new Error(`No text content in response (got ${message.content.map((c: any) => c.type).join(', ')})`);
  }

  let jsonText = textContent.text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  return {
    parsed: JSON.parse(jsonText),
    usage: message.usage
  };
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    // Client input kept for logging/parity; the compact prompt is self-contained
    // (all project facts are server-owned canonical content, not client-supplied).
    await request.json().catch(() => ({}));

    console.log('[Framing API] Request received');
    console.log('[Framing API] API Key exists:', !!process.env.ANTHROPIC_AUTH_TOKEN);
    console.log('[Framing API] Base URL:', process.env.ANTHROPIC_BASE_URL);
    console.log('[Framing API] Model:', model);

    console.log('[Framing API] Calling Anthropic API (compact, streaming)...');
    const apiStartTime = Date.now();

    let compactResult;
    try {
      compactResult = await callCompactFraming(COMPACT_PROMPT);
    } catch (err: any) {
      const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(2);
      console.error('[Framing API] Compact call failed after', apiDuration + 's:', err.message);
      throw err;
    }

    const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(2);
    console.log('[Framing API] Compact response received. API call duration:', apiDuration + 's');
    console.log('[Framing API] Output tokens:', compactResult.usage?.output_tokens, 'Thinking tokens:', compactResult.usage?.output_tokens_details?.thinking_tokens);

    const compactValidation = validateCompactFramingResponse(compactResult.parsed);

    if (!compactValidation.valid) {
      console.warn('[Framing API] Compact validation failed:', compactValidation.errors);

      // Attempt one retry with validation feedback
      console.log('[Framing API] Retrying compact call with validation feedback...');
      const retryStartTime = Date.now();
      const errorFeedback = compactValidation.errors.map(e => `- ${e.field}: ${e.message}`).join('\n');
      const retryPrompt = `${COMPACT_PROMPT}\n\nVALIDATION ERRORS FROM PREVIOUS ATTEMPT:\n${errorFeedback}\n\nPlease fix these errors and return valid JSON.`;

      try {
        const retryResult = await callCompactFraming(retryPrompt);
        const retryValidation = validateCompactFramingResponse(retryResult.parsed);

        if (retryValidation.valid && retryValidation.sanitized) {
          const assembled = assembleLiveFraming(retryValidation.sanitized);
          const finalValidation = validateLiveFramingResponse(assembled);

          if (finalValidation.valid) {
            const retryDuration = ((Date.now() - retryStartTime) / 1000).toFixed(2);
            const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log('[Framing API] Retry successful after', retryDuration + 's. Total duration:', totalDuration + 's');
            return NextResponse.json({
              success: true,
              data: finalValidation.sanitized,
              mode: 'live',
              duration_seconds: totalDuration,
              retried: true
            });
          }
        }
        console.warn('[Framing API] Retry validation also failed');
        throw new Error('Compact validation failed after retry');
      } catch (retryError: any) {
        console.error('[Framing API] Retry failed:', retryError.message);
      }

      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('[Framing API] Returning fallback after validation failure. Total duration:', totalDuration + 's');
      return NextResponse.json({
        success: false,
        data: stagedFraming,
        mode: 'staged',
        duration_seconds: totalDuration,
        fallback_reason: compactValidation.errors.slice(0, 2).map(e => e.message).join('; ')
      });
    }

    // Server-side assembly: compact AI delta -> full UI/validator shape, using
    // only server-owned canonical/source content (model never invents source text).
    const assembled = assembleLiveFraming(compactValidation.sanitized!);

    // Preserve existing fail-closed validation and canonical-ID restrictions on the
    // assembled result (defense in depth — assembly is server-owned but re-validated).
    const finalValidation = validateLiveFramingResponse(assembled);

    if (!finalValidation.valid) {
      console.warn('[Framing API] Assembled response failed structural validation:', finalValidation.errors);
      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      return NextResponse.json({
        success: false,
        data: stagedFraming,
        mode: 'staged',
        duration_seconds: totalDuration,
        fallback_reason: finalValidation.errors.slice(0, 2).map(e => e.message).join('; ')
      });
    }

    if (finalValidation.warnings.length > 0) {
      console.warn('[Framing API] Validation warnings:', finalValidation.warnings);
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('[Framing API] Validation passed! Total duration:', totalDuration + 's');

    return NextResponse.json({ success: true, data: finalValidation.sanitized, mode: 'live', duration_seconds: totalDuration });
  } catch (error: any) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error('[Framing API] Error after', totalDuration + 's:', error.message);
    if (error.stack) {
      console.error('[Framing API] Stack:', error.stack);
    }

    return NextResponse.json({
      success: false,
      data: stagedFraming,
      mode: 'staged',
      duration_seconds: totalDuration,
      error: error.message
    });
  }
}
