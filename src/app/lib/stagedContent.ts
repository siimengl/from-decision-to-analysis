// Staged deterministic AI framing as fallback
export const stagedFraming = {
  decision_framing: {
    current_decision: {
      claim: "Selecting which façade/envelope parametric combinations to develop before design advances",
      source_type: "SOURCE",
      source: "client-brief.md"
    },
    relevant_goals: [
      {
        claim: "Reduce cooling energy while maintaining façade openness (south window area must remain ≥70% of baseline window area)",
        source_type: "SOURCE",
        source: "client-brief.md: requirements"
      },
      {
        claim: "Improve annual energy performance without major HVAC redesign",
        source_type: "SOURCE",
        source: "client-brief.md: requirements"
      }
    ]
  },
  candidate_drivers: [
    {
      claim: "South façade window WF-1: 13.8m × 1.2m = 16.56 m² on a 30.5m × 2.4m = 73.2 m² wall",
      source_type: "SOURCE",
      source: "5ZoneAirCooled.idf: WF-1 geometry"
    },
    {
      claim: "South-facing glazing in Chicago climate likely drives summer cooling loads",
      source_type: "INFERENCE"
    },
    {
      claim: "Existing overhang 1.3m projection",
      source_type: "SOURCE",
      source: "5ZoneAirCooled.idf: Main South Overhang depth 1.3m"
    },
    {
      claim: "Deeper overhang extension could reduce direct solar gain",
      source_type: "INFERENCE"
    },
    {
      claim: "Exterior wall insulation IN02 currently 90mm",
      source_type: "SOURCE",
      source: "5ZoneAirCooled.idf: IN02 thickness 0.090m"
    },
    {
      claim: "Increased insulation thickness could reduce envelope load",
      source_type: "INFERENCE"
    }
  ],
  prioritized_hypotheses: [
    {
      name: "Window area × Overhang depth interaction",
      variable_ids: ["A", "B"],
      what_it_is: "Testing south window area (baseline vs 75% of baseline area) combined with overhang depth (1.3m baseline vs 2.0m extended)",
      why_now: "These are the two most adjustable façade moves that directly affect solar heat gain. The combination may reinforce, overlap, diminish, or create trade-offs that single-factor tests cannot reveal.",
      affects_requirements: "Cooling energy reduction (primary target), façade openness (hard constraint), visual dominance preference",
      why_test_together: "If window area drops, the overhang shades less glass, potentially reducing its marginal value. If the overhang is deep, window reduction may offer less additional benefit.",
      potential_upside: "Significant cooling load reduction while staying within the glazing constraint",
      potential_downside: "Deeper overhang may conflict with 'not visually dominant' preference; window area reduction (while meeting ≥70% of baseline constraint) may affect openness perception",
      unknown: "Whether the interaction is additive, synergistic, or shows diminishing returns; heating penalty in shoulder seasons; daylight impact",
      what_would_change_priority: "Evidence showing interactions are negligible, or client relaxing the ≥70% of baseline window area constraint",
      priority_bucket: "FOCUS_NOW"
    }
  ]
};

export const stagedInterpretation = {
  leading_direction: "Envelope insulation (Factor C) deserves higher investigation priority than the initial framing suggested",
  performs_well: [
    "Reduces energy across all tested combinations",
    "Benefits heating more than cooling (annual performance)",
    "Effect size 5-10× larger than window or overhang changes in this model"
  ],
  sacrifices: [
    "Increased wall thickness and construction complexity",
    "Cost impact not modeled",
    "Embodied carbon of added insulation material not assessed"
  ],
  why_others_not_first: "Window area and overhang show smaller effects, and their interaction is negligible (<0.04 GJ) in the tested ranges",
  what_to_test_next: [
    "Cost and embodied carbon analysis for insulation increase",
    "Constructability review with wall assembly detailing"
  ]
};
