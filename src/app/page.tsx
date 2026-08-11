'use client';

import { useState, useEffect } from 'react';
import RealEvidenceSection from './components/RealEvidenceSection';
import evidenceData from '../../data/evidence.json';

function Tag({ type, source }: { type: 'source' | 'inference' | 'assumption' | 'domain-knowledge' | 'needs-evidence' | 'needs-review'; source?: string }) {
  const styles = {
    source: 'bg-blue-50 text-blue-700 border-blue-200',
    inference: 'bg-amber-50 text-amber-700 border-amber-200',
    assumption: 'bg-purple-50 text-purple-700 border-purple-200',
    'domain-knowledge': 'bg-teal-50 text-teal-700 border-teal-200',
    'needs-evidence': 'bg-rose-50 text-rose-700 border-rose-200',
    'needs-review': 'bg-neutral-100 text-neutral-600 border-neutral-300'
  };

  const labels = {
    source: 'FROM SOURCE',
    inference: 'AI INFERENCE',
    assumption: 'ASSUMPTION',
    'domain-knowledge': 'DOMAIN KNOWLEDGE',
    'needs-evidence': 'NEEDS EVIDENCE',
    'needs-review': 'NEEDS REVIEW'
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-block px-2 py-0.5 text-xs font-medium border rounded ${styles[type]}`}>
        {labels[type]}
      </span>
      {source && <span className="text-xs text-neutral-500">{source}</span>}
    </div>
  );
}

// Normalize a live-API field to an array. If the model returns a single
// object/string instead of an array, wrap it so .map() never throws.
// If the value is truly non-iterable (e.g. a number), return the fallback.
function toArr<T>(val: unknown, fallback: T[]): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val !== null && val !== undefined) return [val as T];
  return fallback;
}

export default function Home() {
  const [beforeAIPlan, setBeforeAIPlan] = useState('');
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [decisionStake, setDecisionStake] = useState('');
  const [hardConstraints, setHardConstraints] = useState<string[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);
  const [whatCanChange, setWhatCanChange] = useState<string[]>([]);
  const [whatIsLocked, setWhatIsLocked] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<{item: string; level: string}[]>([]);
  const [professionalAction, setProfessionalAction] = useState<'accept' | 'revise' | 'reject' | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [practiceSignals, setPracticeSignals] = useState<any[]>([]);
  const [aiMode, setAiMode] = useState<'live' | 'prepared' | 'analyzing'>('prepared');
  const [framingData, setFramingData] = useState<any>(null);
  const [interpretationData, setInterpretationData] = useState<any>(null);
  const [liveAiFailureMessage, setLiveAiFailureMessage] = useState(false);
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    beforeAI: true,
    readWork: true,
    decisionMap: true,
    earlyBrief: true,
    testSet: true
  });

  useEffect(() => {
    const saved = localStorage.getItem('practice-signals');
    if (saved) {
      setPracticeSignals(JSON.parse(saved));
    }
  }, []);

  const savePracticeSignal = (signal: any) => {
    const isDuplicate = practiceSignals.some(
      s => s.action === signal.action && JSON.stringify(s.detail) === JSON.stringify(signal.detail)
    );
    if (isDuplicate) return;

    const updated = [...practiceSignals, { ...signal, timestamp: new Date().toISOString() }];
    setPracticeSignals(updated);
    localStorage.setItem('practice-signals', JSON.stringify(updated));
  };

  const clearPracticeSignals = () => {
    setPracticeSignals([]);
    localStorage.removeItem('practice-signals');
  };

  const loadSampleProject = async () => {
    setProjectLoaded(true);
    setDecisionStake('Deciding which early façade/envelope adjustments are worth developing before the design advances');
    setHardConstraints([
      'South window area must remain ≥70% of baseline window area (baseline: 16.56 m², tested: 12.42 m² = 75% of baseline)',
      'No major HVAC system replacement at this stage'
    ]);
    setTargets([
      'Reduce cooling-related energy demand',
      'Improve overall annual energy performance'
    ]);
    setPreferences([
      'Avoid very deep or visually dominant exterior projections',
      'Prefer targeted changes over wholesale façade redesign',
      'Lower construction complexity and cost'
    ]);
    setOpenQuestions([
      'Which façade/envelope relationship deserves analysis first',
      'Whether reducing window area, increasing shading, or increasing wall insulation produces the most useful benefit',
      'Whether measures that look beneficial alone still perform well when combined',
      'Whether current evidence is sufficient to choose a direction'
    ]);
    setWhatCanChange([
      'South window area (within ≥70% of baseline area constraint)',
      'South overhang depth',
      'Exterior wall insulation thickness',
      'Combination strategies'
    ]);
    setWhatIsLocked([
      'Five-zone office model structure',
      'Chicago climate context',
      'HVAC system type (for now)',
      'Building orientation and massing'
    ]);
    setPriorities([
      { item: 'Annual energy performance', level: 'Very High' },
      { item: 'Cooling demand reduction', level: 'Very High' },
      { item: 'Maintaining façade openness', level: 'High' },
      { item: 'Construction simplicity', level: 'Medium' }
    ]);

    savePracticeSignal({ action: 'loaded_project', detail: 'sample_chicago_office' });
    setExpandedSections({ ...expandedSections, readWork: false, decisionMap: true });

    // Check for cached live AI framing
    const cachedFraming = sessionStorage.getItem('live-ai-framing');
    if (cachedFraming) {
      const parsed = JSON.parse(cachedFraming);
      setFramingData(parsed);
      setAiMode('live');
      savePracticeSignal({ action: 'live_ai_framing_cached' });
    }
  };

  const runLiveAI = async () => {
    setAiMode('analyzing');
    setLiveAiFailureMessage(false);
    const startTime = Date.now();

    try {
      const response = await fetch('/api/ai/framing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientBrief: 'Chicago Office Performance Study - deciding which early façade/envelope adjustments are worth developing',
          modelFacts: 'Five-zone office, south window WF-1 16.56m², overhang 1.3m, wall insulation IN02 90mm',
          decisionContext: 'Retain at least 70% of baseline south-window area (baseline 16.56 m², minimum 11.59 m²), reduce cooling energy, avoid major HVAC redesign, understand interactions'
        })
      });
      const result = await response.json();
      const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

      if (result.success) {
        setFramingData(result.data);
        setAiMode('live');
        setLiveAiFailureMessage(false);
        sessionStorage.setItem('live-ai-framing', JSON.stringify(result.data));
        savePracticeSignal({ action: 'live_ai_framing_run', duration_seconds: durationSeconds });
        console.log(`[Live AI] Framing completed in ${durationSeconds}s`);
      } else {
        setAiMode('prepared');
        setLiveAiFailureMessage(true);
        savePracticeSignal({ action: 'live_ai_framing_failed', error: result.error, duration_seconds: durationSeconds });
        console.log(`[Live AI] Framing failed after ${durationSeconds}s:`, result.error);
      }
    } catch (error) {
      const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
      setAiMode('prepared');
      setLiveAiFailureMessage(true);
      savePracticeSignal({ action: 'live_ai_framing_error', duration_seconds: durationSeconds });
      console.log(`[Live AI] Framing error after ${durationSeconds}s:`, error);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections({ ...expandedSections, [section]: !expandedSections[section] });
  };

  const handleProfessionalChallenge = (action: 'accept' | 'revise' | 'reject') => {
    setProfessionalAction(action);
    savePracticeSignal({
      action: 'professional_challenge',
      decision: action,
      reason: correctionReason || 'none provided'
    });
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* Hero */}
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-block px-3 py-1 text-xs font-medium bg-neutral-200 text-neutral-600 rounded">
              FIRST-ROUND ASSIGNMENT PROTOTYPE
            </div>
            <div className="inline-block px-3 py-1 text-xs font-medium bg-neutral-200 text-neutral-600 rounded">
              PUBLIC SAMPLE DATA ONLY
            </div>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3">
            From Decision to Analysis
          </h1>
          <p className="text-xl text-neutral-600 mb-2">
            A lightweight AI decision layer around the performance tools professionals already trust.
          </p>
          <p className="text-base text-neutral-500">
            Turn a large design space into the smallest useful set of evidence—then let the professional decide what it means.
          </p>
          <p className="text-sm text-neutral-400 mt-4">
            Conceived and built specifically for this assignment as a working exploration of Scenario B.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-16">
        {/* 1. Before AI */}
        <section className="space-y-4">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('beforeAI')}>
            <h2 className="text-2xl font-semibold">Before AI</h2>
            <span className="text-neutral-400">{expandedSections.beforeAI ? '−' : '+'}</span>
          </div>
          {expandedSections.beforeAI ? (
            <>
              <p className="text-neutral-600">
                What would you investigate next, and why?
              </p>
              <textarea
                className="w-full h-32 px-4 py-3 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-none"
                placeholder="Capture your baseline plan before any AI output..."
                value={beforeAIPlan}
                onChange={(e) => {
                  setBeforeAIPlan(e.target.value);
                  if (e.target.value.length > 10) {
                    savePracticeSignal({ action: 'captured_before_ai_plan', length: e.target.value.length });
                    setExpandedSections({ ...expandedSections, beforeAI: false, readWork: true });
                  }
                }}
              />
            </>
          ) : (
            <p className="text-sm text-neutral-500">Baseline plan captured. <button onClick={(e) => { e.stopPropagation(); toggleSection('beforeAI'); }} className="text-blue-600 hover:underline">View details</button></p>
          )}
        </section>

        {/* 2. Read the Work */}
        <section className="space-y-4">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('readWork')}>
            <h2 className="text-2xl font-semibold">Read the Work</h2>
            <span className="text-neutral-400">{expandedSections.readWork ? '−' : '+'}</span>
          </div>
          {!projectLoaded ? (
            expandedSections.readWork && (
            <div className="space-y-4">
              <p className="text-neutral-600">
                Load the sample project to begin. The prototype will parse the EnergyPlus model and fictional client brief.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={loadSampleProject}
                  className="px-6 py-3 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors"
                >
                  Load Sample Project
                </button>
                <button
                  onClick={() => {
                    setBeforeAIPlan('I would start by testing window area reduction to 75% baseline and extending the south overhang to 2m, as these seem most impactful for cooling.');
                    loadSampleProject();
                  }}
                  className="px-6 py-3 bg-neutral-200 text-neutral-700 rounded-md hover:bg-neutral-300 transition-colors"
                >
                  Use sample baseline
                </button>
              </div>
            </div>)
          ) : expandedSections.readWork ? (
            <div className="space-y-6">
              <div className="p-4 bg-white border border-neutral-200 rounded-md">
                <div className="text-sm font-medium text-neutral-500 mb-1">Project Context</div>
                <div className="text-neutral-700">
                  Chicago Office Performance Study • Five-zone office model • EnergyPlus 26.1 • TMY3 weather
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Decision at stake</h3>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-400"
                  value={decisionStake}
                  onChange={(e) => setDecisionStake(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Hard constraints</h3>
                {hardConstraints.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-neutral-400 mt-1">•</span>
                    <input
                      type="text"
                      className="flex-1 px-4 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-400"
                      value={item}
                      onChange={(e) => {
                        const updated = [...hardConstraints];
                        updated[i] = e.target.value;
                        setHardConstraints(updated);
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Targets</h3>
                {targets.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-neutral-400 mt-1">•</span>
                    <div className="flex-1 px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-700">
                      {item}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Preferences</h3>
                {preferences.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-neutral-400 mt-1">•</span>
                    <div className="flex-1 px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-700">
                      {item}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Open questions</h3>
                {openQuestions.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-neutral-400 mt-1">•</span>
                    <div className="flex-1 px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-700">
                      {item}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">What can still change</h3>
                  {whatCanChange.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-green-600 mt-1">✓</span>
                      <div className="flex-1 text-sm text-neutral-700">{item}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">What is locked</h3>
                  {whatIsLocked.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-neutral-400 mt-1">—</span>
                      <div className="flex-1 text-sm text-neutral-600">{item}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">What matters most?</h3>
                <p className="text-sm text-neutral-600">Optional priorities (editable)</p>
                {priorities.map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex-1 text-neutral-700">{item.item}</div>
                    <select
                      value={item.level}
                      onChange={(e) => {
                        const updated = [...priorities];
                        updated[i].level = e.target.value;
                        setPriorities(updated);
                        savePracticeSignal({ action: 'changed_priority', item: item.item, new_level: e.target.value });
                      }}
                      className="px-3 py-1 border border-neutral-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    >
                      <option>Very High</option>
                      <option>High</option>
                      <option>Medium</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Project loaded: Chicago Office • 5 zones • 3 adjustable variables. <button onClick={(e) => { e.stopPropagation(); toggleSection('readWork'); }} className="text-blue-600 hover:underline">View details</button></p>
          )}
        </section>

        {projectLoaded && (
          <>
            {/* 3. Decision Map */}
            <section className="space-y-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('decisionMap')}>
                <h2 className="text-2xl font-semibold">Decision Map</h2>
                <span className="text-neutral-400">{expandedSections.decisionMap ? '−' : '+'}</span>
              </div>
              {expandedSections.decisionMap ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`text-sm font-medium px-3 py-1 rounded ${
                      aiMode === 'live'
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : aiMode === 'analyzing'
                        ? 'bg-blue-100 text-blue-800 border border-blue-300 animate-pulse'
                        : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
                    }`}>
                      {aiMode === 'live' ? 'LIVE AI' : aiMode === 'analyzing' ? 'AI ANALYZING...' : 'PREPARED AI'}
                    </div>
                    {aiMode === 'prepared' && (
                      <button
                        onClick={runLiveAI}
                        className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Run Live AI
                      </button>
                    )}
                    {aiMode === 'analyzing' && (
                      <span className="text-xs text-blue-600 italic">Fresh analysis may take about a minute on this demo endpoint.</span>
                    )}
                    {aiMode === 'live' && (
                      <span className="text-xs text-green-600 italic">Fresh AI analysis complete</span>
                    )}
                    {liveAiFailureMessage && aiMode === 'prepared' && (
                      <span className="text-xs text-amber-700 italic">Fresh AI analysis unavailable — prepared framing remains shown.</span>
                    )}
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h3 className="font-semibold">Current decision</h3>
                      <div className="p-4 bg-white border border-neutral-200 rounded-md">
                        <Tag type={(aiMode === 'live' && framingData?.decision_framing?.current_decision?.source_type?.toLowerCase()) as any || 'source'} source={(aiMode === 'live' && framingData?.decision_framing?.current_decision?.source) || "client-brief.md"} />
                        <p className="text-neutral-700 mt-2">
                          {(aiMode === 'live' && framingData?.decision_framing?.current_decision?.claim) || 'Selecting which façade/envelope parametric combinations to develop before design advances'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Relevant project goals</h3>
                      <div className="space-y-2">
                        {toArr(aiMode === 'live' ? framingData?.decision_framing?.relevant_goals : null, [
                          { claim: 'Reduce cooling energy while maintaining façade openness (retain at least 70% of baseline south-window area)', source_type: 'SOURCE', source: 'client-brief.md: requirements' },
                          { claim: 'Improve annual energy performance without major HVAC redesign', source_type: 'SOURCE', source: 'client-brief.md: requirements' }
                        ]).map((goal: any, i: number) => (
                          <div key={i} className="p-3 bg-white border border-neutral-200 rounded-md">
                            <Tag type={goal.source_type?.toLowerCase() as any || 'source'} source={goal.source} />
                            <p className="text-sm text-neutral-700 mt-1">{goal.claim}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Plausible performance drivers</h3>
                      <div className="space-y-2">
                        {toArr(aiMode === 'live' ? framingData?.candidate_drivers : null, [
                          { claim: 'South façade window WF-1: 13.8m × 1.2m = 16.56 m² on a 30.5m × 2.4m = 73.2 m² wall', source_type: 'SOURCE', source: '5ZoneAirCooled.idf: WF-1 geometry' },
                          { claim: 'South-facing glazing in Chicago climate likely drives summer cooling loads', source_type: 'INFERENCE' },
                          { claim: 'Existing overhang 1.3m projection', source_type: 'SOURCE', source: '5ZoneAirCooled.idf: Main South Overhang depth 1.3m' },
                          { claim: 'Deeper overhang extension could reduce direct solar gain', source_type: 'INFERENCE' },
                          { claim: 'Exterior wall insulation IN02 currently 90mm', source_type: 'SOURCE', source: '5ZoneAirCooled.idf: IN02 thickness 0.090m' },
                          { claim: 'Increased insulation thickness could reduce envelope load', source_type: 'INFERENCE' }
                        ]).map((driver: any, i: number) => (
                          <div key={i} className="p-3 bg-white border border-neutral-200 rounded-md">
                            <Tag type={driver.source_type?.toLowerCase() as any || 'inference'} source={driver.source} />
                            <p className="text-sm text-neutral-700 mt-1">{driver.claim}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Hidden assumptions</h3>
                      <div className="space-y-2">
                        {toArr(aiMode === 'live' ? framingData?.hidden_assumptions : null, [
                          { claim: 'That cooling energy is the dominant challenge — heating and shoulder-season performance matter too', source_type: 'INFERENCE' },
                          { claim: 'That single-variable findings predict combined-variable outcomes', source_type: 'INFERENCE' }
                        ]).map((assumption: any, i: number) => (
                          <div key={i} className="p-3 bg-white border border-neutral-200 rounded-md">
                            <Tag type={assumption.source_type?.toLowerCase() as any || 'inference'} source={assumption.source} />
                            <p className="text-sm text-neutral-700 mt-1">{assumption.claim}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Missing evidence</h3>
                      <div className="space-y-2">
                        {toArr(aiMode === 'live' ? framingData?.missing_evidence : null, [
                          'Actual performance impact of each measure individually and in combination',
                          'Whether interaction effects are large enough to change the recommendation',
                          'Daylight quality, glare, and view impacts (not modeled in this sample)'
                        ]).map((evidence: string, i: number) => (
                          <div key={i} className="p-3 bg-white border border-neutral-200 rounded-md">
                            <Tag type="needs-evidence" />
                            <p className="text-sm text-neutral-700 mt-1">{evidence}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-neutral-500">Decision space mapped with 3 drivers, 2 interactions, and missing evidence identified. <button onClick={(e) => { e.stopPropagation(); toggleSection('decisionMap'); }} className="text-blue-600 hover:underline">View details</button></p>
              )}
            </section>

            {/* 4. Early Decision Brief */}
            <section className="space-y-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('earlyBrief')}>
                <h2 className="text-2xl font-semibold">Early Decision Brief — What Deserves Evidence</h2>
                <span className="text-neutral-400">{expandedSections.earlyBrief ? '−' : '+'}</span>
              </div>
              {expandedSections.earlyBrief ? (
                <>
                  <div className={`text-sm font-medium mb-4 italic ${
                    aiMode === 'live' ? 'text-green-700' : aiMode === 'analyzing' ? 'text-blue-600' : 'text-neutral-600'
                  }`}>
                    {aiMode === 'live' ? 'Live AI framing' : aiMode === 'analyzing' ? 'AI analyzing...' : 'Prepared AI framing'}
                  </div>
                  {aiMode === 'live' && (
                    <p className="text-xs text-neutral-600 italic mb-4">
                      Fresh framing may suggest directions for a next iteration; it does not rewrite the completed pilot.
                    </p>
                  )}
                  <div className="space-y-8">
                {toArr(aiMode === 'live' ? framingData?.prioritized_hypotheses : null, [
                  { name: 'Window area × Overhang depth interaction', what_it_is: 'Testing south window area (baseline vs 75% of baseline area) combined with overhang depth (1.3m baseline vs 2.0m extended)', why_now: 'These are the two most adjustable façade moves that directly affect solar heat gain. The combination may reinforce, overlap, diminish, or create trade-offs that single-factor tests cannot reveal. Best alone may not be best together.', affects_requirements: 'Cooling energy reduction (primary target), façade openness (hard constraint), visual dominance preference', why_test_together: 'If window area drops, the overhang shades less glass, potentially reducing its marginal value. If the overhang is deep, window reduction may offer less additional benefit. Single-variable tests cannot reveal this.', potential_upside: 'Significant cooling load reduction while staying within the 70% baseline-window-area retention floor', potential_downside: 'Deeper overhang may conflict with "not visually dominant" preference; window reduction may compromise openness perception even if technically compliant', unknown: 'Whether the interaction is additive, synergistic, or shows diminishing returns; whether heating penalty offsets cooling gain in shoulder seasons; daylight impact (not modeled)', what_would_change_priority: 'Evidence showing interactions are negligible, or client relaxing the 70% baseline-window-area retention floor', priority_bucket: 'FOCUS_NOW', priority_factors: { client_relevance: 'High', potential_impact: 'High', adjustability: 'High', uncertainty: 'High', interaction_potential: 'High', decision_timing: 'Immediate', information_value: 'High', analysis_effort: 'Moderate' } },
                  { name: 'Wall insulation × Window area relationship', what_it_is: 'Testing increased exterior wall insulation IN02 (0.090m baseline vs 0.14m increased) in combination with window area variations', why_now: 'Wall and glazing form the envelope system. Their relative contribution shifts based on their ratio and performance. The combination may show synergy or reveal that one dominates regardless of the other.', affects_requirements: 'Annual energy performance, construction complexity preference', why_test_together: 'If glazing dominates heat transfer, wall insulation gains may be modest. If glazing area decreases, wall insulation becomes proportionally more influential.', potential_upside: 'Envelope performance improvement across all seasons; heating benefit in addition to cooling', potential_downside: 'Increased construction thickness and cost; may offer limited return if glazing remains dominant', unknown: 'Whether wall insulation impact justifies added construction complexity when combined with window/shading changes; whether glazing dominance makes wall changes inconsequential', what_would_change_priority: 'Evidence showing wall contribution is negligible compared to glazing, or client accepting higher construction complexity', priority_bucket: 'FOCUS_NOW', priority_factors: { client_relevance: 'Medium', potential_impact: 'Medium', adjustability: 'High', uncertainty: 'Medium', interaction_potential: 'Medium', decision_timing: 'Immediate', information_value: 'Medium', analysis_effort: 'Moderate' } },
                  { name: 'Three-way interaction (window × overhang × insulation)', what_it_is: 'The 8-run 2³ factorial design already captures the three-way interaction term. Two-level unreplicated results remain directional. If this interaction proves material, it motivates a targeted second-round study with refined levels or replication.', priority_bucket: 'CAPTURE_CAUTIOUSLY', priority_factors: {} },
                  { name: 'HVAC system refinement', what_it_is: 'Client explicitly deferred. Envelope-first strategy makes sense; revisit after envelope direction is selected.', priority_bucket: 'WATCH_DEFER', priority_factors: {} }
                ]).map((hyp: any, idx: number) => {
                  const bucketStyles: any = {
                    FOCUS_NOW: { badge: 'bg-green-100 text-green-800', border: 'border-green-200' },
                    CAPTURE_CAUTIOUSLY: { badge: 'bg-green-100 text-green-800', border: 'border-green-200' },
                    WATCH_DEFER: { badge: 'bg-amber-100 text-amber-800', border: 'border-amber-200' }
                  };
                  const style = bucketStyles[hyp.priority_bucket] || bucketStyles.FOCUS_NOW;
                  const bucketLabel = hyp.priority_bucket === 'FOCUS_NOW' ? 'FOCUS NOW' : hyp.priority_bucket === 'CAPTURE_CAUTIOUSLY' ? 'CAPTURE, INTERPRET CAUTIOUSLY' : 'WATCH / DEFER';

                  // Clean hypothesis name: replace underscores with spaces and title case
                  const cleanName = hyp.name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

                  return (
                    <div key={idx} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 ${style.badge} text-sm font-semibold rounded`}>{bucketLabel}</div>
                      </div>

                      <div className={`p-6 bg-white border-2 ${style.border} rounded-lg space-y-4`}>
                        <h3 className="font-semibold text-lg">{cleanName}</h3>

                        {hyp.priority_bucket === 'FOCUS_NOW' ? (
                          <div className="space-y-3 text-sm">
                            <div>
                              <span className="font-medium text-neutral-700">What it is:</span>
                              <p className="text-neutral-600 mt-1">{hyp.what_it_is}</p>
                            </div>
                            <div>
                              <span className="font-medium text-neutral-700">Why now / What it could change:</span>
                              <p className="text-neutral-600 mt-1">{hyp.why_now}</p>
                            </div>
                            <div>
                              <span className="font-medium text-neutral-700">Affects these requirements:</span>
                              <p className="text-neutral-600 mt-1">{hyp.affects_requirements}</p>
                            </div>
                            <div>
                              <span className="font-medium text-neutral-700">Why test together:</span>
                              <p className="text-neutral-600 mt-1">{hyp.why_test_together}</p>
                            </div>
                            <div>
                              <span className="font-medium text-neutral-700">Potential upside:</span>
                              <p className="text-neutral-600 mt-1">{hyp.potential_upside}</p>
                            </div>
                            <div>
                              <span className="font-medium text-neutral-700">Potential downside/trade-off:</span>
                              <p className="text-neutral-600 mt-1">{hyp.potential_downside}</p>
                            </div>
                            <div>
                              <span className="font-medium text-neutral-700">What we don't know:</span>
                              <p className="text-neutral-600 mt-1">{hyp.unknown}</p>
                            </div>
                            <div>
                              <span className="font-medium text-neutral-700">What would change this priority:</span>
                              <p className="text-neutral-600 mt-1">{hyp.what_would_change_priority}</p>
                            </div>
                            {hyp.priority_factors && Object.keys(hyp.priority_factors).length > 0 && (
                              <div className="pt-3 border-t border-neutral-200">
                                <div className="font-medium text-neutral-700 mb-2">Priority factors (decision-support, not performance prediction):</div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {Object.entries(hyp.priority_factors).map(([key, value]: [string, any]) => (
                                    <div key={key} className="flex justify-between">
                                      <span className="text-neutral-600">{key.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</span>
                                      <span className="font-medium">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-neutral-600 mt-2">{hyp.what_it_is}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-neutral-500">2 interaction combinations prioritized for FOCUS NOW, three-way interaction captured for cautious interpretation. <button onClick={(e) => { e.stopPropagation(); toggleSection('earlyBrief'); }} className="text-blue-600 hover:underline">View details</button></p>
              )}
            </section>

            {/* 5. Smallest Useful Test Set */}
            <section className="space-y-4">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('testSet')}>
                <h2 className="text-2xl font-semibold">Smallest Useful Test Set</h2>
                <span className="text-neutral-400">{expandedSections.testSet ? '−' : '+'}</span>
              </div>
              {expandedSections.testSet ? (
                <>
                  <div className="text-sm font-medium mb-4 italic text-neutral-600">
                    Pilot AI framing
                  </div>
                  <p className="text-xs text-neutral-600 italic mb-4">
                    This pilot test set was designed using the prepared framing and remains unchanged.
                  </p>
                  <div className="space-y-4">
                <p className="text-neutral-700">
                  {(aiMode === 'live' && framingData?.test_set_rationale) || 'An 8-case 2×2×2 factorial study to discriminate between key hypotheses and expose main effects plus interactions:'}
                </p>

                <div className="p-4 bg-neutral-100 border border-neutral-300 rounded-lg space-y-2 text-sm font-mono">
                  <div><strong>Factor A:</strong> South window WF-1 area — Baseline (16.56 m²) vs 75% of baseline (12.42 m², centered horizontally, same height)</div>
                  <div><strong>Factor B:</strong> Main south overhang depth — Baseline (1.3m) vs Extended (2.0m)</div>
                  <div><strong>Factor C:</strong> Exterior wall insulation IN02 thickness — Baseline (0.090m) vs Increased (0.14m)</div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-neutral-200">
                        <th className="border border-neutral-300 px-3 py-2 text-left">Case</th>
                        <th className="border border-neutral-300 px-3 py-2 text-left">Window</th>
                        <th className="border border-neutral-300 px-3 py-2 text-left">Overhang</th>
                        <th className="border border-neutral-300 px-3 py-2 text-left">Insulation</th>
                        <th className="border border-neutral-300 px-3 py-2 text-left">Why included</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      <tr>
                        <td className="border border-neutral-300 px-3 py-2 font-medium">1</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Reference case — current design</td>
                      </tr>
                      <tr className="bg-neutral-50">
                        <td className="border border-neutral-300 px-3 py-2 font-medium">2</td>
                        <td className="border border-neutral-300 px-3 py-2">Reduced</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Window area main effect</td>
                      </tr>
                      <tr>
                        <td className="border border-neutral-300 px-3 py-2 font-medium">3</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Extended</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Overhang main effect</td>
                      </tr>
                      <tr className="bg-neutral-50">
                        <td className="border border-neutral-300 px-3 py-2 font-medium">4</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Increased</td>
                        <td className="border border-neutral-300 px-3 py-2">Insulation main effect</td>
                      </tr>
                      <tr>
                        <td className="border border-neutral-300 px-3 py-2 font-medium">5</td>
                        <td className="border border-neutral-300 px-3 py-2">Reduced</td>
                        <td className="border border-neutral-300 px-3 py-2">Extended</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Window × Overhang interaction</td>
                      </tr>
                      <tr className="bg-neutral-50">
                        <td className="border border-neutral-300 px-3 py-2 font-medium">6</td>
                        <td className="border border-neutral-300 px-3 py-2">Reduced</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Increased</td>
                        <td className="border border-neutral-300 px-3 py-2">Window × Insulation interaction</td>
                      </tr>
                      <tr>
                        <td className="border border-neutral-300 px-3 py-2 font-medium">7</td>
                        <td className="border border-neutral-300 px-3 py-2">Baseline</td>
                        <td className="border border-neutral-300 px-3 py-2">Extended</td>
                        <td className="border border-neutral-300 px-3 py-2">Increased</td>
                        <td className="border border-neutral-300 px-3 py-2">Overhang × Insulation interaction</td>
                      </tr>
                      <tr className="bg-neutral-50">
                        <td className="border border-neutral-300 px-3 py-2 font-medium">8</td>
                        <td className="border border-neutral-300 px-3 py-2">Reduced</td>
                        <td className="border border-neutral-300 px-3 py-2">Extended</td>
                        <td className="border border-neutral-300 px-3 py-2">Increased</td>
                        <td className="border border-neutral-300 px-3 py-2">Combined maximum intervention</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-sm text-neutral-700">
                  <strong>Why this design:</strong> 8 runs = full 2³ factorial: 3 main effects + 3 two-way interactions + 1 three-way interaction.
                  <strong>Real limits:</strong> 2 levels do not map curvature/nonlinearity; unreplicated runs lack independent pure-error estimation;
                  this is directional early-stage learning, not global optimization.
                </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-neutral-500">8-run 2³ factorial design with 3 main effects + 3 two-way + 1 three-way interaction. <button onClick={(e) => { e.stopPropagation(); toggleSection('testSet'); }} className="text-blue-600 hover:underline">View details</button></p>
              )}
            </section>

            {/* 6. Professional Challenge */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Professional Challenge</h2>
              <p className="text-sm text-neutral-600 italic mb-2">
                Pilot checkpoint — this evaluation applied to the prepared framing.
              </p>
              <p className="text-neutral-600">
                Before proceeding to evidence interpretation, evaluate the AI framing and test set.
              </p>

              {!professionalAction ? (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleProfessionalChallenge('accept')}
                      className="px-5 py-2.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleProfessionalChallenge('revise')}
                      className="px-5 py-2.5 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors font-medium"
                    >
                      Revise
                    </button>
                    <button
                      onClick={() => handleProfessionalChallenge('reject')}
                      className="px-5 py-2.5 bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors font-medium"
                    >
                      Reject
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-neutral-700">
                      Reason (optional):
                    </label>
                    <textarea
                      className="w-full h-24 px-4 py-3 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-none text-sm"
                      placeholder="Capture your reasoning..."
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-white border-2 border-green-600 rounded-md">
                  <div className="font-semibold text-green-800 mb-2">Professional correction captured.</div>
                  <div className="text-sm text-neutral-700">
                    <div><strong>Decision:</strong> {professionalAction.toUpperCase()}</div>
                    {correctionReason && (
                      <div className="mt-2"><strong>Reason:</strong> {correctionReason}</div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* 7. Real Evidence */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Real Evidence</h2>
              <p className="text-sm text-neutral-600 italic mb-3">
                Pilot evidence — these results were generated locally with EnergyPlus 26.1 from public sample inputs and bundled into the browser demo. EnergyPlus is not run on demand.
              </p>

              <div className="p-4 bg-green-50 border-2 border-green-600 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-green-800 font-semibold">✓ 8/8 validated simulations complete</span>
                </div>
                <div className="text-sm text-green-800">
                  EnergyPlus 2³ factorial study • Chicago TMY3 • Generated 2026-08-10T19:29:22
                </div>
              </div>

              <RealEvidenceSection />
            </section>

            {/* 8. Evidence-Backed Recommendation */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Evidence-Backed Recommendation</h2>
              <p className="text-sm text-neutral-600 italic mb-3">
                Pilot recommendation based on the completed evidence.
              </p>

              <div className="p-6 bg-white border-2 border-blue-600 rounded-lg space-y-4">
                <h3 className="font-semibold text-lg text-blue-900">Current Leading Direction</h3>

                <div className="space-y-4 text-sm">
                  <div>
                    <div className="font-medium text-neutral-800 mb-1">Within this model, tested ranges, and measured energy metrics:</div>
                    <p className="text-neutral-700">
                      <strong>Envelope insulation (Factor C) deserves higher investigation priority</strong> than the initial framing suggested.
                      It shows the strongest measured effect on total site energy ({(evidenceData as any).factorial_analysis.total_site_energy_GJ.effects.C.toFixed(2)} GJ, {(evidenceData as any).factorial_analysis.total_site_energy_GJ.changes_vs_baseline['C+'].percent.toFixed(2)}%)
                      and heating natural gas ({(evidenceData as any).factorial_analysis.heating_natural_gas_GJ.effects.C.toFixed(2)} GJ, {(evidenceData as any).factorial_analysis.heating_natural_gas_GJ.changes_vs_baseline['C+'].percent.toFixed(2)}%).
                    </p>
                  </div>

                  <div className="p-3 bg-green-50 border border-green-200 rounded">
                    <div className="font-medium text-green-900 mb-1">Where it performs well:</div>
                    <ul className="ml-4 list-disc text-neutral-700 space-y-0.5">
                      <li>Reduces energy across all tested combinations</li>
                      <li>Benefits heating more than cooling (annual performance)</li>
                      <li>Effect size 5-10× larger than window or overhang changes in this model</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                    <div className="font-medium text-amber-900 mb-1">What it sacrifices / What remains unknown:</div>
                    <ul className="ml-4 list-disc text-neutral-700 space-y-0.5">
                      <li>Increased wall thickness and construction complexity</li>
                      <li>Cost impact not modeled</li>
                      <li>Embodied carbon of added insulation material not assessed</li>
                      <li>Constructability and schedule impact unknown</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                    <div className="font-medium text-neutral-800 mb-1">Why glazing/shading changes ranked lower:</div>
                    <p className="text-neutral-700">
                      Window area and overhang show smaller effects, and their interaction is negligible (&lt;0.04 GJ) in the tested ranges.
                      They remain adjustable but become secondary energy questions based on this evidence.
                    </p>
                  </div>

                  <div className="p-3 bg-rose-50 border border-rose-200 rounded">
                    <div className="font-medium text-rose-900 mb-1">Remaining risks / Missing evidence:</div>
                    <ul className="ml-4 list-disc text-neutral-700 space-y-0.5">
                      <li>Daylight quality, glare, and view impacts (not modeled)</li>
                      <li>Cost and embodied carbon trade-offs</li>
                      <li>Constructability and schedule implications</li>
                      <li>Whether larger insulation increases show diminishing returns</li>
                      <li>Client acceptance of thicker wall assemblies</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="font-medium text-blue-900 mb-1">Other promising directions:</div>
                    <p className="text-neutral-700">
                      Combined strategies (AC+, ABC+) show cumulative benefits without strong negative interactions.
                      If construction complexity is acceptable, combining reduced glazing with increased insulation maintains the insulation benefit
                      while adding modest cooling gains.
                    </p>
                  </div>

                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                    <div className="font-medium text-neutral-800 mb-1">What to test next:</div>
                    <ul className="ml-4 list-disc text-neutral-700 space-y-0.5">
                      <li>Cost and embodied carbon analysis for insulation increase</li>
                      <li>Constructability review with wall assembly detailing</li>
                      <li>If insulation is feasible: larger thickness levels to map diminishing returns</li>
                      <li>Daylight simulation for AC+ combination if that direction proceeds</li>
                    </ul>
                  </div>

                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded">
                    <div className="font-medium text-neutral-800 mb-1">What would change this recommendation:</div>
                    <ul className="ml-4 list-disc text-neutral-700 space-y-0.5">
                      <li>Cost/embodied carbon analysis showing insulation is prohibitive</li>
                      <li>Constructability constraints ruling out thicker walls</li>
                      <li>Client prioritizing cooling over annual energy (favors overhang)</li>
                      <li>Daylight/glare requirements becoming primary drivers</li>
                    </ul>
                  </div>
                </div>

                <div className="pt-4 border-t-2 border-neutral-300">
                  <div className="px-4 py-2 bg-neutral-900 text-white font-semibold text-center rounded">
                    Professional Decision Required
                  </div>
                  <p className="text-xs text-neutral-600 text-center mt-2">
                    Evidence changes the priority; it does not make the project decision.
                  </p>
                </div>
              </div>
            </section>

            {/* 9. Decision Delta */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Decision Delta</h2>
              <p className="text-sm text-neutral-600 italic mb-3">
                Pilot comparison showing how evidence changed direction.
              </p>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="p-5 bg-white border border-neutral-300 rounded-lg space-y-3">
                  <h3 className="font-semibold text-neutral-900">WITHOUT AI</h3>
                  <div className="text-sm text-neutral-600">
                    {beforeAIPlan || <em className="text-neutral-400">No baseline plan captured</em>}
                  </div>
                </div>

                <div className="p-5 bg-white border border-neutral-300 rounded-lg space-y-3">
                  <h3 className="font-semibold text-neutral-900">PILOT AI FRAMING</h3>
                  <div className="text-sm text-neutral-700">
                    Glazing × shading interaction deserved first attention
                  </div>
                </div>

                <div className="p-5 bg-white border border-green-200 rounded-lg space-y-3">
                  <h3 className="font-semibold text-green-900">AFTER REAL EVIDENCE</h3>
                  <div className="text-sm text-neutral-700">
                    Greater attention to envelope insulation; façade options become secondary energy questions
                  </div>
                </div>
              </div>

              <div className="p-5 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <h3 className="font-semibold text-blue-900">Why It Changed</h3>
                <p className="text-sm text-neutral-700">
                  <strong>Evidence, not AI confidence, changed the priority.</strong> The simulation revealed that:
                </p>
                <ul className="text-sm text-neutral-700 ml-6 list-disc space-y-1">
                  <li>Expected glazing × shading interaction was weak (&lt;0.04 GJ in tested ranges)</li>
                  <li>Insulation had the strongest measured energy effect (5-10× larger than window/overhang changes)</li>
                  <li>Initial AI framing was challenged by simulation results</li>
                </ul>
                <p className="text-sm text-neutral-700 mt-3">
                  Primary question: <strong>Did AI make the search and decision process smarter?</strong> — not "Was AI right?"
                </p>
                <div className="text-sm text-neutral-600 space-y-1 mt-3">
                  <div className="font-medium text-neutral-700 mb-2">Measure usefulness by whether the workflow:</div>
                  <ul className="ml-4 space-y-1 list-disc">
                    <li>✓ Surfaced a material missed issue — insulation was underweighted in initial framing</li>
                    <li>✓ Exposed an unsupported assumption — interaction importance was overestimated</li>
                    <li>✓ Found a single-variable conclusion that mattered more than combinations</li>
                    <li>Redirected effort to a more informative test — tested design remains useful</li>
                    <li>Clarified a client-value trade-off — energy vs cost/complexity now explicit</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 10. Practice Signals */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Practice Signals</h2>
              <p className="text-sm text-neutral-600">
                Behavioral feedback for workflow improvement, not employee profiling.
              </p>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-neutral-700">
                Demo practice signals stay in this browser. Clear anytime.
                <button
                  onClick={clearPracticeSignals}
                  className="ml-3 px-3 py-1 bg-white border border-amber-300 rounded text-xs hover:bg-amber-100 transition-colors"
                >
                  Clear Signals
                </button>
              </div>

              {practiceSignals.length > 0 ? (
                <div className="space-y-4">
                  <div className="p-5 bg-white border border-neutral-300 rounded-lg space-y-4">
                    <h3 className="font-semibold">What this workflow learned</h3>

                    <div className="space-y-3 text-sm">
                      {(professionalAction || practiceSignals.filter(s => s.action === 'changed_priority').length > 0) ? (
                        <div>
                          <div className="font-medium text-neutral-700 mb-1">From your feedback:</div>
                          <ul className="ml-4 space-y-1 list-disc text-neutral-600">
                            {professionalAction && (
                              <li>Professional {professionalAction}ed the AI framing{correctionReason && `: "${correctionReason}"`}</li>
                            )}
                            {practiceSignals.filter(s => s.action === 'changed_priority').length > 0 && (
                              <li>Adjusted {practiceSignals.filter(s => s.action === 'changed_priority').length} priority level(s)</li>
                            )}
                          </ul>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-neutral-700 mb-1">From your feedback:</div>
                          <p className="text-neutral-500 italic text-sm ml-4">No professional corrections recorded in this session.</p>
                        </div>
                      )}

                      <div>
                        <div className="font-medium text-neutral-700 mb-1">From your actions:</div>
                        {(practiceSignals.some(s => s.action === 'captured_before_ai_plan') || practiceSignals.some(s => s.action === 'loaded_project')) ? (
                          <ul className="ml-4 space-y-1 list-disc text-neutral-600">
                            {practiceSignals.some(s => s.action === 'captured_before_ai_plan') && (
                              <li>Documented baseline approach before viewing AI output</li>
                            )}
                            {practiceSignals.some(s => s.action === 'loaded_project') && (
                              <li>Loaded sample project</li>
                            )}
                          </ul>
                        ) : (
                          <p className="text-neutral-500 italic text-sm ml-4">Not enough behavioral evidence yet to infer a stable work pattern.</p>
                        )}
                      </div>

                      <div>
                        <div className="font-medium text-neutral-700 mb-1">For the next iteration:</div>
                        {practiceSignals.filter(s =>
                          s.action === 'professional_challenge' ||
                          s.action === 'changed_priority' ||
                          s.action === 'captured_before_ai_plan'
                        ).length > 0 ? (
                          <ul className="ml-4 space-y-1 list-disc text-neutral-600">
                            <li>Confirm what is still changeable before proposing tests</li>
                            <li>Surface interaction hypotheses earlier in the decision map</li>
                            <li>Ask whether evidence exists before proposing new analysis</li>
                          </ul>
                        ) : (
                          <p className="text-neutral-500 italic text-sm ml-4">Not enough behavioral evidence yet to infer a stable work pattern.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-md text-xs text-neutral-600">
                    <div className="font-medium mb-2">Recorded signals ({practiceSignals.length}):</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {practiceSignals.map((sig, i) => {
                        const labelMap: {[key: string]: string} = {
                          loaded_project: 'Loaded sample project',
                          captured_before_ai_plan: 'Documented baseline approach',
                          changed_priority: 'Adjusted a priority level',
                          professional_challenge: `Professional ${sig.decision || ''} framing`,
                          live_ai_framing_run: 'Ran live AI framing',
                          live_ai_framing_failed: 'Live AI framing failed',
                          live_ai_framing_error: 'Live AI framing error',
                          live_ai_framing_cached: 'Loaded cached live framing',
                        };
                        const label = labelMap[sig.action] || sig.action.replace(/_/g, ' ');
                        return <div key={i}>{label}</div>;
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-neutral-500 bg-white border border-neutral-200 rounded-lg">
                  No practice signals recorded yet. Interact with the workflow to generate feedback.
                </div>
              )}
            </section>

            {/* 11. Draft Practice Card */}
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">Draft Practice Card</h2>

              <div className="p-6 bg-white border-2 border-neutral-300 rounded-lg space-y-4">
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">When this pattern is useful:</div>
                    <p className="text-neutral-600">
                      Early-stage façade/envelope decisions with multiple adjustable variables, explicit client constraints,
                      and uncertainty about which interactions matter
                    </p>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">Minimum inputs:</div>
                    <ul className="ml-4 list-disc text-neutral-600 space-y-0.5">
                      <li>Baseline energy model (IDF or equivalent)</li>
                      <li>Climate context (weather file)</li>
                      <li>Client requirements and hard constraints</li>
                      <li>Decision at stake</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">What evidence is required:</div>
                    <p className="text-neutral-600">
                      Actual simulation results from trusted performance tools (EnergyPlus or equivalent).
                      AI cannot invent performance numbers.
                    </p>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">Common interactions/risks observed in THIS sample only:</div>
                    <ul className="ml-4 list-disc text-neutral-600 space-y-0.5">
                      <li>Expected glazing × shading interaction was weak in tested ranges (&lt;0.04 GJ)</li>
                      <li>Insulation had the strongest measured energy effect (not initially prioritized)</li>
                      <li>Initial AI framing was challenged by simulation — evidence shifted the priority</li>
                      <li>Do not generalize this project result into a universal building-performance rule</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">Where AI was corrected:</div>
                    <p className="text-neutral-600">
                      {professionalAction
                        ? `Professional ${professionalAction}ed the AI framing${correctionReason ? `: ${correctionReason}` : ''}`
                        : <em className="text-neutral-400">No corrections recorded yet</em>
                      }
                    </p>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">What must remain professional judgment:</div>
                    <ul className="ml-4 list-disc text-neutral-600 space-y-0.5">
                      <li>Final design decision and trade-off acceptance</li>
                      <li>Client value priorities when metrics conflict</li>
                      <li>Aesthetic, cultural, and experiential factors not modeled</li>
                      <li>When evidence is sufficient vs when further analysis is needed</li>
                      <li>Construction feasibility and cost acceptance</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-neutral-200">
                  <button className="px-5 py-2 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors text-sm font-medium">
                    Approve for team learning
                  </button>
                  <button className="px-5 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-md hover:bg-neutral-50 transition-colors text-sm font-medium">
                    Keep project-only
                  </button>
                </div>
              </div>
            </section>

            {/* Production Path Footer */}
            <section className="pt-8 border-t border-neutral-300">
              <h3 className="text-lg font-semibold mb-3">Production Path</h3>
              <div className="p-5 bg-neutral-100 border border-neutral-300 rounded-md text-sm text-neutral-700 space-y-3">
                <p>
                  A real internal deployment could replace manual sample loading with <strong>permission-aware retrieval</strong> from
                  existing project systems, scoped to each user's existing access and project context.
                </p>
                <p>
                  Technical requirements: approved enterprise model endpoints, isolated processing, auditability,
                  and human approval before write-back to project systems.
                </p>
                <p className="text-xs text-neutral-600 pt-2 border-t border-neutral-300">
                  Public demo: no client information; sample data only. Sandbox alone does not guarantee privacy.
                </p>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
