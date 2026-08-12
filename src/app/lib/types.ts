// Canonical project contract: typed source of truth for approved variables

export type ApprovedVariableId = 'A' | 'B' | 'C';

export const APPROVED_VARIABLES: Record<ApprovedVariableId, {
  id: ApprovedVariableId;
  display: string;
  description: string;
}> = {
  A: {
    id: 'A',
    display: 'Window Area',
    description: 'South window area (baseline 16.56 m² vs reduced 12.42 m² = 75% of baseline)'
  },
  B: {
    id: 'B',
    display: 'Overhang Depth',
    description: 'Main south overhang depth (baseline 1.3m vs extended 2.0m)'
  },
  C: {
    id: 'C',
    display: 'Wall Insulation',
    description: 'Exterior wall insulation IN02 thickness (baseline 0.090m vs increased 0.140m)'
  }
};

// Closed provenance type system
export type ProvenanceType =
  | 'source'
  | 'inference'
  | 'assumption'
  | 'domain-knowledge'
  | 'needs-evidence'
  | 'needs-review';

export const PROVENANCE_LABELS: Record<ProvenanceType, string> = {
  'source': 'FROM SOURCE',
  'inference': 'AI INFERENCE',
  'assumption': 'ASSUMPTION',
  'domain-knowledge': 'DOMAIN KNOWLEDGE',
  'needs-evidence': 'NEEDS EVIDENCE',
  'needs-review': 'NEEDS REVIEW'
};

// Normalize any provenance value to valid enum or needs-review fallback
export function normalizeProvenance(value: unknown): ProvenanceType {
  if (typeof value !== 'string') return 'needs-review';

  const normalized = value.toLowerCase().replace(/_/g, '-');

  if (normalized === 'source') return 'source';
  if (normalized === 'inference') return 'inference';
  if (normalized === 'assumption') return 'assumption';
  if (normalized === 'domain-knowledge') return 'domain-knowledge';
  if (normalized === 'needs-evidence') return 'needs-evidence';
  if (normalized === 'needs-review') return 'needs-review';

  return 'needs-review';
}

// Professional review action types
export type ProfessionalAction = 'accept' | 'revise' | 'reject';

export const PROFESSIONAL_ACTION_LABELS: Record<ProfessionalAction, string> = {
  'accept': 'accepted',
  'revise': 'revised',
  'reject': 'rejected'
};

// Canonical source-backed project goals
export type CanonicalSourceGoalId = 'cooling-retention' | 'annual-energy';

export const CANONICAL_SOURCE_GOALS: Record<CanonicalSourceGoalId, {
  id: CanonicalSourceGoalId;
  text: string;
  source: string;
}> = {
  'cooling-retention': {
    id: 'cooling-retention',
    text: 'Reduce cooling energy while maintaining façade openness (south window area must remain ≥70% of baseline window area)',
    source: 'client-brief.md: requirements'
  },
  'annual-energy': {
    id: 'annual-energy',
    text: 'Improve annual energy performance without major HVAC redesign',
    source: 'client-brief.md: requirements'
  }
};

// Canonical current-decision source
export type CanonicalDecisionId = 'envelope-parametric-selection';

export const CANONICAL_DECISIONS: Record<CanonicalDecisionId, {
  id: CanonicalDecisionId;
  text: string;
  source: string;
}> = {
  'envelope-parametric-selection': {
    id: 'envelope-parametric-selection',
    text: 'Selecting which façade/envelope parametric combinations to develop before design advances',
    source: 'client-brief.md'
  }
};

// Canonical source facts used by candidate drivers
export type CanonicalSourceFactId =
  | 'WF-1-geometry'
  | 'overhang-depth-1.3m'
  | 'IN02-thickness-0.090m';

export const CANONICAL_SOURCE_FACTS: Record<CanonicalSourceFactId, {
  id: CanonicalSourceFactId;
  claim: string;
  source: string;
}> = {
  'WF-1-geometry': {
    id: 'WF-1-geometry',
    claim: 'South façade window WF-1: 13.8m × 1.2m = 16.56 m² on a 30.5m × 2.4m = 73.2 m² wall',
    source: '5ZoneAirCooled.idf: WF-1 geometry'
  },
  'overhang-depth-1.3m': {
    id: 'overhang-depth-1.3m',
    claim: 'Existing overhang 1.3m projection',
    source: '5ZoneAirCooled.idf: Main South Overhang depth 1.3m'
  },
  'IN02-thickness-0.090m': {
    id: 'IN02-thickness-0.090m',
    claim: 'Exterior wall insulation IN02 currently 90mm',
    source: '5ZoneAirCooled.idf: IN02 thickness 0.090m'
  }
};

// Practice signal action types
export type PracticeSignalAction =
  | 'loaded_project'
  | 'captured_before_ai_plan'
  | 'changed_priority'
  | 'professional_challenge'
  | 'live_ai_framing_run'
  | 'live_ai_framing_failed'
  | 'live_ai_framing_error'
  | 'live_ai_framing_cached';

export const PRACTICE_SIGNAL_LABELS: Record<PracticeSignalAction, string> = {
  'loaded_project': 'Loaded sample project',
  'captured_before_ai_plan': 'Documented baseline approach',
  'changed_priority': 'Adjusted a priority level',
  'professional_challenge': 'Professional review',
  'live_ai_framing_run': 'Ran live AI framing',
  'live_ai_framing_failed': 'Live AI framing failed',
  'live_ai_framing_error': 'Live AI framing error',
  'live_ai_framing_cached': 'Loaded cached live framing'
};

// Live API response structure
export interface LiveFramingResponse {
  decision_framing: {
    current_decision: {
      claim: string;
      source_type: string;
      source?: string;
      canonical_decision_id?: CanonicalDecisionId;
    };
    relevant_goals: Array<{
      claim: string;
      source_type: string;
      source?: string;
      canonical_source_goal_id?: CanonicalSourceGoalId;
    }>;
  };
  candidate_drivers: Array<{
    claim: string;
    source_type: string;
    source?: string;
    canonical_source_fact_id?: CanonicalSourceFactId;
  }>;
  hidden_assumptions?: Array<{
    claim: string;
    source_type: string;
    source?: string;
  }>;
  missing_evidence?: string[];
  prioritized_hypotheses: Array<{
    name: string;
    variable_ids: ApprovedVariableId[];
    what_it_is: string;
    why_now: string;
    affects_requirements: string;
    why_test_together: string;
    potential_upside: string;
    potential_downside: string;
    unknown: string;
    what_would_change_priority: string;
    priority_bucket: 'FOCUS_NOW' | 'WATCH_DEFER' | 'NO_NEW_ANALYSIS';
    priority_factors?: Record<string, any>;
  }>;
}

// Current live-framing cache schema version
// Increment this when LiveFramingResponse structure changes
export const LIVE_FRAMING_CACHE_VERSION = 'v2';
export const LIVE_FRAMING_CACHE_KEY = `live-ai-framing-${LIVE_FRAMING_CACHE_VERSION}`;

// Sessionstorage key (sibling to LIVE_FRAMING_CACHE_KEY) holding the project-inputs +
// professional-baseline key that the cached LiveFramingResponse was generated for.
// Used to invalidate stale cached/prefetched results when inputs change.
export const LIVE_FRAMING_CACHE_INPUTS_KEY = `${LIVE_FRAMING_CACHE_KEY}-inputs`;

// Compact live-AI schema: the ONLY thing the model generates for Live AI framing.
// Everything else (decision framing, project goals, candidate drivers, source text)
// is server-owned canonical content, assembled around this compact delta.
export interface CompactFramingResponse {
  // Investigation priority order among the three canonical variables, highest first.
  // Must be a permutation of exactly ['A','B','C'].
  priority_order: ApprovedVariableId[];
  // One short rationale per variable (why it sits where it does in priority_order).
  priority_rationale: Partial<Record<ApprovedVariableId, string>>;
  // At most one interaction worth investigating together, or null if none stands out.
  interaction?: { variable_ids: ApprovedVariableId[]; rationale: string } | null;
  // One concise observation about what evidence is still missing.
  missing_evidence: string;
}
