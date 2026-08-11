import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN,
  baseURL: process.env.ANTHROPIC_BASE_URL,
});

const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

export async function POST(request: Request) {
  try {
    const { evidence, requirements } = await request.json();

    const prompt = `You are an AI decision consultant for building performance professionals. You have REAL EnergyPlus simulation evidence and must interpret it transparently.

EVIDENCE (from validated evidence.json):
${JSON.stringify(evidence, null, 2)}

CONFIRMED PROJECT REQUIREMENTS:
${JSON.stringify(requirements, null, 2)}

CRITICAL RULES:
- ALL numerical values, units, factorial effects, and case results shown to users MUST come directly from evidence.json
- You may EXPLAIN evidence but CANNOT alter, recalculate, or invent it
- Do NOT generalize this sample into universal building-performance rules
- Final project judgment remains with the professional

Return ONLY valid JSON (no markdown, no explanation text) with this structure:
{
  "main_effects": [{"factor": "string", "metric": "string", "value": "number from evidence", "interpretation": "string"}],
  "interactions": [{"factors": "string", "metric": "string", "value": "number from evidence", "interpretation": "string"}],
  "supported_hypotheses": ["string"],
  "challenged_hypotheses": ["string"],
  "new_priorities": ["string"],
  "still_unknown": ["string"],
  "recommendation": {
    "leading_direction": "string",
    "why_it_leads": "string",
    "performs_well": ["string"],
    "sacrifices": ["string"],
    "why_others_not_first": "string",
    "remaining_risks": ["string"],
    "other_promising": "string",
    "what_to_test_next": ["string"],
    "what_would_change": ["string"]
  },
  "draft_practice_learning": ["string"]
}`;

    const message = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const textContent = message.content.find((c: any) => c.type === 'text') as any;
    if (!textContent || !textContent.text) {
      throw new Error('No text content in response');
    }

    let jsonText = textContent.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const result = JSON.parse(jsonText);

    return NextResponse.json({ success: true, data: result, mode: 'live' });
  } catch (error: any) {
    console.error('AI Interpretation error:', error);
    return NextResponse.json(
      { success: false, error: error.message, mode: 'staged' },
      { status: 500 }
    );
  }
}
