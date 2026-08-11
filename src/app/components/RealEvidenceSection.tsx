'use client';

import { useState } from 'react';
import evidenceData from '../../../data/evidence.json';

export default function RealEvidenceSection() {
  const [expandedMetric, setExpandedMetric] = useState<string | null>('total_site_energy_GJ');
  const [showAllCases, setShowAllCases] = useState(false);

  const evidence = evidenceData as any;
  const baseline = evidence.raw_results[0];

  return (
    <div className="space-y-6">
      {/* Key Evidence Reversal */}
      <div className="p-6 bg-amber-50 border-2 border-amber-500 rounded-lg space-y-4">
        <h3 className="font-semibold text-lg text-amber-900">Evidence Reversal</h3>
        <p className="text-xs text-neutral-600 italic">
          The evidence below evaluates the prepared pilot framing used to design this 8-case study.
        </p>

        <div className="space-y-3 text-sm">
          <div className="p-3 bg-white rounded border border-amber-300">
            <div className="font-medium text-neutral-800 mb-1">PILOT FRAMING:</div>
            <p className="text-neutral-700">
              Window area × overhang interaction deserved first attention.
            </p>
          </div>

          <div className="p-3 bg-white rounded border border-amber-300">
            <div className="font-medium text-neutral-800 mb-1">REAL EVIDENCE:</div>
            <ul className="space-y-1 text-neutral-700 ml-4 list-disc">
              <li>
                <strong>Interactions are negligible</strong> in tested ranges:
                AB (window × overhang) = {evidence.factorial_analysis.total_site_energy_GJ.effects.AB.toFixed(3)} GJ,
                AC (window × insulation) = {evidence.factorial_analysis.total_site_energy_GJ.effects.AC.toFixed(3)} GJ,
                BC (overhang × insulation) = {evidence.factorial_analysis.total_site_energy_GJ.effects.BC.toFixed(3)} GJ
                (all &lt;0.04 GJ)
              </li>
              <li>
                <strong>Factor C (wall insulation thickness)</strong> is the strongest measured energy lever
              </li>
              <li>
                Total site energy effect: {evidence.factorial_analysis.total_site_energy_GJ.effects.C.toFixed(2)} GJ
                ({evidence.factorial_analysis.total_site_energy_GJ.changes_vs_baseline['C+'].percent.toFixed(2)}%)
              </li>
              <li>
                Heating natural gas effect: {evidence.factorial_analysis.heating_natural_gas_GJ.effects.C.toFixed(2)} GJ
                ({evidence.factorial_analysis.heating_natural_gas_GJ.changes_vs_baseline['C+'].percent.toFixed(2)}%)
              </li>
            </ul>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="p-3 bg-green-50 rounded border border-green-300">
              <div className="font-medium text-green-900 mb-1 text-xs">SUPPORTED</div>
              <p className="text-xs text-neutral-700">Three factors are independently adjustable and testable</p>
            </div>
            <div className="p-3 bg-rose-50 rounded border border-rose-300">
              <div className="font-medium text-rose-900 mb-1 text-xs">CHALLENGED</div>
              <p className="text-xs text-neutral-700">Expected glazing × shading interaction was weak; insulation dominates</p>
            </div>
            <div className="p-3 bg-blue-50 rounded border border-blue-300">
              <div className="font-medium text-blue-900 mb-1 text-xs">NEW PRIORITY</div>
              <p className="text-xs text-neutral-700">Envelope insulation deserves higher investigation priority than initial framing suggested</p>
            </div>
            <div className="p-3 bg-neutral-50 rounded border border-neutral-300">
              <div className="font-medium text-neutral-700 mb-1 text-xs">STILL UNKNOWN</div>
              <p className="text-xs text-neutral-600">Daylight, glare, views, cost, embodied carbon, constructability</p>
            </div>
          </div>
        </div>
      </div>

      {/* 8-Case Comparison */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">8-Case Comparison (Total Site Energy)</h3>
          <button
            onClick={() => setShowAllCases(!showAllCases)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showAllCases ? 'Show summary' : 'Show all cases'}
          </button>
        </div>

        {showAllCases ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse bg-white">
              <thead>
                <tr className="bg-neutral-200">
                  <th className="border border-neutral-300 px-3 py-2 text-left">Case</th>
                  <th className="border border-neutral-300 px-3 py-2 text-center">A</th>
                  <th className="border border-neutral-300 px-3 py-2 text-center">B</th>
                  <th className="border border-neutral-300 px-3 py-2 text-center">C</th>
                  <th className="border border-neutral-300 px-3 py-2 text-right">Total Site Energy (GJ)</th>
                  <th className="border border-neutral-300 px-3 py-2 text-right">vs Baseline</th>
                </tr>
              </thead>
              <tbody>
                {evidence.raw_results.map((result: any) => {
                  const change = evidence.factorial_analysis.total_site_energy_GJ.changes_vs_baseline[result.case_name];
                  return (
                    <tr key={result.case_id} className={result.case_id % 2 === 0 ? 'bg-neutral-50' : 'bg-white'}>
                      <td className="border border-neutral-300 px-3 py-2 font-medium">{result.case_name}</td>
                      <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">{result.factors.A}</td>
                      <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">{result.factors.B}</td>
                      <td className="border border-neutral-300 px-3 py-2 text-center font-mono text-xs">{result.factors.C}</td>
                      <td className="border border-neutral-300 px-3 py-2 text-right font-mono">{result.metrics.total_site_energy_GJ.toFixed(2)}</td>
                      <td className={`border border-neutral-300 px-3 py-2 text-right font-mono ${change.percent < 0 ? 'text-green-700' : 'text-neutral-600'}`}>
                        {change.percent.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 bg-white border border-neutral-200 rounded text-sm">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <div className="font-medium text-neutral-700">Baseline</div>
                <div className="text-2xl font-semibold text-neutral-900">{baseline.metrics.total_site_energy_GJ.toFixed(1)} GJ</div>
              </div>
              <div>
                <div className="font-medium text-neutral-700">Best case (AC+)</div>
                <div className="text-2xl font-semibold text-green-700">
                  {evidence.raw_results.find((r: any) => r.case_name === 'AC+').metrics.total_site_energy_GJ.toFixed(1)} GJ
                </div>
                <div className="text-xs text-green-700">
                  {evidence.factorial_analysis.total_site_energy_GJ.changes_vs_baseline['AC+'].percent.toFixed(2)}% reduction
                </div>
              </div>
              <div>
                <div className="font-medium text-neutral-700">Range</div>
                <div className="text-sm text-neutral-700">
                  {Math.min(...evidence.raw_results.map((r: any) => r.metrics.total_site_energy_GJ)).toFixed(1)} –
                  {Math.max(...evidence.raw_results.map((r: any) => r.metrics.total_site_energy_GJ)).toFixed(1)} GJ
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metric-by-Metric Results */}
      <div className="space-y-3">
        <h3 className="font-semibold">Metric-by-Metric Results</h3>
        <p className="text-sm text-neutral-600">
          Tested ranges: A (window area: baseline 16.56 m² vs reduced 12.42 m² = 75% of baseline), B (overhang depth: 1.3m vs 2.0m), C (wall insulation thickness: 0.090m vs 0.140m)
        </p>

        {Object.entries(evidence.factorial_analysis).map(([metricKey, analysis]: [string, any]) => {
          const isExpanded = expandedMetric === metricKey;
          const metricLabel = metricKey
            .replace(/total_site_energy_GJ/g, 'Total Site Energy (GJ)')
            .replace(/cooling_electricity_GJ/g, 'Cooling Electricity (GJ)')
            .replace(/heating_natural_gas_GJ/g, 'Heating Natural Gas (GJ)')
            .replace(/_/g, ' ');

          return (
            <div key={metricKey} className="border border-neutral-300 rounded-lg bg-white">
              <button
                onClick={() => setExpandedMetric(isExpanded ? null : metricKey)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-neutral-900">{metricLabel}</span>
                  <span className="text-sm text-neutral-500">Baseline: {analysis.baseline_value.toFixed(2)}</span>
                </div>
                <span className="text-neutral-400">{isExpanded ? '−' : '+'}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-neutral-200">
                  {/* Main Effects */}
                  <div className="pt-3">
                    <div className="font-medium text-sm text-neutral-700 mb-2">Main Effects</div>
                    <div className="space-y-2">
                      {['A', 'B', 'C'].map(factor => {
                        const effect = analysis.effects[factor];
                        const pctChange = (effect / analysis.baseline_value * 100);
                        const factorName =
                          factor === 'A' ? 'Window area (−25%)' :
                          factor === 'B' ? 'Overhang depth (+54%)' :
                          'Wall insulation (+55%)';

                        return (
                          <div key={factor} className="flex items-center justify-between p-2 bg-neutral-50 rounded text-sm">
                            <span className="text-neutral-700">{factorName}</span>
                            <div className="flex items-center gap-3">
                              <span className={`font-mono font-medium ${effect < 0 ? 'text-green-700' : 'text-neutral-600'}`}>
                                {effect.toFixed(3)}
                              </span>
                              <span className={`font-mono text-xs ${effect < 0 ? 'text-green-600' : 'text-neutral-500'}`}>
                                ({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%)
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interactions */}
                  <div>
                    <div className="font-medium text-sm text-neutral-700 mb-2">Interactions</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {['AB', 'AC', 'BC', 'ABC'].map(interaction => {
                        const effect = analysis.effects[interaction];
                        return (
                          <div key={interaction} className="flex items-center justify-between p-2 bg-neutral-50 rounded">
                            <span className="text-neutral-600 font-mono">{interaction}</span>
                            <span className="font-mono text-neutral-700">{effect.toFixed(3)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Provenance */}
      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-600 hover:text-neutral-800 font-medium">
          Provenance & Limitations
        </summary>
        <div className="mt-2 p-4 bg-neutral-50 border border-neutral-200 rounded space-y-2 text-neutral-700">
          <div><strong>Source:</strong> {evidence.provenance.source_idf} • {evidence.provenance.weather_file}</div>
          <div><strong>Study type:</strong> {evidence.provenance.study_type}</div>
          <div><strong>Generated:</strong> {evidence.provenance.timestamp}</div>
          <div className="pt-2 border-t border-neutral-300">
            <strong>Limitations:</strong>
            <ul className="ml-4 list-disc space-y-1 text-xs mt-1">
              {evidence.warnings.map((warning: string, i: number) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}
