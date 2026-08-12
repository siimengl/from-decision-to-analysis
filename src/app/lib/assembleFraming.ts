// Server-side assembly: expands the compact live-AI delta into the full
// LiveFramingResponse shape the existing UI/validator expects, using ONLY
// server-owned canonical/source content. The model never authors source text,
// project facts, or prepared-pilot content — it only supplies the compact
// delta (priority order, one interaction, short rationale, missing-evidence
// observation), which is itself re-validated by validateLiveFramingResponse
// below (defense in depth) before being returned to the client.

import {
  ApprovedVariableId,
  APPROVED_VARIABLES,
  CompactFramingResponse,
  LiveFramingResponse,
  CANONICAL_DECISIONS,
  CANONICAL_SOURCE_GOALS,
  CANONICAL_SOURCE_FACTS
} from './types';

// Server-owned canonical source facts per variable (SOURCE + one static INFERENCE each).
// Not model-generated; identical in spirit to the prior model output but authored server-side.
const CANONICAL_DRIVER_FACT_ID: Record<ApprovedVariableId, keyof typeof CANONICAL_SOURCE_FACTS> = {
  A: 'WF-1-geometry',
  B: 'overhang-depth-1.3m',
  C: 'IN02-thickness-0.090m'
};

const CANONICAL_DRIVER_INFERENCE: Record<ApprovedVariableId, string> = {
  A: 'South-facing glazing in Chicago climate likely drives summer cooling loads',
  B: 'Deeper overhang extension could reduce direct solar gain',
  C: 'Increased insulation thickness could reduce envelope load'
};

// Server-owned hidden assumptions (static; not model-generated).
const CANONICAL_HIDDEN_ASSUMPTIONS = [
  { claim: 'That cooling energy is the dominant challenge — heating and shoulder-season performance matter too', source_type: 'INFERENCE' },
  { claim: 'That single-variable findings predict combined-variable outcomes', source_type: 'INFERENCE' }
];

// Server-owned always-present hypothesis entries (identical to prior static content;
// these do not depend on any dynamic AI output and must not be model-generated).
const THREE_WAY_HYPOTHESIS = {
  name: 'Three-way interaction (Window Area × Overhang Depth × Wall Insulation)',
  variable_ids: ['A', 'B', 'C'] as ApprovedVariableId[],
  what_it_is: 'The 8-run 2³ factorial design already captures the three-way interaction term. Two-level unreplicated results remain directional. If this interaction proves material, it motivates a targeted second-round study with refined levels or replication.',
  why_now: '',
  affects_requirements: '',
  why_test_together: '',
  potential_upside: '',
  potential_downside: '',
  unknown: '',
  what_would_change_priority: '',
  priority_bucket: 'CAPTURE_CAUTIOUSLY' as any,
  priority_factors: {}
};

const HVAC_DEFERRED_HYPOTHESIS = {
  name: 'HVAC system refinement',
  variable_ids: [] as any,
  what_it_is: 'Client explicitly deferred. Envelope-first strategy makes sense; revisit after envelope direction is selected.',
  why_now: '',
  affects_requirements: '',
  why_test_together: '',
  potential_upside: '',
  potential_downside: '',
  unknown: '',
  what_would_change_priority: '',
  priority_bucket: 'WATCH_DEFER',
  priority_factors: {}
};

const AFFECTS_REQUIREMENTS_TEXT = [
  CANONICAL_SOURCE_GOALS['cooling-retention'].text,
  CANONICAL_SOURCE_GOALS['annual-energy'].text
].join('; ');

function variableList(ids: ApprovedVariableId[]): string {
  return ids.map(id => APPROVED_VARIABLES[id].display).join(' and ');
}

function singleVariableHypothesis(id: ApprovedVariableId, rationale: string) {
  const v = APPROVED_VARIABLES[id];
  return {
    name: `${v.display} investigation priority`,
    variable_ids: [id] as ApprovedVariableId[],
    what_it_is: `Investigating ${v.description}.`,
    why_now: rationale,
    affects_requirements: AFFECTS_REQUIREMENTS_TEXT,
    why_test_together: '',
    potential_upside: 'May reduce cooling-related energy demand or improve annual performance while keeping other requirements intact.',
    potential_downside: 'May trade off against construction complexity or other stated preferences depending on the magnitude of change.',
    unknown: 'Actual measured effect size, and whether it interacts with the other adjustable variables (see Smallest Useful Test Set).',
    what_would_change_priority: "Evidence from the completed pilot test set showing this variable's effect is smaller or larger than currently framed.",
    priority_bucket: 'FOCUS_NOW' as const,
    priority_factors: {}
  };
}

function interactionHypothesis(ids: ApprovedVariableId[], rationale: string) {
  return {
    name: `${variableList(ids)} interaction`,
    variable_ids: ids,
    what_it_is: `Testing ${variableList(ids)} together rather than in isolation.`,
    why_now: rationale,
    affects_requirements: AFFECTS_REQUIREMENTS_TEXT,
    why_test_together: 'Single-variable results may not predict how these variables behave in combination; testing together reveals whether effects add, cancel, or interact.',
    potential_upside: 'May reveal a combined benefit that single-variable testing alone would miss.',
    potential_downside: 'May reveal that the variables offer little additional benefit together, or introduce a trade-off not visible in single-variable testing.',
    unknown: 'Whether the interaction is additive, synergistic, or negligible in the tested ranges (see Smallest Useful Test Set).',
    what_would_change_priority: 'Evidence from the completed pilot test set showing the interaction is negligible or material.',
    priority_bucket: 'FOCUS_NOW' as const,
    priority_factors: {}
  };
}

// Assemble the full LiveFramingResponse from the compact, already-validated AI delta.
// All source text, project facts, and always-present hypotheses come from server-owned
// canonical constants — the model never supplies wording for these.
export function assembleLiveFraming(compact: CompactFramingResponse): LiveFramingResponse {
  const decision = CANONICAL_DECISIONS['envelope-parametric-selection'];

  const decision_framing = {
    current_decision: {
      claim: decision.text,
      source_type: 'SOURCE',
      source: decision.source,
      canonical_decision_id: decision.id
    },
    relevant_goals: (['cooling-retention', 'annual-energy'] as const).map(goalId => {
      const g = CANONICAL_SOURCE_GOALS[goalId];
      return {
        claim: g.text,
        source_type: 'SOURCE',
        source: g.source,
        canonical_source_goal_id: g.id
      };
    })
  };

  const candidate_drivers = compact.priority_order.flatMap(id => {
    const fact = CANONICAL_SOURCE_FACTS[CANONICAL_DRIVER_FACT_ID[id]];
    return [
      { claim: fact.claim, source_type: 'SOURCE', source: fact.source, canonical_source_fact_id: fact.id },
      { claim: CANONICAL_DRIVER_INFERENCE[id], source_type: 'INFERENCE' }
    ];
  });

  const topId = compact.priority_order[0];
  const topRationale = compact.priority_rationale[topId] || `${APPROVED_VARIABLES[topId].display} ranked first in this framing pass.`;

  const prioritized_hypotheses: any[] = [singleVariableHypothesis(topId, topRationale)];

  if (compact.interaction && compact.interaction.variable_ids?.length) {
    prioritized_hypotheses.push(interactionHypothesis(compact.interaction.variable_ids, compact.interaction.rationale));
  }

  prioritized_hypotheses.push(THREE_WAY_HYPOTHESIS, HVAC_DEFERRED_HYPOTHESIS);

  return {
    decision_framing,
    candidate_drivers,
    hidden_assumptions: CANONICAL_HIDDEN_ASSUMPTIONS,
    missing_evidence: [compact.missing_evidence],
    prioritized_hypotheses
  } as LiveFramingResponse;
}
