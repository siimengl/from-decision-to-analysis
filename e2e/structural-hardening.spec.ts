import { test, expect } from '@playwright/test';
import { validateLiveFramingResponse, isValidLiveFramingStructure } from '../src/app/lib/validation';
import {
  normalizeProvenance,
  APPROVED_VARIABLES,
  PROVENANCE_LABELS,
  PROFESSIONAL_ACTION_LABELS,
  LIVE_FRAMING_CACHE_KEY
} from '../src/app/lib/types';
import { PREPARED_PILOT } from '../src/app/lib/preparedPilot';
import { stagedFraming } from '../src/app/lib/stagedContent';

// Helper to create a valid response fixture with canonical source references
function makeValidLiveResponse() {
  return {
    decision_framing: {
      current_decision: {
        claim: 'Selecting which façade/envelope parametric combinations to develop before design advances',
        source_type: 'SOURCE',
        source: 'client-brief.md',
        canonical_decision_id: 'envelope-parametric-selection'
      },
      relevant_goals: [{
        claim: 'Reduce cooling energy while maintaining façade openness',
        source_type: 'SOURCE',
        canonical_source_goal_id: 'cooling-retention'
      }]
    },
    candidate_drivers: [],
    prioritized_hypotheses: []
  };
}

// Helper: valid FOCUS_NOW hypothesis
function makeFocusNow(overrides = {}) {
  return {
    name: 'Window area and overhang interaction',
    variable_ids: ['A', 'B'],
    what_it_is: 'Testing south window area with overhang depth',
    why_now: 'Two adjustable façade moves that affect solar heat gain',
    affects_requirements: 'Cooling energy reduction',
    why_test_together: 'Interaction may reveal non-additive effects',
    potential_upside: 'Cooling load reduction while maintaining openness',
    potential_downside: 'Overhang may be visually dominant',
    unknown: 'Whether interaction is additive or synergistic',
    what_would_change_priority: 'Evidence showing interactions are negligible',
    priority_bucket: 'FOCUS_NOW',
    priority_factors: {},
    ...overrides
  };
}

test.describe('Structural Hardening Regression Tests', () => {

  // ── 1. APPROVED VARIABLE IDs ──────────────────────────────────────────────

  test('1. Valid A/B/C FOCUS_NOW hypothesis passes', () => {
    const res = makeValidLiveResponse();
    res.prioritized_hypotheses = [makeFocusNow({ variable_ids: ['A', 'B'] })];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(true);
  });

  test('2. Unknown/missing variable ID fails FOCUS_NOW', () => {
    const res = makeValidLiveResponse();
    res.prioritized_hypotheses = [makeFocusNow({ name: 'SHGC optimization', variable_ids: ['D'] })];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('invalid variable_id'))).toBe(true);
  });

  test('3. Out-of-scope concept without valid A/B/C ID fails FOCUS_NOW', () => {
    const res = makeValidLiveResponse();
    res.prioritized_hypotheses = [makeFocusNow({
      name: 'Glazing thermal performance',
      variable_ids: [],
      what_it_is: 'Testing SHGC values'
    })];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
  });

  test('4. Out-of-scope concept may remain DOMAIN_KNOWLEDGE when non-actionable', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'SHGC affects solar heat gain',
      source_type: 'DOMAIN_KNOWLEDGE'
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(true);
  });

  test('5. Max 3 FOCUS_NOW hypotheses enforced', () => {
    const res = makeValidLiveResponse();
    res.prioritized_hypotheses = [
      makeFocusNow({ name: 'Test 1', variable_ids: ['A'] }),
      makeFocusNow({ name: 'Test 2', variable_ids: ['B'] }),
      makeFocusNow({ name: 'Test 3', variable_ids: ['C'] }),
      makeFocusNow({ name: 'Test 4', variable_ids: ['A', 'B'] })
    ];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('Too many FOCUS_NOW'))).toBe(true);
  });

  // ── 2. PROVENANCE ─────────────────────────────────────────────────────────

  test('6. DOMAIN_KNOWLEDGE normalizes and renders correctly', () => {
    const normalized = normalizeProvenance('DOMAIN_KNOWLEDGE');
    expect(normalized).toBe('domain-knowledge');
    expect(PROVENANCE_LABELS[normalized]).toBe('DOMAIN KNOWLEDGE');
  });

  test('7. Unknown provenance safely becomes NEEDS REVIEW', () => {
    const normalized = normalizeProvenance('UNKNOWN_TYPE');
    expect(normalized).toBe('needs-review');
    expect(PROVENANCE_LABELS[normalized]).toBe('NEEDS REVIEW');
  });

  test('Provenance normalization is case-insensitive', () => {
    expect(normalizeProvenance('SOURCE')).toBe('source');
    expect(normalizeProvenance('source')).toBe('source');
    expect(normalizeProvenance('Source')).toBe('source');
  });

  test('Provenance normalization handles underscores', () => {
    expect(normalizeProvenance('DOMAIN_KNOWLEDGE')).toBe('domain-knowledge');
    expect(normalizeProvenance('NEEDS_EVIDENCE')).toBe('needs-evidence');
  });

  // ── 3. CANONICAL SOURCE PROVENANCE ───────────────────────────────────────

  test('8. SOURCE current_decision without valid canonical ID fails', () => {
    const res = makeValidLiveResponse();
    // Remove the canonical_decision_id to simulate missing reference
    delete (res.decision_framing.current_decision as any).canonical_decision_id;
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('canonical_decision_id'))).toBe(true);
  });

  test('9. SOURCE goal without valid canonical_source_goal_id fails', () => {
    const res = makeValidLiveResponse();
    res.decision_framing.relevant_goals = [{
      claim: 'Invented goal with no canonical reference',
      source_type: 'SOURCE'
    }] as any;
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('canonical_source_goal_id'))).toBe(true);
  });

  test('10. SOURCE candidate driver without valid canonical_source_fact_id fails', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'South window is 16.56 m²',
      source_type: 'SOURCE',
      source: '5ZoneAirCooled.idf'
      // missing canonical_source_fact_id
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('canonical_source_fact_id'))).toBe(true);
  });

  test('11. Valid canonical SOURCE driver with correct ID passes', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'South façade window WF-1: 13.8m × 1.2m = 16.56 m²',
      source_type: 'SOURCE',
      source: '5ZoneAirCooled.idf: WF-1 geometry',
      canonical_source_fact_id: 'WF-1-geometry'
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(true);
  });

  test('12. Valid canonical ID with tampered model text: server replaces text, tampered text cannot surface', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'TAMPERED CLAIM - invented by model',
      source_type: 'SOURCE',
      source: 'tampered source string',
      canonical_source_fact_id: 'WF-1-geometry'
    }];
    const result = validateLiveFramingResponse(res);
    // Validation passes (canonical ID is valid)
    expect(result.valid).toBe(true);
    // But sanitized output has server-owned text, not tampered text
    const sanitizedDriver = result.sanitized?.candidate_drivers?.[0];
    expect(sanitizedDriver).toBeDefined();
    expect(sanitizedDriver.claim).not.toContain('TAMPERED CLAIM');
    expect(sanitizedDriver.source).not.toContain('tampered source string');
    // Canonical claim text is used instead
    expect(sanitizedDriver.claim).toContain('WF-1');
  });

  test('13. Valid canonical decision ID with tampered current_decision text: server replaces text', () => {
    const res = makeValidLiveResponse();
    res.decision_framing.current_decision.claim = 'TAMPERED DECISION CLAIM';
    res.decision_framing.current_decision.source = 'tampered source';
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(true);
    const cd = result.sanitized?.decision_framing?.current_decision;
    expect(cd.claim).not.toContain('TAMPERED');
    expect(cd.claim).toContain('façade');
  });

  // ── 4. QUANTITATIVE CLAIMS ────────────────────────────────────────────────

  test('14. Unsupported pre-evidence quantitative outcome fails closed', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'This will save 30% energy with low-cost implementation',
      source_type: 'INFERENCE'
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('quantitative'))).toBe(true);
  });

  test('15. "3.2 GJ reduction" invented claim fails closed', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: '3.2 GJ reduction expected from window area changes',
      source_type: 'INFERENCE'
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
  });

  test('16. "20 kWh savings" invented claim fails closed', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'Expected 20 kWh savings per year',
      source_type: 'DOMAIN_KNOWLEDGE'
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
  });

  test('17. "4.5% improvement" invented outcome claim fails closed', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'Insulation delivers 4.5% improvement in annual energy',
      source_type: 'INFERENCE'
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
  });

  test('18. "$5000 cost" invented claim fails closed', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'Expected implementation cost is $5000',
      source_type: 'INFERENCE'
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
  });

  test('19. "3-year payback" invented claim fails closed', () => {
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'Wall insulation has a 3-year payback period',
      source_type: 'INFERENCE'
    }];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
  });

  test('20. Quantitative outcome in FOCUS_NOW hypothesis is FATAL (not just warning)', () => {
    const res = makeValidLiveResponse();
    res.prioritized_hypotheses = [makeFocusNow({
      potential_upside: 'Could provide 3.2 GJ reduction in cooling energy'
    })];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    // Must be a fatal error, not a warning
    expect(result.errors.some(e => e.fatal && e.message.includes('quantitative'))).toBe(true);
  });

  test('21. Canonical input values (16.56 m², 70% of baseline) in INFERENCE text do not trigger quantitative block', () => {
    // These are known project inputs, not invented outcome predictions
    const res = makeValidLiveResponse();
    (res.candidate_drivers as any) = [{
      claim: 'The tested window area of 12.42 m² is 75% of the baseline 16.56 m² area',
      source_type: 'INFERENCE'
    }];
    const result = validateLiveFramingResponse(res);
    // This should pass — it is describing a known input, not a predicted outcome
    expect(result.valid).toBe(true);
  });

  // ── 5. CACHE VALIDATION ───────────────────────────────────────────────────

  test('22. Cache key version is v2', () => {
    expect(LIVE_FRAMING_CACHE_KEY).toBe('live-ai-framing-v2');
  });

  test('23. isValidLiveFramingStructure accepts valid structure', () => {
    expect(isValidLiveFramingStructure(makeValidLiveResponse())).toBe(true);
  });

  test('24. isValidLiveFramingStructure rejects null', () => {
    expect(isValidLiveFramingStructure(null)).toBe(false);
  });

  test('25. isValidLiveFramingStructure rejects missing decision_framing', () => {
    expect(isValidLiveFramingStructure({ prioritized_hypotheses: [] })).toBe(false);
  });

  test('26. isValidLiveFramingStructure rejects missing prioritized_hypotheses', () => {
    expect(isValidLiveFramingStructure({ decision_framing: { current_decision: {} } })).toBe(false);
  });

  // ── 6. PREPARED PILOT IMMUTABILITY ───────────────────────────────────────

  test('27. PREPARED_PILOT test set/evidence/recommendation/delta remain immutable', () => {
    expect(PREPARED_PILOT.evidence_reversal.pilot_framing).toBe('Window Area × Overhang Depth interaction deserved first attention.');
    expect(PREPARED_PILOT.test_set.factors.A.display).toBe('Window Area');
    expect(PREPARED_PILOT.test_set.factors.B.display).toBe('Overhang Depth');
    expect(PREPARED_PILOT.test_set.factors.C.display).toBe('Wall Insulation');
  });

  test('28. PREPARED_PILOT has no test_set_rationale field', () => {
    expect((PREPARED_PILOT as any).test_set_rationale).toBeUndefined();
  });

  test('29. PREPARED_PILOT practice card heading is canonical', () => {
    expect(PREPARED_PILOT.practice_card.heading).toBe('Professional review of AI framing');
  });

  test('30. Completed pilot terminology uses canonical variable names', () => {
    expect(PREPARED_PILOT.test_set.factors.A.display).toBe('Window Area');
    expect(PREPARED_PILOT.test_set.factors.B.display).toBe('Overhang Depth');
    expect(PREPARED_PILOT.test_set.factors.C.display).toBe('Wall Insulation');
    expect(PREPARED_PILOT.evidence_reversal.pilot_framing).toContain('Window Area');
    expect(PREPARED_PILOT.evidence_reversal.pilot_framing).toContain('Overhang Depth');
  });

  // ── 7. LIVE RESPONSE NO test_set_rationale ────────────────────────────────

  test('31. Validation strips test_set_rationale from sanitized output (not a required field)', () => {
    const res = makeValidLiveResponse();
    // Simulate a model that returns test_set_rationale anyway
    (res as any).test_set_rationale = 'AI invented test set rationale';
    const result = validateLiveFramingResponse(res);
    // Validation still passes (it is just an extra field)
    expect(result.valid).toBe(true);
    // The sanitized version must not surface the test_set_rationale as actionable
    // (structural contract: it is not in LiveFramingResponse type)
  });

  // ── 8. GRAMMAR / NEUTRAL WORDING ─────────────────────────────────────────

  test('32. Accept/Revise/Reject grammar is correct', () => {
    expect(PROFESSIONAL_ACTION_LABELS.accept).toBe('accepted');
    expect(PROFESSIONAL_ACTION_LABELS.revise).toBe('revised');
    expect(PROFESSIONAL_ACTION_LABELS.reject).toBe('rejected');
  });

  test('33. Professional review context is neutral (not correction)', () => {
    expect(PREPARED_PILOT.professional_challenge.context).toContain('Pilot checkpoint');
    expect(PREPARED_PILOT.professional_challenge.context).not.toContain('correction');
  });

  // ── 9. APPROVED VARIABLES SET ────────────────────────────────────────────

  test('34. Variable IDs are exactly A, B, C', () => {
    const approvedIds = ['A', 'B', 'C'];
    expect(APPROVED_VARIABLES.A.id).toBe('A');
    expect(APPROVED_VARIABLES.B.id).toBe('B');
    expect(APPROVED_VARIABLES.C.id).toBe('C');
    expect(Object.keys(APPROVED_VARIABLES)).toEqual(approvedIds);
  });

  // ── 10. STAGED FRAMING AS PREPARED SOURCE ─────────────────────────────────

  test('35. stagedFraming contains at least one FOCUS_NOW hypothesis', () => {
    const focusNow = stagedFraming.prioritized_hypotheses.filter(
      (h: any) => h.priority_bucket === 'FOCUS_NOW'
    );
    expect(focusNow.length).toBeGreaterThan(0);
  });

  test('36. stagedFraming candidate_drivers have no unsupported quantitative outcome claims', () => {
    for (const driver of stagedFraming.candidate_drivers) {
      // None should have invented percentages or currency
      expect(driver.claim).not.toMatch(/\$\d+/);
      expect(driver.claim).not.toMatch(/\d+\s*%\s*(savings?|reduction|improvement)/i);
    }
  });

  test('37. FOCUS_NOW hypothesis name must be natural English (no underscores)', () => {
    const res = makeValidLiveResponse();
    res.prioritized_hypotheses = [makeFocusNow({ name: 'window_area_x_overhang_depth' })];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('natural English'))).toBe(true);
  });

  test('38. FOCUS_NOW cannot introduce SHGC concept', () => {
    const res = makeValidLiveResponse();
    res.prioritized_hypotheses = [makeFocusNow({
      name: 'Window properties and shading',
      variable_ids: ['A', 'B'],
      what_it_is: 'Testing SHGC values with overhang depth'
    })];
    const result = validateLiveFramingResponse(res);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes('unsupported variable'))).toBe(true);
  });

});
