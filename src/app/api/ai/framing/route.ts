import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// Approved adjustable variables from evidence.json
const APPROVED_VARIABLES = ['A', 'B', 'C', 'WF-1 Window Area', 'Main South Overhang Depth', 'IN02 Insulation Thickness', 'south window area', 'window area', 'overhang depth', 'insulation thickness', 'exterior wall insulation'];

const FRAMING_SCHEMA = {
  type: 'object',
  required: ['requirements', 'decision_framing', 'candidate_drivers', 'hidden_assumptions', 'missing_evidence', 'prioritized_hypotheses', 'test_set_rationale'],
  properties: {
    requirements: {
      type: 'object',
      required: ['hard_constraints', 'targets', 'preferences', 'open_questions'],
      properties: {
        hard_constraints: { type: 'array', items: { type: 'object', required: ['claim', 'source_type'], properties: { claim: { type: 'string' }, source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] }, source: { type: 'string' } } } },
        targets: { type: 'array', items: { type: 'object', required: ['claim', 'source_type'], properties: { claim: { type: 'string' }, source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] }, source: { type: 'string' } } } },
        preferences: { type: 'array', items: { type: 'object', required: ['claim', 'source_type'], properties: { claim: { type: 'string' }, source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] }, source: { type: 'string' } } } },
        open_questions: { type: 'array', items: { type: 'string' } }
      }
    },
    decision_framing: {
      type: 'object',
      required: ['current_decision', 'relevant_goals'],
      properties: {
        current_decision: { type: 'object', required: ['claim', 'source_type'], properties: { claim: { type: 'string' }, source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] }, source: { type: 'string' } } },
        relevant_goals: { type: 'array', items: { type: 'object', required: ['claim', 'source_type'], properties: { claim: { type: 'string' }, source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] }, source: { type: 'string' } } } }
      }
    },
    candidate_drivers: { type: 'array', items: { type: 'object', required: ['claim', 'source_type'], properties: { claim: { type: 'string' }, source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] }, source: { type: 'string' } } } },
    hidden_assumptions: { type: 'array', items: { type: 'object', required: ['claim', 'source_type'], properties: { claim: { type: 'string' }, source_type: { type: 'string', enum: ['SOURCE', 'INFERENCE', 'ASSUMPTION', 'DOMAIN_KNOWLEDGE', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW'] }, source: { type: 'string' } } } },
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
    },
    test_set_rationale: { type: 'string' }
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
- You may state SOURCE facts (e.g., "baseline window area is 16.56 m²") but not invented predictions
- Describe potential directions conceptually; do not quantify outcomes

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
  "requirements": {
    "hard_constraints": [{"claim": "string", "source_type": "SOURCE|INFERENCE|ASSUMPTION|DOMAIN_KNOWLEDGE|NEEDS_EVIDENCE|NEEDS_REVIEW", "source": "optional"}],
    "targets": [{"claim": "string", "source_type": "SOURCE|INFERENCE|ASSUMPTION|DOMAIN_KNOWLEDGE|NEEDS_EVIDENCE|NEEDS_REVIEW", "source": "optional"}],
    "preferences": [{"claim": "string", "source_type": "SOURCE|INFERENCE|ASSUMPTION|DOMAIN_KNOWLEDGE|NEEDS_EVIDENCE|NEEDS_REVIEW", "source": "optional"}],
    "open_questions": ["string"]
  },
  "decision_framing": {
    "current_decision": {"claim": "string", "source_type": "SOURCE|INFERENCE|ASSUMPTION|DOMAIN_KNOWLEDGE|NEEDS_EVIDENCE|NEEDS_REVIEW", "source": "optional"},
    "relevant_goals": [{"claim": "string", "source_type": "SOURCE|INFERENCE|ASSUMPTION|DOMAIN_KNOWLEDGE|NEEDS_EVIDENCE|NEEDS_REVIEW", "source": "optional"}]
  },
  "candidate_drivers": [{"claim": "string", "source_type": "SOURCE|INFERENCE|ASSUMPTION|DOMAIN_KNOWLEDGE|NEEDS_EVIDENCE|NEEDS_REVIEW", "source": "optional"}],
  "hidden_assumptions": [{"claim": "string", "source_type": "ASSUMPTION|INFERENCE|NEEDS_REVIEW"}],
  "missing_evidence": ["string"],
  "prioritized_hypotheses": [{
    "name": "string",
    "variable_ids": ["A"|"B"|"C"],
    "what_it_is": "string",
    "why_now": "string",
    "affects_requirements": "string",
    "why_test_together": "string",
    "potential_upside": "string (conceptual only, no invented numbers)",
    "potential_downside": "string (conceptual only, no invented numbers)",
    "unknown": "string",
    "what_would_change_priority": "string",
    "priority_bucket": "FOCUS_NOW|WATCH_DEFER|NO_NEW_ANALYSIS",
    "priority_factors": {}
  }],
  "test_set_rationale": "string"
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

    // Validate FOCUS_NOW hypotheses contain variable_ids with only A/B/C
    const focusNowHypotheses = result.prioritized_hypotheses?.filter((h: any) => h.priority_bucket === 'FOCUS_NOW') || [];

    // Check max 3 FOCUS_NOW
    if (focusNowHypotheses.length > 3) {
      console.warn('[Framing API] Too many FOCUS_NOW hypotheses:', focusNowHypotheses.length);
      throw new Error(`Too many FOCUS_NOW hypotheses: ${focusNowHypotheses.length} (max 3). Move some to WATCH_DEFER.`);
    }

    for (const hyp of focusNowHypotheses) {
      // Check variable_ids field exists and is valid
      if (!hyp.variable_ids || !Array.isArray(hyp.variable_ids)) {
        console.warn('[Framing API] FOCUS_NOW hypothesis missing variable_ids:', hyp.name);
        throw new Error('FOCUS_NOW hypothesis missing structured variable_ids array');
      }
      if (hyp.variable_ids.length === 0 || hyp.variable_ids.length > 3) {
        console.warn('[Framing API] FOCUS_NOW hypothesis has invalid variable_ids count:', hyp.name, hyp.variable_ids);
        throw new Error('FOCUS_NOW hypothesis must have 1-3 variable_ids');
      }
      for (const vid of hyp.variable_ids) {
        if (!['A', 'B', 'C'].includes(vid)) {
          console.warn('[Framing API] FOCUS_NOW hypothesis has invalid variable_id:', hyp.name, vid);
          throw new Error(`FOCUS_NOW hypothesis contains invalid variable_id: ${vid}. Only A/B/C allowed.`);
        }
      }

      // Check name is natural English, not raw underscore identifier
      if (hyp.name.includes('_')) {
        console.warn('[Framing API] FOCUS_NOW hypothesis name has underscores:', hyp.name);
        throw new Error('FOCUS_NOW hypothesis name must be natural professional English, not raw identifiers with underscores');
      }

      // Check text content doesn't introduce unsupported variables
      const text = `${hyp.name} ${hyp.what_it_is} ${hyp.why_now}`.toLowerCase();
      const hasSHGC = text.includes('shgc') || text.includes('solar heat gain coefficient');
      const hasGlazingU = text.includes('glazing u-value') || text.includes('window u-value') || text.includes('u-factor');
      const hasVentilation = text.includes('ventilation rate') || text.includes('air change');
      const hasHVAC = text.includes('hvac') && !text.includes('no hvac') && !text.includes('without hvac');

      if (hasSHGC || hasGlazingU || hasVentilation || hasHVAC) {
        console.warn('[Framing API] FOCUS_NOW hypothesis text introduces unsupported variable:', hyp.name);
        throw new Error('FOCUS_NOW hypothesis discusses unadjustable variables. Only A/B/C concepts allowed in FOCUS_NOW.');
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('[Framing API] Success! Total duration:', totalDuration + 's');

    return NextResponse.json({ success: true, data: result, mode: 'live', duration_seconds: totalDuration });
  } catch (error: any) {
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error('[Framing API] Error after', totalDuration + 's:', error.message);
    if (error.stack) {
      console.error('[Framing API] Stack:', error.stack);
    }
    return NextResponse.json(
      { success: false, error: error.message, mode: 'staged', duration_seconds: totalDuration },
      { status: 500 }
    );
  }
}
