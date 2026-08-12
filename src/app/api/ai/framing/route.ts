import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { validateLiveFramingResponse } from '../../../lib/validation';
import { stagedFraming } from '../../../lib/stagedContent';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// FRAMING_SCHEMA: defines what Live AI must return.
// - requirements removed: project constraints/targets/preferences are reasoning context,
//   not a returned field. Relevant source-backed goals belong in decision_framing.relevant_goals.
// - simulation test set design is owned by PREPARED_PILOT; Live AI must not rationalize or output it.
const FRAMING_SCHEMA = {
  type: 'object',
  required: ['decision_framing', 'candidate_drivers', 'hidden_assumptions', 'missing_evidence', 'prioritized_hypotheses'],
  properties: {
    decision_framing: {
      type: 'object',
      required: ['current_decision', 'relevant_goals'],
      properties: {
        current_decision: {
          type: 'object',
          required: ['claim', 'source_type'],
          properties: {
            claim: { type: 'string' },
            source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] },
            source: { type: 'string' },
            canonical_decision_id: { type: 'string' }
          }
        },
        relevant_goals: {
          type: 'array',
          items: {
            type: 'object',
            required: ['claim', 'source_type'],
            properties: {
              claim: { type: 'string' },
              source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] },
              source: { type: 'string' },
              canonical_source_goal_id: { type: 'string' }
            }
          }
        }
      }
    },
    candidate_drivers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'source_type'],
        properties: {
          claim: { type: 'string' },
          source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] },
          source: { type: 'string' },
          canonical_source_fact_id: { type: 'string' }
        }
      }
    },
    hidden_assumptions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['claim', 'source_type'],
        properties: {
          claim: { type: 'string' },
          source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] },
          source: { type: 'string' }
        }
      }
    },
    missing_evidence: { type: 'array', items: { type: 'string' } },
    prioritized_hypotheses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'variable_ids', 'what_it_is', 'why_now', 'affects_requirements', 'why_test_together', 'potential_upside', 'potential_downside', 'unknown', 'what_would_change_priority', 'priority_factors'],
        properties: {
          name: { type: 'string' },
          variable_ids: { type: 'array', items: { type: 'string', enum: ['A', 'B', 'C'] }, minItems: 1, maxItems: 3 },
          what_it_is: { type: 'string' },
          why_now: { type: 'string' },
          affects_requirements: { type: 'string' },
          why_test_together: { type: 'string' },
          potential_upside: { type: 'string' },
          potential_downside: { type: 'string' },
          unknown: { type: 'string' },
          what_would_change_priority: { type: 'string' },
          priority_bucket: { type: 'string', enum: ['FOCUS_NOW', 'WATCH_DEFER', 'NO_NEW_ANALYSIS'] },
          priority_factors: { type: 'object' }
        }
      }
    }
  }
};

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const { clientBrief, modelFacts, decisionContext } = await request.json();

    console.log('[Framing API] Request received');
    console.log('[Framing API] API Key exists:', !!process.env.ANTHROPIC_AUTH_TOKEN);
    console.log('[Framing API] Base URL:', process.env.ANTHROPIC_BASE_URL);
    console.log('[Framing API] Model:', model);

    const prompt = `You are an AI decision consultant for building performance professionals. Frame this envelope design decision by identifying which variable relationships deserve evidence.

INPUT:
Client Brief: ${clientBrief}
Model Facts: ${modelFacts}
Decision Context: ${decisionContext}

CRITICAL CONSTRAINT INTERPRETATION:
The client constraint "retain ≥70% of baseline south window area" means:
- Baseline window area: 16.56 m²
- Minimum allowed: 11.59 m² (70% of 16.56 m²)
- Tested reduced area: 12.42 m² (75% of baseline, meets constraint)
This is NOT a window-to-wall ratio (WWR) or glazing percentage of the façade.

PRE-EVIDENCE RULES:
- Tag each claim: SOURCE (from files), INFERENCE (AI reasoning), ASSUMPTION (working hypothesis), DOMAIN_KNOWLEDGE (building science principle), NEEDS_EVIDENCE (requires measurement), or NEEDS_REVIEW (source unknown/missing)
- NEVER invent performance numbers, energy savings percentages, cost estimates, payback periods, or risk characterizations (like "low-cost" or "low-risk") before evidence
- NEVER quantify predicted outcomes: do not write "X% reduction", "Y GJ savings", "$Z cost", "N-year payback" or any measured performance numbers in candidate_drivers or hypothesis fields
- You may state SOURCE facts (e.g., "baseline window area is 16.56 m²") but not invented predictions
- Describe potential directions conceptually; do not quantify outcomes

CANONICAL IDs FOR SOURCE ENTRIES:
If you use source_type SOURCE for the following, you MUST include the matching canonical ID:
- current_decision about selecting envelope combinations: canonical_decision_id = "envelope-parametric-selection"
- project goal about cooling/façade openness: canonical_source_goal_id = "cooling-retention"
- project goal about annual energy without HVAC redesign: canonical_source_goal_id = "annual-energy"
- candidate driver about WF-1 south window geometry: canonical_source_fact_id = "WF-1-geometry"
- candidate driver about existing 1.3m overhang: canonical_source_fact_id = "overhang-depth-1.3m"
- candidate driver about IN02 wall insulation 90mm: canonical_source_fact_id = "IN02-thickness-0.090m"
If you have no valid canonical ID, use DOMAIN_KNOWLEDGE, INFERENCE, ASSUMPTION, NEEDS_EVIDENCE, or NEEDS_REVIEW instead of SOURCE.

CONSIDER (reasoning context only — do not surface as separate output fields):
Project constraints, targets, preferences, and open questions should inform your framing reasoning.
Source-backed goals belong in decision_framing.relevant_goals (with canonical_source_goal_id if applicable).

FOCUS_NOW BOUNDARY:
- FOCUS_NOW hypotheses may ONLY use these adjustable variables: A (south window area), B (south overhang depth), C (exterior wall insulation thickness)
- Maximum 3 FOCUS_NOW hypotheses total
- Each FOCUS_NOW hypothesis MUST include "variable_ids" array with 1-3 values from ["A", "B", "C"]
- Hypothesis "name" must be natural professional English (e.g., "Window area and overhang interaction"), NOT raw identifiers with underscores
- When describing window area reduction, say "75% of baseline area" or "12.42 m² (75% of baseline 16.56 m²)", NOT "75% retention" or "75% glazing"
- Other concepts (SHGC, U-value, daylight, HVAC, internal gains, ventilation, cost, carbon) may appear ONLY in: candidate_drivers (as DOMAIN_KNOWLEDGE/INFERENCE), hidden_assumptions (as ASSUMPTION), or missing_evidence (as text)
- Do NOT mention unadjustable variables in FOCUS_NOW hypotheses

Return valid JSON (no markdown):
{
  "decision_framing": {
    "current_decision": {"claim": "string", "source_type": "SOURCE", "source": "client-brief.md", "canonical_decision_id": "envelope-parametric-selection"},
    "relevant_goals": [
      {"claim": "string", "source_type": "SOURCE", "source": "client-brief.md: requirements", "canonical_source_goal_id": "cooling-retention"},
      {"claim": "string", "source_type": "SOURCE", "source": "client-brief.md: requirements", "canonical_source_goal_id": "annual-energy"}
    ]
  },
  "candidate_drivers": [
    {"claim": "string", "source_type": "SOURCE", "source": "optional", "canonical_source_fact_id": "WF-1-geometry"},
    {"claim": "string", "source_type": "INFERENCE"}
  ],
  "hidden_assumptions": [{"claim": "string", "source_type": "ASSUMPTION|INFERENCE|NEEDS_REVIEW"}],
  "missing_evidence": ["string"],
  "prioritized_hypotheses": [{
    "name": "string",
    "variable_ids": ["A"|"B"|"C"],
    "what_it_is": "string",
    "why_now": "string (conceptual only, no invented outcome numbers)",
    "affects_requirements": "string",
    "why_test_together": "string",
    "potential_upside": "string (conceptual direction only, no invented numbers)",
    "potential_downside": "string (conceptual only, no invented numbers)",
    "unknown": "string",
    "what_would_change_priority": "string",
    "priority_bucket": "FOCUS_NOW|WATCH_DEFER|NO_NEW_ANALYSIS",
    "priority_factors": {}
  }]
}`;

    console.log('[Framing API] Calling Anthropic API...');
    const apiStartTime = Date.now();
    const message = await anthropic.messages.create({
      model,
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    const apiDuration = ((Date.now() - apiStartTime) / 1000).toFixed(2);

    console.log('[Framing API] Response received, stop_reason:', message.stop_reason);
    console.log('[Framing API] API call duration:', apiDuration + 's');
    console.log('[Framing API] Content blocks:', message.content.length);

    const textContent = message.content.find((c: any) => c.type === 'text') as any;
    if (!textContent || !textContent.text) {
      console.error('[Framing API] No text content in response. Content blocks:', message.content.map((c: any) => c.type).join(', '));
      throw new Error(`No text content in response (got ${message.content.map((c: any) => c.type).join(', ')})`);
    }

    console.log('[Framing API] Text content length:', textContent.text.length);
    console.log('[Framing API] Text preview:', textContent.text.substring(0, 200));

    let jsonText = textContent.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      console.log('[Framing API] Removing markdown code blocks');
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    console.log('[Framing API] Parsing JSON...');
    const result = JSON.parse(jsonText);

    // Validate response with fail-closed validation
    console.log('[Framing API] Validating response...');
    const validation = validateLiveFramingResponse(result);

    if (!validation.valid) {
      console.warn('[Framing API] Validation failed:', validation.errors);

      // Attempt retry once with validation feedback
      console.log('[Framing API] Retrying with validation feedback...');
      const retryStartTime = Date.now();

      const errorFeedback = validation.errors.map(e => `- ${e.field}: ${e.message}`).join('\n');
      const retryPrompt = `${prompt}

VALIDATION ERRORS FROM PREVIOUS ATTEMPT:
${errorFeedback}

Please fix these errors and return valid JSON.`;

      try {
        const retryMessage = await anthropic.messages.create({
          model,
          max_tokens: 8192,
          messages: [{
            role: 'user',
            content: retryPrompt
          }]
        });

        const retryTextContent = retryMessage.content.find((c: any) => c.type === 'text') as any;
        if (!retryTextContent?.text) {
          throw new Error('No text content in retry response');
        }

        let retryJsonText = retryTextContent.text.trim();
        if (retryJsonText.startsWith('```')) {
          retryJsonText = retryJsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }

        const retryResult = JSON.parse(retryJsonText);
        const retryValidation = validateLiveFramingResponse(retryResult);

        if (retryValidation.valid) {
          const retryDuration = ((Date.now() - retryStartTime) / 1000).toFixed(2);
          const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log('[Framing API] Retry successful after', retryDuration + 's');
          console.log('[Framing API] Total duration:', totalDuration + 's');

          // Return server-sanitized version (canonical text substituted, not model-written)
          return NextResponse.json({
            success: true,
            data: retryValidation.sanitized,
            mode: 'live',
            duration_seconds: totalDuration,
            retried: true
          });
        } else {
          console.warn('[Framing API] Retry validation also failed:', retryValidation.errors);
          throw new Error('Validation failed after retry');
        }
      } catch (retryError: any) {
        console.error('[Framing API] Retry failed:', retryError.message);
        // Fall through to fallback
      }

      // Return fallback with graceful message
      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log('[Framing API] Returning fallback after validation failure. Total duration:', totalDuration + 's');

      return NextResponse.json({
        success: false,
        data: stagedFraming,
        mode: 'staged',
        duration_seconds: totalDuration,
        fallback_reason: validation.errors.slice(0, 2).map(e => e.message).join('; ')
      });
    }

    if (validation.warnings.length > 0) {
      console.warn('[Framing API] Validation warnings:', validation.warnings);
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('[Framing API] Validation passed! Total duration:', totalDuration + 's');

    // Return server-sanitized version (canonical text substituted, never trust model-written SOURCE text)
    return NextResponse.json({ success: true, data: validation.sanitized, mode: 'live', duration_seconds: totalDuration });
  } catch (error: any) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error('[Framing API] Error after', totalDuration + 's:', error.message);
    if (error.stack) {
      console.error('[Framing API] Stack:', error.stack);
    }

    // Return staged fallback instead of 500 error
    return NextResponse.json({
      success: false,
      data: stagedFraming,
      mode: 'staged',
      duration_seconds: totalDuration,
      error: error.message
    });
  }
}
