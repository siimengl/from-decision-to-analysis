// Server-side fail-closed validation for Live API responses

import {
  ApprovedVariableId,
  LiveFramingResponse,
  normalizeProvenance,
  CANONICAL_SOURCE_GOALS,
  CanonicalSourceGoalId,
  CANONICAL_DECISIONS,
  CanonicalDecisionId,
  CANONICAL_SOURCE_FACTS,
  CanonicalSourceFactId
} from './types';
import { stagedFraming } from './stagedContent';

interface ValidationError {
  field: string;
  message: string;
  fatal: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  // Server-owned canonical substitutions applied to the sanitized response
  sanitized?: any;
}

// Validate that a FOCUS_NOW hypothesis uses only approved variable IDs
function validateFocusNowVariableIds(hypothesis: any, index: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (hypothesis.priority_bucket !== 'FOCUS_NOW') return errors;

  // Check variable_ids field exists and is array
  if (!hypothesis.variable_ids || !Array.isArray(hypothesis.variable_ids)) {
    errors.push({
      field: `prioritized_hypotheses[${index}].variable_ids`,
      message: `FOCUS_NOW hypothesis "${hypothesis.name}" missing variable_ids array`,
      fatal: true
    });
    return errors;
  }

  // Check count
  if (hypothesis.variable_ids.length === 0 || hypothesis.variable_ids.length > 3) {
    errors.push({
      field: `prioritized_hypotheses[${index}].variable_ids`,
      message: `FOCUS_NOW hypothesis "${hypothesis.name}" has ${hypothesis.variable_ids.length} variable_ids (must be 1-3)`,
      fatal: true
    });
    return errors;
  }

  // Check each ID is valid
  const validIds: ApprovedVariableId[] = ['A', 'B', 'C'];
  for (const vid of hypothesis.variable_ids) {
    if (!validIds.includes(vid)) {
      errors.push({
        field: `prioritized_hypotheses[${index}].variable_ids`,
        message: `FOCUS_NOW hypothesis "${hypothesis.name}" contains invalid variable_id: ${vid} (only A/B/C allowed)`,
        fatal: true
      });
    }
  }

  return errors;
}

// Check if text content introduces unsupported variables
function validateFocusNowContent(hypothesis: any, index: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (hypothesis.priority_bucket !== 'FOCUS_NOW') return errors;

  const text = `${hypothesis.name} ${hypothesis.what_it_is} ${hypothesis.why_now}`.toLowerCase();

  // List of unsupported concepts
  const unsupportedPatterns = [
    { pattern: /\b(shgc|solar heat gain coefficient)\b/i, name: 'SHGC' },
    { pattern: /\b(glazing u-?value|window u-?value|glazing u-?factor|window u-?factor)\b/i, name: 'glazing U-value' },
    { pattern: /\b(ventilation rate|air change|natural ventilation)\b/i, name: 'ventilation' },
    { pattern: /\b(hvac|mechanical system|system redesign)\b/i, name: 'HVAC system', allowNegative: true }
  ];

  for (const { pattern, name, allowNegative } of unsupportedPatterns) {
    if (pattern.test(text)) {
      // If allowNegative, check if it's explicitly excluded (e.g., "no HVAC")
      if (allowNegative && (/\b(no|without|avoid|defer)\s+(hvac|mechanical)/i.test(text))) {
        continue;
      }
      errors.push({
        field: `prioritized_hypotheses[${index}].name`,
        message: `FOCUS_NOW hypothesis "${hypothesis.name}" introduces unsupported variable: ${name}`,
        fatal: true
      });
    }
  }

  // Check hypothesis name doesn't have raw underscores
  if (hypothesis.name.includes('_')) {
    errors.push({
      field: `prioritized_hypotheses[${index}].name`,
      message: `FOCUS_NOW hypothesis name must be natural English, not raw identifiers: "${hypothesis.name}"`,
      fatal: true
    });
  }

  return errors;
}

// Validate SOURCE current_decision has canonical decision ID
function validateSourceCurrentDecision(response: any): ValidationError[] {
  const errors: ValidationError[] = [];
  const currentDecision = response.decision_framing?.current_decision;
  if (!currentDecision) return errors;

  const sourceType = normalizeProvenance(currentDecision.source_type);
  if (sourceType === 'source') {
    const canonicalId = currentDecision.canonical_decision_id;
    if (!canonicalId || !Object.keys(CANONICAL_DECISIONS).includes(canonicalId)) {
      errors.push({
        field: 'decision_framing.current_decision',
        message: `SOURCE current_decision lacks valid canonical_decision_id: "${currentDecision.claim?.substring(0, 60)}..."`,
        fatal: true
      });
    }
  }
  return errors;
}

// Validate SOURCE project goals have canonical references
function validateSourceGoals(response: any): ValidationError[] {
  const errors: ValidationError[] = [];

  const relevantGoals = response.decision_framing?.relevant_goals || [];

  for (let i = 0; i < relevantGoals.length; i++) {
    const goal = relevantGoals[i];
    const sourceType = normalizeProvenance(goal.source_type);

    if (sourceType === 'source') {
      // SOURCE claims about project goals must reference canonical goals
      const hasCanonicalRef = goal.canonical_source_goal_id &&
        Object.keys(CANONICAL_SOURCE_GOALS).includes(goal.canonical_source_goal_id);

      if (!hasCanonicalRef) {
        errors.push({
          field: `decision_framing.relevant_goals[${i}]`,
          message: `SOURCE project goal lacks canonical_source_goal_id reference: "${goal.claim?.substring(0, 60)}..."`,
          fatal: true
        });
      }
    }
  }

  return errors;
}

// Validate SOURCE candidate drivers have canonical source fact references
function validateSourceCandidateDrivers(response: any): ValidationError[] {
  const errors: ValidationError[] = [];

  const drivers = response.candidate_drivers || [];
  for (let i = 0; i < drivers.length; i++) {
    const driver = drivers[i];
    const sourceType = normalizeProvenance(driver.source_type);

    if (sourceType === 'source') {
      const canonicalFactId = driver.canonical_source_fact_id;
      if (!canonicalFactId || !Object.keys(CANONICAL_SOURCE_FACTS).includes(canonicalFactId)) {
        errors.push({
          field: `candidate_drivers[${i}]`,
          message: `SOURCE candidate driver lacks valid canonical_source_fact_id: "${driver.claim?.substring(0, 60)}..."`,
          fatal: true
        });
      }
    }
  }

  return errors;
}

// Novel quantitative outcome claim patterns
// These detect model-invented performance numbers that are not from canonical sources.
// Known project input numbers (16.56 m², 12.42 m², 1.3m, 2.0m, 0.090m, 0.140m, 70%, 75%)
// are allowed only via canonical source entities (SOURCE + canonical_source_fact_id), not via text matching.
const NOVEL_QUANTITATIVE_OUTCOME_PATTERNS = [
  // Energy savings/reduction outcome numbers
  /\b\d+(\.\d+)?\s*(GJ|kWh|MWh|BTU|kBTU)\s*(savings?|reduction|improvement|increase|decrease|lower|less|more)\b/i,
  /\b(savings?|reduction|improvement)\s+of\s+\d+(\.\d+)?\s*(GJ|kWh|MWh|BTU|kBTU)\b/i,
  /\b\d+(\.\d+)?\s*%\s*(savings?|reduction|improvement|increase|decrease|better|worse|more efficient)\b/i,
  /\b(saves?|reduces?|improves?|increases?|decreases?)\s+\w*\s*\d+(\.\d+)?\s*%/i,
  /\b(saves?|reduces?|improves?)\s+\d+(\.\d+)?\s*(GJ|kWh|MWh)/i,
  // Cost / payback
  /\$\s*\d+/,
  /\b\d+(\.\d+)?[\s-]*(year|month|yr)[\s-]*(payback|return|roi)\b/i,
  /\bpayback\s+(of|in|period|in)\s+\d+/i,
  // Cost qualifiers that imply quantitative outcome
  /\b(low|high|medium|minimal|negligible|significant)[\s-]?(cost|risk)\b/i,
  // W/kW performance claims
  /\b\d+(\.\d+)?\s*(W|kW|watt|kilowatt)(\s*\/\s*(m²|sqm|sf))?\s*(reduction|savings?|improvement)\b/i,
  // Novel percentage performance (not input percentages like 70%/75% baseline)
  // We accept 70% and 75% only as canonical input references via SOURCE.
  // Non-source percentage outcome claims:
  /\b\d+(\.\d+)?\s*%\s*(of\s+energy|energy\s+savings?|cooling\s+reduction|heating\s+reduction|energy\s+reduction)\b/i
];

// Allowed canonical input numbers embedded in INFERENCE/ASSUMPTION/DOMAIN_KNOWLEDGE text.
// These are numbers that describe project inputs, not outcome predictions.
// They come from canonical source facts and may be mentioned in non-SOURCE reasoning.
// Validation allows them through because they describe starting conditions, not model-invented results.
const CANONICAL_INPUT_PATTERNS = [
  /\b16\.56\s*m²?\b/,
  /\b12\.42\s*m²?\b/,
  /\b1\.3\s*m\b/,
  /\b2\.0\s*m\b/,
  /\b0\.090\s*m\b/,
  /\b0\.14\s*m\b/,
  /\b70\s*%\s*(of\s+baseline|baseline|minimum|retention|constraint|retain|floor)\b/i,
  /\b75\s*%\s*(of\s+baseline|baseline|area)\b/i,
  /\b11\.59\s*m²?\b/
];

function containsOnlyCanonicalInputNumbers(text: string, matchedPattern: RegExp): boolean {
  // Get the actual matched text
  const match = text.match(matchedPattern);
  if (!match) return false;

  // Check if each canonical input pattern accounts for the matched number
  const matchedText = match[0];
  return CANONICAL_INPUT_PATTERNS.some(cp => cp.test(matchedText));
}

// Validate no unsupported quantitative claims are promoted as fact
function validateQuantitativeClaims(response: any): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check candidate driver claims
  const drivers = response.candidate_drivers || [];
  for (let i = 0; i < drivers.length; i++) {
    const driver = drivers[i];
    const sourceType = normalizeProvenance(driver.source_type);

    if (sourceType === 'source') {
      // SOURCE claims are handled via canonical fact validation
      continue;
    }

    for (const pattern of NOVEL_QUANTITATIVE_OUTCOME_PATTERNS) {
      if (pattern.test(driver.claim)) {
        // Allow if the match is a canonical input number reference, not an outcome prediction
        if (containsOnlyCanonicalInputNumbers(driver.claim, pattern)) continue;
        errors.push({
          field: `candidate_drivers[${i}]`,
          message: `Unsupported quantitative outcome claim promoted as ${driver.source_type}: "${driver.claim.substring(0, 80)}"`,
          fatal: true
        });
        break;
      }
    }
  }

  // Check hypothesis content — FOCUS_NOW quantitative violations are FATAL
  const hypotheses = response.prioritized_hypotheses || [];
  for (let i = 0; i < hypotheses.length; i++) {
    const hyp = hypotheses[i];
    const textFields = [
      hyp.potential_upside,
      hyp.potential_downside,
      hyp.why_now,
      hyp.what_it_is
    ].filter(Boolean).join(' ');

    for (const pattern of NOVEL_QUANTITATIVE_OUTCOME_PATTERNS) {
      if (pattern.test(textFields)) {
        if (containsOnlyCanonicalInputNumbers(textFields, pattern)) continue;
        errors.push({
          field: `prioritized_hypotheses[${i}]`,
          message: `Hypothesis "${hyp.name}" contains unsupported quantitative outcome claim`,
          // FATAL for FOCUS_NOW, fatal for all to prevent bypass via lower priority buckets
          fatal: true
        });
        break;
      }
    }
  }

  return errors;
}

// Apply server-owned canonical text to SOURCE entries so model-tampered text cannot surface.
// Returns a deep-cloned, sanitized version of the response.
function applyCanonicalSubstitutions(response: any): any {
  const sanitized = JSON.parse(JSON.stringify(response));

  // Replace current_decision claim/source if canonical_decision_id is valid
  const cd = sanitized.decision_framing?.current_decision;
  if (cd) {
    const sourceType = normalizeProvenance(cd.source_type);
    if (sourceType === 'source' && cd.canonical_decision_id &&
        Object.keys(CANONICAL_DECISIONS).includes(cd.canonical_decision_id)) {
      const canonical = CANONICAL_DECISIONS[cd.canonical_decision_id as CanonicalDecisionId];
      cd.claim = canonical.text;
      cd.source = canonical.source;
    }
  }

  // Replace relevant_goals claim/source from canonical server-owned text
  const goals = sanitized.decision_framing?.relevant_goals || [];
  for (const goal of goals) {
    const sourceType = normalizeProvenance(goal.source_type);
    if (sourceType === 'source' && goal.canonical_source_goal_id &&
        Object.keys(CANONICAL_SOURCE_GOALS).includes(goal.canonical_source_goal_id)) {
      const canonical = CANONICAL_SOURCE_GOALS[goal.canonical_source_goal_id as CanonicalSourceGoalId];
      goal.claim = canonical.text;
      goal.source = canonical.source;
    }
  }

  // Replace candidate_drivers claim/source from canonical server-owned fact text
  const drivers = sanitized.candidate_drivers || [];
  for (const driver of drivers) {
    const sourceType = normalizeProvenance(driver.source_type);
    if (sourceType === 'source' && driver.canonical_source_fact_id &&
        Object.keys(CANONICAL_SOURCE_FACTS).includes(driver.canonical_source_fact_id)) {
      const canonical = CANONICAL_SOURCE_FACTS[driver.canonical_source_fact_id as CanonicalSourceFactId];
      driver.claim = canonical.claim;
      driver.source = canonical.source;
    }
  }

  return sanitized;
}

// Structural validator for cached/incoming live framing responses
// Used by both server validation and client-side cache validation
export function isValidLiveFramingStructure(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if (!data.decision_framing || !data.prioritized_hypotheses) return false;
  if (!data.decision_framing.current_decision) return false;
  if (!Array.isArray(data.prioritized_hypotheses)) return false;
  if (!Array.isArray(data.candidate_drivers)) return false;
  return true;
}

// Main validation function
export function validateLiveFramingResponse(response: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 1. Structural validation
  if (!response.decision_framing || !response.prioritized_hypotheses) {
    errors.push({
      field: 'root',
      message: 'Missing required top-level fields (decision_framing, prioritized_hypotheses)',
      fatal: true
    });
    return { valid: false, errors, warnings };
  }

  // 2. Validate FOCUS_NOW count
  const focusNowHyps = response.prioritized_hypotheses.filter(
    (h: any) => h.priority_bucket === 'FOCUS_NOW'
  );

  if (focusNowHyps.length > 3) {
    errors.push({
      field: 'prioritized_hypotheses',
      message: `Too many FOCUS_NOW hypotheses: ${focusNowHyps.length} (max 3)`,
      fatal: true
    });
  }

  // 3. Validate each FOCUS_NOW hypothesis variable IDs and content
  response.prioritized_hypotheses.forEach((hyp: any, i: number) => {
    errors.push(...validateFocusNowVariableIds(hyp, i));
    errors.push(...validateFocusNowContent(hyp, i));
  });

  // 4. Validate SOURCE current_decision canonical ID
  errors.push(...validateSourceCurrentDecision(response));

  // 5. Validate SOURCE goals have canonical references
  errors.push(...validateSourceGoals(response));

  // 6. Validate SOURCE candidate drivers have canonical fact references
  errors.push(...validateSourceCandidateDrivers(response));

  // 7. Validate quantitative claims (all fatal — FOCUS_NOW and non-SOURCE)
  const quantErrors = validateQuantitativeClaims(response);
  errors.push(...quantErrors);

  // 8. Validate provenance types are normalizable
  const allClaims = [
    ...(response.candidate_drivers || []),
    ...(response.hidden_assumptions || []),
    ...(response.decision_framing?.relevant_goals || [])
  ];

  allClaims.forEach((claim: any, i: number) => {
    const normalized = normalizeProvenance(claim.source_type);
    if (normalized === 'needs-review' && claim.source_type !== 'NEEDS_REVIEW') {
      warnings.push({
        field: `claim[${i}].source_type`,
        message: `Unknown provenance type "${claim.source_type}" normalized to needs-review`,
        fatal: false
      });
    }
  });

  const fatalErrors = errors.filter(e => e.fatal);

  // 9. Apply canonical text substitutions (fail-closed: replace model text with server-owned text)
  const sanitized = fatalErrors.length === 0 ? applyCanonicalSubstitutions(response) : undefined;

  return {
    valid: fatalErrors.length === 0,
    errors: fatalErrors,
    warnings: [...warnings, ...errors.filter(e => !e.fatal)],
    sanitized
  };
}

// Return fallback prepared content with graceful message
export function getFallbackFraming(validationErrors: ValidationError[]): {
  success: boolean;
  data: any;
  mode: 'staged';
  fallback_reason: string;
} {
  const errorSummary = validationErrors.slice(0, 3).map(e => e.message).join('; ');

  return {
    success: false,
    data: stagedFraming,
    mode: 'staged',
    fallback_reason: `Live framing validation failed: ${errorSummary}`
  };
}
