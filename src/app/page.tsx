'use client';

import { useState, useEffect, useRef } from 'react';
import RealEvidenceSection from './components/RealEvidenceSection';
import evidenceData from '../../data/evidence.json';
import {
  normalizeProvenance,
  PROVENANCE_LABELS,
  ProvenanceType,
  ProfessionalAction,
  PROFESSIONAL_ACTION_LABELS,
  PRACTICE_SIGNAL_LABELS,
  PracticeSignalAction,
  LIVE_FRAMING_CACHE_KEY,
  LIVE_FRAMING_CACHE_INPUTS_KEY
} from './lib/types';
import { isValidLiveFramingStructure } from './lib/validation';
import { PREPARED_PILOT } from './lib/preparedPilot';
import { stagedFraming } from './lib/stagedContent';

// Reviewer never waits longer than this for a fresh Live AI result.
const LIVE_AI_TIMEOUT_MS = 10000;

async function fetchLiveFraming(): Promise<any> {
  const response = await fetch('/api/ai/framing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientBrief: 'Chicago Office Performance Study - deciding which early façade/envelope adjustments are worth developing',
      modelFacts: 'Five-zone office, south window WF-1 16.56m², overhang 1.3m, wall insulation IN02 90mm',
      decisionContext: 'Retain at least 70% of baseline south-window area (baseline 16.56 m², minimum 11.59 m²), reduce cooling energy, avoid major HVAC redesign, understand interactions'
    })
  });
  return response.json();
}

// Resolve with { timedOut: true } if `promise` hasn't settled within `ms`, otherwise
// with the settled outcome. Never rejects — used to enforce the 10-second fail-safe
// without ever leaving the reviewer waiting on an unbounded spinner.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; result?: T; error?: any }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve({ timedOut: true }); }
    }, ms);
    promise.then((result) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ timedOut: false, result }); }
    }).catch((error) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve({ timedOut: false, error }); }
    });
  });
}

function Tag({ type, source }: { type: ProvenanceType; source?: string }) {
  const styles: Record<ProvenanceType, string> = {
    source: 'bg-blue-50 text-blue-700 border-blue-200',
    inference: 'bg-amber-50 text-amber-700 border-amber-200',
    assumption: 'bg-purple-50 text-purple-700 border-purple-200',
    'domain-knowledge': 'bg-teal-50 text-teal-700 border-teal-200',
    'needs-evidence': 'bg-rose-50 text-rose-700 border-rose-200',
    'needs-review': 'bg-neutral-100 text-neutral-600 border-neutral-300'
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-block px-2 py-0.5 text-xs font-medium border rounded ${styles[type]}`}>
        {PROVENANCE_LABELS[type]}
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
  const [professionalAction, setProfessionalAction] = useState<ProfessionalAction | null>(null);
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
  const [expandedEarlyBriefCards, setExpandedEarlyBriefCards] = useState<{[key: number]: boolean}>({});
  const [practiceCardApprovalState, setPracticeCardApprovalState] = useState<'approved' | 'kept' | null>(null);

  // Background prefetch bookkeeping. Keyed to the actual project inputs + professional
  // baseline (beforeAIPlan) so a changed input can never serve a stale fresh result.
  const pendingLiveFramingRef = useRef<{ key: string; promise: Promise<any>; startedAt: number } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('practice-signals');
    if (saved) {
      setPracticeSignals(JSON.parse(saved));
    }
  }, []);

  // Changing the professional baseline (beforeAIPlan) after the project is loaded must
  // invalidate any stale cached/prefetched fresh result and start a new background
  // prefetch keyed to the updated inputs, so a later Run Live AI press never serves a
  // result generated against the old baseline. Debounced so active typing doesn't fire
  // a request per keystroke.
  useEffect(() => {
    if (!projectLoaded) return;
    const cacheKey = computeFramingCacheKey();
    const cachedInputsKey = sessionStorage.getItem(LIVE_FRAMING_CACHE_INPUTS_KEY);
    if (cachedInputsKey !== null && cachedInputsKey !== cacheKey) {
      sessionStorage.removeItem(LIVE_FRAMING_CACHE_KEY);
      sessionStorage.removeItem(LIVE_FRAMING_CACHE_INPUTS_KEY);
      if (aiMode === 'live') {
        setAiMode('prepared');
        setFramingData(null);
      }
    }
    const debounce = setTimeout(() => {
      if (pendingLiveFramingRef.current?.key !== cacheKey) {
        startBackgroundLiveFraming(cacheKey);
      }
    }, 400);
    return () => clearTimeout(debounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectLoaded, beforeAIPlan]);

  const savePracticeSignal = (signal: any) => {
    // Dedupe: professional_challenge by decision + normalized reason
    if (signal.action === 'professional_challenge') {
      const isDupe = practiceSignals.some(s =>
        s.action === 'professional_challenge' &&
        s.decision === signal.decision &&
        (s.reason || '').trim().toLowerCase() === (signal.reason || '').trim().toLowerCase()
      );
      if (isDupe) return;
    } else {
      // Other signals: dedupe by action + detail
      const isDuplicate = practiceSignals.some(
        s => s.action === signal.action && JSON.stringify(s.detail) === JSON.stringify(signal.detail)
      );
      if (isDuplicate) return;
    }

    const updated = [...practiceSignals, { ...signal, timestamp: new Date().toISOString() }];
    setPracticeSignals(updated);
    localStorage.setItem('practice-signals', JSON.stringify(updated));
  };

  const clearPracticeSignals = () => {
    setPracticeSignals([]);
    localStorage.removeItem('practice-signals');
    // Do NOT clear professionalAction or correctionReason - those are current session state
  };

  // Cache/prefetch key: derived from the actual current project inputs + professional
  // baseline (beforeAIPlan). The sample project's canonical inputs are fixed, so the
  // baseline plan text is the one input that can legitimately vary between runs —
  // changing it must invalidate any pending/cached fresh result.
  const computeFramingCacheKey = () => JSON.stringify({ project: 'sample_chicago_office', baseline: beforeAIPlan.trim() });

  const startBackgroundLiveFraming = (key: string) => {
    if (pendingLiveFramingRef.current?.key === key) return; // already pending for this key
    const promise = fetchLiveFraming();
    pendingLiveFramingRef.current = { key, promise, startedAt: Date.now() };

    // Opportunistically cache a valid result as soon as it lands, even if the
    // reviewer hasn't pressed Run Live AI yet (or the visible call already timed
    // out) — so a later Run Live AI press can serve it immediately from cache.
    promise.then((result) => {
      if (result?.success && isValidLiveFramingStructure(result.data)) {
        sessionStorage.setItem(LIVE_FRAMING_CACHE_KEY, JSON.stringify(result.data));
        sessionStorage.setItem(LIVE_FRAMING_CACHE_INPUTS_KEY, key);
      }
    }).catch(() => {
      // Swallow: the visible Run Live AI path (or a future one) handles user-facing failure.
    }).finally(() => {
      // Only clear if no newer request has replaced this one.
      if (pendingLiveFramingRef.current?.key === key && pendingLiveFramingRef.current.promise === promise) {
        pendingLiveFramingRef.current = null;
      }
    });
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

    const cacheKey = computeFramingCacheKey();

    // Check for cached live AI framing (versioned key only), keyed to current inputs.
    // Discard any legacy unversioned 'live-ai-framing' cache silently
    sessionStorage.removeItem('live-ai-framing');
    const cachedFraming = sessionStorage.getItem(LIVE_FRAMING_CACHE_KEY);
    const cachedInputsKey = sessionStorage.getItem(LIVE_FRAMING_CACHE_INPUTS_KEY);
    let servedFromCache = false;
    if (cachedFraming && cachedInputsKey === cacheKey) {
      try {
        const parsed = JSON.parse(cachedFraming);
        // Every cached payload must pass structural validation before entering live mode
        if (isValidLiveFramingStructure(parsed)) {
          setFramingData(parsed);
          setAiMode('live');
          savePracticeSignal({ action: 'live_ai_framing_cached' });
          servedFromCache = true;
        } else {
          // Malformed or stale cache: discard and stay in prepared mode
          sessionStorage.removeItem(LIVE_FRAMING_CACHE_KEY);
          sessionStorage.removeItem(LIVE_FRAMING_CACHE_INPUTS_KEY);
          console.warn('[Cache] Stale/invalid live framing cache discarded');
        }
      } catch {
        sessionStorage.removeItem(LIVE_FRAMING_CACHE_KEY);
        sessionStorage.removeItem(LIVE_FRAMING_CACHE_INPUTS_KEY);
        console.warn('[Cache] Corrupt live framing cache discarded');
      }
    } else if (cachedFraming) {
      // Cache exists but for different inputs/baseline — stale, discard.
      sessionStorage.removeItem(LIVE_FRAMING_CACHE_KEY);
      sessionStorage.removeItem(LIVE_FRAMING_CACHE_INPUTS_KEY);
    }

    // Prepared AI stays visible immediately regardless; kick off fresh Live AI in the
    // background now that inputs are known, so Run Live AI can show it instantly later.
    if (!servedFromCache) {
      startBackgroundLiveFraming(cacheKey);
    }
  };

  const runLiveAI = async () => {
    setAiMode('analyzing');
    setLiveAiFailureMessage(false);
    const startTime = Date.now();
    const cacheKey = computeFramingCacheKey();

    // If a prefetch already finished and landed in cache for these exact inputs,
    // show it immediately — no wait at all.
    const cachedFraming = sessionStorage.getItem(LIVE_FRAMING_CACHE_KEY);
    const cachedInputsKey = sessionStorage.getItem(LIVE_FRAMING_CACHE_INPUTS_KEY);
    if (cachedFraming && cachedInputsKey === cacheKey) {
      try {
        const parsed = JSON.parse(cachedFraming);
        if (isValidLiveFramingStructure(parsed)) {
          const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
          setFramingData(parsed);
          setAiMode('live');
          setLiveAiFailureMessage(false);
          savePracticeSignal({ action: 'live_ai_framing_cached', duration_seconds: durationSeconds });
          console.log('[Live AI] Served prefetched result instantly');
          return;
        }
      } catch {
        // fall through to live/pending path
      }
    }

    // Reuse the in-flight/prefetched request only if it was started for the SAME
    // inputs + professional baseline; otherwise a changed baseline would silently
    // reuse a stale result. If nothing is pending (e.g. prefetch hadn't started, or
    // already settled and was cleared), start one now via the same helper so its
    // result is cached identically whether prefetched or triggered by this click.
    if (pendingLiveFramingRef.current?.key !== cacheKey) {
      startBackgroundLiveFraming(cacheKey);
    }
    const pending = pendingLiveFramingRef.current!;

    // Never wait longer than ~10s for the visible Run Live AI interaction itself,
    // measured from this click — not from whenever the background prefetch happened
    // to start. The prefetch may have been running for several seconds already (e.g.
    // while the reviewer was reading the loaded project); none of that lead time
    // should be deducted from the click's own budget, or a request that's genuinely
    // about to succeed gets discarded as a false timeout.
    try {
      const outcome = await withTimeout(pending.promise, LIVE_AI_TIMEOUT_MS);
      const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

      if (outcome.timedOut) {
        // Fresh AI still unfinished after the fail-safe window: keep prepared framing
        // visible, never expose partial/unvalidated output, never blank the page.
        setAiMode('prepared');
        setLiveAiFailureMessage(true);
        savePracticeSignal({ action: 'live_ai_framing_failed', error: 'timeout', duration_seconds: durationSeconds });
        console.log(`[Live AI] Timed out after ${durationSeconds}s (still running in background)`);
        return;
      }

      if (outcome.error) {
        throw outcome.error;
      }

      const result = outcome.result;
      // Guard against the prefetch resolving after the user has since changed inputs.
      if (pendingLiveFramingRef.current?.key !== cacheKey) {
        setAiMode('prepared');
        return;
      }

      if (result.success && isValidLiveFramingStructure(result.data)) {
        setFramingData(result.data);
        setAiMode('live');
        setLiveAiFailureMessage(false);
        sessionStorage.setItem(LIVE_FRAMING_CACHE_KEY, JSON.stringify(result.data));
        sessionStorage.setItem(LIVE_FRAMING_CACHE_INPUTS_KEY, cacheKey);
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
    // Note: pendingLiveFramingRef is cleared by the prefetch's own settlement handler
    // in startBackgroundLiveFraming, not here — a timeout here must not stop the
    // in-flight request from still landing in cache for a later Run Live AI press.
  };

  const toggleSection = (section: string) => {
    setExpandedSections({ ...expandedSections, [section]: !expandedSections[section] });
  };

  const handleProfessionalChallenge = (action: ProfessionalAction) => {
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
                      <span className="text-xs text-blue-600 italic">Checking for fresh AI analysis (up to ~10s)...</span>
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
                        {(() => {
                          const cd = aiMode === 'live'
                            ? framingData?.decision_framing?.current_decision
                            : stagedFraming.decision_framing.current_decision;
                          return (
                            <>
                              <Tag
                                type={normalizeProvenance(cd?.source_type || 'source')}
                                source={cd?.source}
                              />
                              <p className="text-neutral-700 mt-2">{cd?.claim}</p>
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Relevant project goals</h3>
                      <div className="space-y-2">
                        {toArr(
                          aiMode === 'live' ? framingData?.decision_framing?.relevant_goals : null,
                          stagedFraming.decision_framing.relevant_goals
                        ).map((goal: any, i: number) => (
                          <div key={i} className="p-3 bg-white border border-neutral-200 rounded-md">
                            <Tag type={normalizeProvenance(goal.source_type)} source={goal.source} />
                            <p className="text-sm text-neutral-700 mt-1">{goal.claim}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Plausible performance drivers</h3>
                      <div className="space-y-2">
                        {toArr(
                          aiMode === 'live' ? framingData?.candidate_drivers : null,
                          stagedFraming.candidate_drivers
                        ).map((driver: any, i: number) => (
                          <div key={i} className="p-3 bg-white border border-neutral-200 rounded-md">
                            <Tag type={normalizeProvenance(driver.source_type)} source={driver.source} />
                            <p className="text-sm text-neutral-700 mt-1">{driver.claim}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Hidden assumptions</h3>
                      <div className="space-y-2">
                        {toArr(
                          aiMode === 'live' ? framingData?.hidden_assumptions : null,
                          [
                            { claim: 'That cooling energy is the dominant challenge — heating and shoulder-season performance matter too', source_type: 'INFERENCE' },
                            { claim: 'That single-variable findings predict combined-variable outcomes', source_type: 'INFERENCE' }
                          ]
                        ).map((assumption: any, i: number) => (
                          <div key={i} className="p-3 bg-white border border-neutral-200 rounded-md">
                            <Tag type={normalizeProvenance(assumption.source_type)} source={assumption.source} />
                            <p className="text-sm text-neutral-700 mt-1">{assumption.claim}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="font-semibold">Missing evidence</h3>
                      <div className="space-y-2">
                        {toArr(
                          aiMode === 'live' ? framingData?.missing_evidence : null,
                          [
                            'Actual performance impact of each measure individually and in combination',
                            'Whether interaction effects are large enough to change the recommendation',
                            'Daylight quality, glare, and view impacts (not modeled in this sample)'
                          ]
                        ).map((evidence: string, i: number) => (
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
                {toArr(
                  aiMode === 'live' ? framingData?.prioritized_hypotheses : null,
                  stagedFraming.prioritized_hypotheses
                ).map((hyp: any, idx: number) => {
                  const bucketStyles: any = {
                    FOCUS_NOW: { badge: 'bg-green-100 text-green-800', border: 'border-green-200' },
                    CAPTURE_CAUTIOUSLY: { badge: 'bg-green-100 text-green-800', border: 'border-green-200' },
                    WATCH_DEFER: { badge: 'bg-amber-100 text-amber-800', border: 'border-amber-200' }
                  };
                  const style = bucketStyles[hyp.priority_bucket] || bucketStyles.FOCUS_NOW;
                  const bucketLabel = hyp.priority_bucket === 'FOCUS_NOW' ? 'FOCUS NOW' : hyp.priority_bucket === 'CAPTURE_CAUTIOUSLY' ? 'CAPTURE, INTERPRET CAUTIOUSLY' : 'WATCH / DEFER';

                  const cleanName = hyp.name;
                  const isExpanded = expandedEarlyBriefCards[idx] || false;

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
                              <span className="font-medium text-neutral-700">Key unknown / Evidence needed:</span>
                              <p className="text-neutral-600 mt-1">{hyp.unknown}</p>
                            </div>

                            {!isExpanded && (
                              <button
                                onClick={() => setExpandedEarlyBriefCards({ ...expandedEarlyBriefCards, [idx]: true })}
                                className="text-sm text-blue-600 hover:underline"
                              >
                                View full reasoning
                              </button>
                            )}

                            {isExpanded && (
                              <>
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
                                <button
                                  onClick={() => setExpandedEarlyBriefCards({ ...expandedEarlyBriefCards, [idx]: false })}
                                  className="text-sm text-blue-600 hover:underline"
                                >
                                  Collapse full reasoning
                                </button>
                              </>
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
                    Completed pilot test set
                  </div>
                  <p className="text-xs text-neutral-600 italic mb-4">
                    This pilot test set was designed using the prepared framing and remains unchanged.
                  </p>
                  <div className="space-y-4">
                <p className="text-neutral-700">
                  {PREPARED_PILOT.test_set.rationale}
                </p>

                <div className="p-4 bg-neutral-100 border border-neutral-300 rounded-lg space-y-2 text-sm font-mono">
                  <div><strong>Factor A:</strong> {PREPARED_PILOT.test_set.factors.A.display} — {PREPARED_PILOT.test_set.factors.A.baseline} vs {PREPARED_PILOT.test_set.factors.A.modified}</div>
                  <div><strong>Factor B:</strong> {PREPARED_PILOT.test_set.factors.B.display} — {PREPARED_PILOT.test_set.factors.B.baseline} vs {PREPARED_PILOT.test_set.factors.B.modified}</div>
                  <div><strong>Factor C:</strong> {PREPARED_PILOT.test_set.factors.C.display} — {PREPARED_PILOT.test_set.factors.C.baseline} vs {PREPARED_PILOT.test_set.factors.C.modified}</div>
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
                      {PREPARED_PILOT.test_set.cases.map((c, i) => (
                        <tr key={c.id} className={i % 2 === 0 ? '' : 'bg-neutral-50'}>
                          <td className="border border-neutral-300 px-3 py-2 font-medium">{c.id}</td>
                          <td className="border border-neutral-300 px-3 py-2">{c.A}</td>
                          <td className="border border-neutral-300 px-3 py-2">{c.B}</td>
                          <td className="border border-neutral-300 px-3 py-2">{c.C}</td>
                          <td className="border border-neutral-300 px-3 py-2">{c.why}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-sm text-neutral-700">
                  <strong>Why this design:</strong> {PREPARED_PILOT.test_set.design_note}
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
                {PREPARED_PILOT.professional_challenge.context}
              </p>
              <p className="text-neutral-600">
                {PREPARED_PILOT.professional_challenge.prompt}
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
                  <div className="font-semibold text-green-800 mb-2">Professional review captured.</div>
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
                {PREPARED_PILOT.evidence_metadata.note}
              </p>

              <div className="p-4 bg-green-50 border-2 border-green-600 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-green-800 font-semibold">{PREPARED_PILOT.evidence_metadata.status_badge}</span>
                </div>
                <div className="text-sm text-green-800">
                  {PREPARED_PILOT.evidence_metadata.status_detail}
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
                    <div className="font-medium text-neutral-800 mb-1">Why Window Area and Overhang Depth ranked lower:</div>
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
                {PREPARED_PILOT.decision_delta.note}
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
                    {PREPARED_PILOT.decision_delta.pilot_ai_framing}
                  </div>
                </div>

                <div className="p-5 bg-white border border-green-200 rounded-lg space-y-3">
                  <h3 className="font-semibold text-green-900">AFTER REAL EVIDENCE</h3>
                  <div className="text-sm text-neutral-700">
                    {PREPARED_PILOT.decision_delta.after_evidence}
                  </div>
                </div>
              </div>

              <div className="p-5 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <h3 className="font-semibold text-blue-900">Why It Changed</h3>
                <p className="text-sm text-neutral-700">
                  <strong>{PREPARED_PILOT.decision_delta.why_changed.headline}</strong> The simulation revealed that:
                </p>
                <ul className="text-sm text-neutral-700 ml-6 list-disc space-y-1">
                  {PREPARED_PILOT.decision_delta.why_changed.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
                <p className="text-sm text-neutral-700 mt-3">
                  Primary question: <strong>{PREPARED_PILOT.decision_delta.why_changed.primary_question}</strong>
                </p>
                <div className="text-sm text-neutral-600 space-y-1 mt-3">
                  <div className="font-medium text-neutral-700 mb-2">Measure usefulness by whether the workflow:</div>
                  <ul className="ml-4 space-y-1 list-disc">
                    {PREPARED_PILOT.decision_delta.why_changed.usefulness_criteria.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
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
                      {professionalAction ? (
                        <div>
                          <div className="font-medium text-neutral-700 mb-1">From your feedback:</div>
                          <ul className="ml-4 space-y-1 list-disc text-neutral-600">
                            <li>Professional {PROFESSIONAL_ACTION_LABELS[professionalAction]} the AI framing{correctionReason && `: "${correctionReason}"`}</li>
                            {practiceSignals.filter(s => s.action === 'changed_priority').length > 0 && (
                              <li>Adjusted {practiceSignals.filter(s => s.action === 'changed_priority').length} priority level(s)</li>
                            )}
                          </ul>
                        </div>
                      ) : null}

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
                          <p className="text-neutral-500 italic text-sm ml-4">Not enough behavioral evidence yet to infer a reusable practice pattern.</p>
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
                          <p className="text-neutral-500 italic text-sm ml-4">Not enough behavioral evidence yet to infer a reusable practice pattern.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-md text-xs text-neutral-600">
                    <div className="font-medium mb-2">Recorded signals ({practiceSignals.length}):</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {practiceSignals.map((sig, i) => {
                        const action = sig.action as PracticeSignalAction;
                        let label = PRACTICE_SIGNAL_LABELS[action] || sig.action.replace(/_/g, ' ');
                        if (action === 'professional_challenge' && sig.decision) {
                          label = `Professional ${sig.decision} framing`;
                        }
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
                    <div className="font-semibold text-neutral-800 mb-1">{PREPARED_PILOT.practice_card.heading}</div>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">When this pattern is useful:</div>
                    <p className="text-neutral-600">
                      {PREPARED_PILOT.practice_card.when_useful}
                    </p>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">Minimum inputs:</div>
                    <ul className="ml-4 list-disc text-neutral-600 space-y-0.5">
                      {PREPARED_PILOT.practice_card.minimum_inputs.map((input, i) => (
                        <li key={i}>{input}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">What evidence is required:</div>
                    <p className="text-neutral-600">
                      {PREPARED_PILOT.practice_card.evidence_required}
                    </p>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">Common interactions/risks observed in THIS sample only:</div>
                    <ul className="ml-4 list-disc text-neutral-600 space-y-0.5">
                      {PREPARED_PILOT.practice_card.observations_this_sample.map((obs, i) => (
                        <li key={i}>{obs}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">Professional review of AI framing:</div>
                    <p className="text-neutral-600">
                      {professionalAction
                        ? `Professional ${PROFESSIONAL_ACTION_LABELS[professionalAction]} the AI framing${correctionReason ? `: ${correctionReason}` : ''}`
                        : <em className="text-neutral-400">No professional review recorded in this session.</em>
                      }
                    </p>
                  </div>

                  <div>
                    <div className="font-semibold text-neutral-800 mb-1">What must remain professional judgment:</div>
                    <ul className="ml-4 list-disc text-neutral-600 space-y-0.5">
                      {PREPARED_PILOT.practice_card.professional_judgment.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-neutral-200">
                  {practiceCardApprovalState === null ? (
                    <>
                      <button
                        onClick={() => setPracticeCardApprovalState('approved')}
                        className="px-5 py-2 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors text-sm font-medium"
                      >
                        Approve for team learning
                      </button>
                      <button
                        onClick={() => setPracticeCardApprovalState('kept')}
                        className="px-5 py-2 bg-white border border-neutral-300 text-neutral-700 rounded-md hover:bg-neutral-50 transition-colors text-sm font-medium"
                      >
                        Keep project-only
                      </button>
                    </>
                  ) : (
                    <div className="text-sm text-neutral-700">
                      {practiceCardApprovalState === 'approved' && '✓ Approved for team learning — demo only.'}
                      {practiceCardApprovalState === 'kept' && '✓ Kept project-only — demo only.'}
                    </div>
                  )}
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
