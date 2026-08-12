// PREPARED PILOT: completed pilot content that MUST NOT be overwritten by Live AI

import { ApprovedVariableId } from './types';

export const PREPARED_PILOT = {
  // Smallest Useful Test Set - Live AI does not design or rationalize the simulation set
  test_set: {
    rationale: 'An 8-case 2×2×2 factorial study to discriminate between key hypotheses and expose main effects plus interactions:',
    factors: {
      A: {
        display: 'Window Area',
        baseline: 'Baseline (16.56 m²)',
        modified: 'Reduced to 75% of baseline (12.42 m², centered horizontally, same height)'
      },
      B: {
        display: 'Overhang Depth',
        baseline: 'Baseline (1.3m)',
        modified: 'Extended (2.0m)'
      },
      C: {
        display: 'Wall Insulation',
        baseline: 'Baseline (0.090m)',
        modified: 'Increased (0.14m)'
      }
    },
    cases: [
      { id: 1, A: 'Baseline', B: 'Baseline', C: 'Baseline', why: 'Reference case — current design' },
      { id: 2, A: 'Reduced', B: 'Baseline', C: 'Baseline', why: 'Window Area main effect' },
      { id: 3, A: 'Baseline', B: 'Extended', C: 'Baseline', why: 'Overhang Depth main effect' },
      { id: 4, A: 'Baseline', B: 'Baseline', C: 'Increased', why: 'Wall Insulation main effect' },
      { id: 5, A: 'Reduced', B: 'Extended', C: 'Baseline', why: 'Window Area × Overhang Depth interaction' },
      { id: 6, A: 'Reduced', B: 'Baseline', C: 'Increased', why: 'Window Area × Wall Insulation interaction' },
      { id: 7, A: 'Baseline', B: 'Extended', C: 'Increased', why: 'Overhang Depth × Wall Insulation interaction' },
      { id: 8, A: 'Reduced', B: 'Extended', C: 'Increased', why: 'Combined maximum intervention' }
    ],
    design_note: '8 runs = full 2³ factorial: 3 main effects + 3 two-way interactions + 1 three-way interaction. Real limits: 2 levels do not map curvature/nonlinearity; unreplicated runs lack independent pure-error estimation; this is directional early-stage learning, not global optimization.'
  },

  // Professional Challenge context
  professional_challenge: {
    context: 'Pilot checkpoint — this evaluation applied to the prepared framing.',
    prompt: 'Before proceeding to evidence interpretation, evaluate the AI framing and test set.'
  },

  // Real Evidence metadata
  evidence_metadata: {
    status_badge: '✓ 8/8 validated simulations complete',
    status_detail: 'EnergyPlus 2³ factorial study • Chicago TMY3 • Generated 2026-08-10T19:29:22',
    note: 'Pilot evidence — these results were generated locally with EnergyPlus 26.1 from public sample inputs and bundled into the browser demo. EnergyPlus is not run on demand.'
  },

  // Evidence Reversal - canonical terminology
  evidence_reversal: {
    note: 'The evidence below evaluates the prepared pilot framing used to design this 8-case study.',
    pilot_framing: 'Window Area × Overhang Depth interaction deserved first attention.',
    evidence_findings: [
      'Interactions are negligible in tested ranges',
      'Factor C (Wall Insulation) is the strongest measured energy lever'
    ],
    grid: {
      supported: 'Three factors are independently adjustable and testable',
      challenged: 'Expected Window Area × Overhang Depth interaction was weak; Wall Insulation dominates',
      new_priority: 'Wall Insulation deserves higher investigation priority than initial framing suggested',
      still_unknown: 'Daylight, glare, views, cost, embodied carbon, constructability'
    }
  },

  // Evidence-Backed Recommendation - canonical terminology
  recommendation: {
    note: 'Pilot recommendation based on the completed evidence.',
    leading_direction: 'Wall Insulation (Factor C) deserves higher investigation priority than the initial framing suggested',
    context: 'Within this model, tested ranges, and measured energy metrics:',
    performs_well: [
      'Reduces energy across all tested combinations',
      'Benefits heating more than cooling (annual performance)',
      'Effect size 5-10× larger than Window Area or Overhang Depth changes in this model'
    ],
    sacrifices: [
      'Increased wall thickness and construction complexity',
      'Cost impact not modeled',
      'Embodied carbon of added insulation material not assessed',
      'Constructability and schedule impact unknown'
    ],
    why_others_lower: 'Window Area and Overhang Depth show smaller effects, and their interaction is negligible (<0.04 GJ) in the tested ranges. They remain adjustable but become secondary energy questions based on this evidence.',
    remaining_risks: [
      'Daylight quality, glare, and view impacts (not modeled)',
      'Cost and embodied carbon trade-offs',
      'Constructability and schedule implications',
      'Whether larger insulation increases show diminishing returns',
      'Client acceptance of thicker wall assemblies'
    ],
    other_directions: 'Combined strategies (AC+, ABC+) show cumulative benefits without strong negative interactions. If construction complexity is acceptable, combining reduced glazing with increased insulation maintains the insulation benefit while adding modest cooling gains.',
    what_to_test_next: [
      'Cost and embodied carbon analysis for insulation increase',
      'Constructability review with wall assembly detailing',
      'If insulation is feasible: larger thickness levels to map diminishing returns',
      'Daylight simulation for AC+ combination if that direction proceeds'
    ],
    what_would_change: [
      'Cost/embodied carbon analysis showing insulation is prohibitive',
      'Constructability constraints ruling out thicker walls',
      'Client prioritizing cooling over annual energy (favors overhang)',
      'Daylight/glare requirements becoming primary drivers'
    ]
  },

  // Decision Delta - canonical terminology
  decision_delta: {
    note: 'Pilot comparison showing how evidence changed direction.',
    pilot_ai_framing: 'Window Area × Overhang Depth interaction deserved first attention',
    after_evidence: 'Greater attention to Wall Insulation; façade options become secondary energy questions',
    why_changed: {
      headline: 'Evidence, not AI confidence, changed the priority.',
      details: [
        'Expected Window Area × Overhang Depth interaction was weak (<0.04 GJ in tested ranges)',
        'Wall Insulation had the strongest measured energy effect (5-10× larger than Window Area/Overhang Depth changes)',
        'Initial AI framing was challenged by simulation results'
      ],
      primary_question: 'Did AI make the search and decision process smarter? — not "Was AI right?"',
      usefulness_criteria: [
        '✓ Surfaced a material missed issue — insulation was underweighted in initial framing',
        '✓ Exposed an unsupported assumption — interaction importance was overestimated',
        '✓ Found a single-variable conclusion that mattered more than combinations',
        'Redirected effort to a more informative test — tested design remains useful',
        'Clarified a client-value trade-off — energy vs cost/complexity now explicit'
      ]
    }
  },

  // Draft Practice Card - canonical terminology
  practice_card: {
    heading: 'Professional review of AI framing',
    when_useful: 'Early-stage façade/envelope decisions with multiple adjustable variables, explicit client constraints, and uncertainty about which interactions matter',
    minimum_inputs: [
      'Baseline energy model (IDF or equivalent)',
      'Climate context (weather file)',
      'Client requirements and hard constraints',
      'Decision at stake'
    ],
    evidence_required: 'Actual simulation results from trusted performance tools (EnergyPlus or equivalent). AI cannot invent performance numbers.',
    observations_this_sample: [
      'Expected Window Area × Overhang Depth interaction was weak in tested ranges (<0.04 GJ)',
      'Wall Insulation had the strongest measured energy effect (not initially prioritized)',
      'Initial AI framing was challenged by simulation — evidence shifted the priority',
      'Do not generalize this project result into a universal building-performance rule'
    ],
    professional_judgment: [
      'Final design decision and trade-off acceptance',
      'Client value priorities when metrics conflict',
      'Aesthetic, cultural, and experiential factors not modeled',
      'When evidence is sufficient vs when further analysis is needed',
      'Construction feasibility and cost acceptance'
    ]
  }
};
