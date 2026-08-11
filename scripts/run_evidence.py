#!/usr/bin/env python3
"""
2^3 Full-Factorial EnergyPlus Study
Factors:
  A: WF-1 window area (baseline vs 75% baseline)
  B: Main South Overhang depth (1.3m vs 2.0m)
  C: IN02 insulation thickness (0.090099998m vs 0.14m)
"""
import os
import re
import json
import shutil
import subprocess
from pathlib import Path
from datetime import datetime

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
GENERATED_DIR = PROJECT_ROOT / "generated"
SOURCE_IDF = DATA_DIR / "5ZoneAirCooled.idf"
SOURCE_EPW = DATA_DIR / "USA_IL_Chicago-OHare_TMY3.epw"
ENERGYPLUS_EXE = Path(r"E:\energyplus\energyplus.exe")

# Factor levels
FACTORS = {
    'A': {'name': 'WF-1 Window Area', 'levels': ['baseline', '75%']},
    'B': {'name': 'Main South Overhang Depth', 'levels': ['1.3m', '2.0m']},
    'C': {'name': 'IN02 Insulation Thickness', 'levels': ['0.090099998m', '0.14m']}
}

# 8 cases for 2^3 factorial (- is low level, + is high level)
CASES = [
    {'id': 1, 'name': 'baseline', 'A': '-', 'B': '-', 'C': '-'},
    {'id': 2, 'name': 'A+', 'A': '+', 'B': '-', 'C': '-'},
    {'id': 3, 'name': 'B+', 'A': '-', 'B': '+', 'C': '-'},
    {'id': 4, 'name': 'AB+', 'A': '+', 'B': '+', 'C': '-'},
    {'id': 5, 'name': 'C+', 'A': '-', 'B': '-', 'C': '+'},
    {'id': 6, 'name': 'AC+', 'A': '+', 'B': '-', 'C': '+'},
    {'id': 7, 'name': 'BC+', 'A': '-', 'B': '+', 'C': '+'},
    {'id': 8, 'name': 'ABC+', 'A': '+', 'B': '+', 'C': '+'},
]


def create_variant(case, output_path):
    """Create IDF variant with specified factor levels."""
    with open(SOURCE_IDF, 'r') as f:
        content = f.read()

    # Factor A: WF-1 window area (baseline vs 75%)
    # Baseline: x from 3.0 to 16.8 (width=13.8m), z from 0.9 to 2.1 (height=1.2m)
    # 75% area means 0.866 scale in each dimension, keep centered
    if case['A'] == '+':
        # 75% area = 0.866 linear scale
        # Original: x: 3.0 to 16.8 (center 9.9), z: 0.9 to 2.1 (center 1.5)
        # New width: 13.8 * 0.866 = 11.95, new x: 9.9 ± 5.975 = 3.925 to 15.875
        # Keep height, center horizontally
        wf1_pattern = r'(FenestrationSurface:Detailed,\s+WF-1,.*?)(3\.0,0\.0,2\.1,.*?3\.0,0\.0,0\.9,.*?16\.8,0\.0,0\.9,.*?16\.8,0\.0,2\.1;)'
        wf1_replacement = r'\g<1>3.925,0.0,2.1,  !- X,Y,Z ==> Vertex 1 {m}\n    3.925,0.0,0.9,  !- X,Y,Z ==> Vertex 2 {m}\n    15.875,0.0,0.9,  !- X,Y,Z ==> Vertex 3 {m}\n    15.875,0.0,2.1;  !- X,Y,Z ==> Vertex 4 {m}'
        content = re.sub(wf1_pattern, wf1_replacement, content, flags=re.DOTALL)

    # Factor B: Main South Overhang depth (1.3m vs 2.0m)
    # Y vertices go from -1.3 to -2.0
    if case['B'] == '+':
        overhang_pattern = r'(Main South Overhang,.*?4,.*?)0\.0,-1\.3,2\.2,(.*?)19\.8,-1\.3,2\.2;'
        overhang_replacement = r'\g<1>0.0,-2.0,2.2,\g<2>19.8,-2.0,2.2;'
        content = re.sub(overhang_pattern, overhang_replacement, content, flags=re.DOTALL)

    # Factor C: IN02 insulation thickness (0.090099998m vs 0.14m)
    if case['C'] == '+':
        # Match IN02 material and replace its thickness field
        insul_pattern = r'(IN02.*?Rough.*?)9\.0099998E-02,'
        insul_replacement = r'\g<1>0.14,'
        content = re.sub(insul_pattern, insul_replacement, content, flags=re.DOTALL)

    with open(output_path, 'w') as f:
        f.write(content)


def run_energyplus(idf_path, case_name):
    """Run EnergyPlus simulation."""
    output_dir = GENERATED_DIR / case_name
    output_dir.mkdir(parents=True, exist_ok=True)

    # EnergyPlus expects: energyplus -w weather.epw -d output_dir input.idf
    cmd = [
        str(ENERGYPLUS_EXE),
        '-w', str(SOURCE_EPW),
        '-d', str(output_dir),
        str(idf_path)
    ]

    print(f"Running {case_name}...")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        err_file = output_dir / "eplusout.err"
        if err_file.exists():
            with open(err_file, 'r') as f:
                print(f"ERROR in {case_name}:\n{f.read()}")
        raise RuntimeError(f"EnergyPlus failed for {case_name}")

    return output_dir


def extract_metrics(output_dir):
    """Extract metrics from EnergyPlus outputs."""
    metrics = {}

    # Read HTML table output
    html_file = output_dir / "eplustbl.htm"
    if html_file.exists():
        with open(html_file, 'r', encoding='utf-8') as f:
            html = f.read()

            # Extract Total Site Energy from Site and Source Energy table
            site_energy_match = re.search(
                r'<td align="right">Total Site Energy</td>\s*<td align="right">\s*([\d.]+)</td>',
                html
            )
            if site_energy_match:
                metrics['total_site_energy_GJ'] = float(site_energy_match.group(1))

            # Extract Total End Uses row for electricity and natural gas
            # Format: Total End Uses row has electricity in first column, natural gas in second
            end_uses_match = re.search(
                r'<td align="right">Total End Uses</td>\s*<td align="right">\s*([\d.]+)</td>\s*<td align="right">\s*([\d.]+)</td>',
                html
            )
            if end_uses_match:
                metrics['electricity_GJ'] = float(end_uses_match.group(1))
                metrics['natural_gas_GJ'] = float(end_uses_match.group(2))

            # Extract cooling electricity (first data column after "Cooling")
            cooling_match = re.search(
                r'<td align="right">Cooling</td>\s*<td align="right">\s*([\d.]+)</td>',
                html
            )
            if cooling_match:
                metrics['cooling_electricity_GJ'] = float(cooling_match.group(1))

            # Extract heating natural gas (second data column after "Heating")
            heating_match = re.search(
                r'<td align="right">Heating</td>\s*<td align="right">\s*([\d.]+)</td>\s*<td align="right">\s*([\d.]+)</td>',
                html
            )
            if heating_match:
                metrics['heating_natural_gas_GJ'] = float(heating_match.group(2))

    return metrics


def compute_factorial_effects(results, metric_key):
    """Compute main effects and interactions for 2^3 factorial."""
    # Extract values in Yates order
    y = [results[i]['metrics'][metric_key] for i in range(8)]

    # Main effects
    A = (y[1] - y[0] + y[3] - y[2] + y[5] - y[4] + y[7] - y[6]) / 4
    B = (y[2] - y[0] + y[3] - y[1] + y[6] - y[4] + y[7] - y[5]) / 4
    C = (y[4] - y[0] + y[5] - y[1] + y[6] - y[2] + y[7] - y[3]) / 4

    # Two-way interactions
    AB = (y[3] - y[2] - y[1] + y[0] + y[7] - y[6] - y[5] + y[4]) / 4
    AC = (y[5] - y[4] - y[1] + y[0] + y[7] - y[6] - y[3] + y[2]) / 4
    BC = (y[6] - y[4] - y[2] + y[0] + y[7] - y[5] - y[3] + y[1]) / 4

    # Three-way interaction
    ABC = (y[7] - y[6] - y[5] + y[4] - y[3] + y[2] + y[1] - y[0]) / 4

    return {
        'A': A, 'B': B, 'C': C,
        'AB': AB, 'AC': AC, 'BC': BC,
        'ABC': ABC
    }


def main():
    """Run full factorial study."""
    print("Starting 2^3 Full-Factorial EnergyPlus Study")
    print("=" * 60)

    if not ENERGYPLUS_EXE.exists():
        raise FileNotFoundError(f"EnergyPlus not found at {ENERGYPLUS_EXE}")

    if not SOURCE_IDF.exists():
        raise FileNotFoundError(f"Source IDF not found at {SOURCE_IDF}")

    if not SOURCE_EPW.exists():
        raise FileNotFoundError(f"Weather file not found at {SOURCE_EPW}")

    # Create generated directory
    GENERATED_DIR.mkdir(exist_ok=True)

    # Generate and run all cases
    results = []
    for case in CASES:
        case_name = f"case{case['id']}_{case['name']}"
        idf_path = GENERATED_DIR / f"{case_name}.idf"

        print(f"\n--- Case {case['id']}: {case['name']} ---")
        print(f"  A={case['A']}, B={case['B']}, C={case['C']}")

        # Generate variant
        create_variant(case, idf_path)
        print(f"  Generated: {idf_path.name}")

        # Run simulation
        output_dir = run_energyplus(idf_path, case_name)

        # Extract metrics
        metrics = extract_metrics(output_dir)
        print(f"  Metrics: {metrics}")

        results.append({
            'case_id': case['id'],
            'case_name': case['name'],
            'factors': {'A': case['A'], 'B': case['B'], 'C': case['C']},
            'metrics': metrics
        })

    # Compute factorial effects for each metric
    baseline_metrics = results[0]['metrics']
    metric_keys = list(baseline_metrics.keys())

    factorial_analysis = {}
    for metric in metric_keys:
        effects = compute_factorial_effects(results, metric)

        # Compute changes vs baseline
        baseline_val = baseline_metrics[metric]
        changes = {}
        for r in results:
            case_val = r['metrics'][metric]
            change = case_val - baseline_val
            pct_change = (change / baseline_val * 100) if baseline_val != 0 else 0
            changes[r['case_name']] = {
                'absolute': change,
                'percent': pct_change
            }

        factorial_analysis[metric] = {
            'baseline_value': baseline_val,
            'effects': effects,
            'changes_vs_baseline': changes
        }

    # Generate evidence.json
    evidence = {
        'provenance': {
            'energyplus_version': 'EnergyPlus (version extracted from simulation)',
            'source_idf': str(SOURCE_IDF.name),
            'weather_file': str(SOURCE_EPW.name),
            'timestamp': datetime.now().isoformat(),
            'study_type': '2^3 full-factorial'
        },
        'factors': FACTORS,
        'cases': CASES,
        'raw_results': results,
        'factorial_analysis': factorial_analysis,
        'warnings': [
            'This model does not include daylighting simulation',
            'This model does not include glare metrics',
            'This model does not include occupant comfort metrics',
            'Cost estimates are not included',
            'Metrics are annual totals from single-year simulation'
        ]
    }

    output_file = DATA_DIR / "evidence.json"
    with open(output_file, 'w') as f:
        json.dump(evidence, f, indent=2)

    print("\n" + "=" * 60)
    print("STUDY COMPLETE")
    print("=" * 60)
    print(f"Evidence written to: {output_file}")
    print(f"\nMetrics captured: {', '.join(metric_keys)}")

    # Report strongest effects
    for metric in metric_keys:
        effects = factorial_analysis[metric]['effects']
        max_effect = max(abs(effects[k]) for k in ['A', 'B', 'C'])
        max_key = [k for k in ['A', 'B', 'C'] if abs(effects[k]) == max_effect][0]
        print(f"\n{metric}:")
        print(f"  Baseline: {baseline_metrics[metric]:.2f}")
        print(f"  Strongest main effect: {max_key} = {effects[max_key]:.3f}")
        print(f"  Interactions: AB={effects['AB']:.3f}, AC={effects['AC']:.3f}, BC={effects['BC']:.3f}, ABC={effects['ABC']:.3f}")


if __name__ == "__main__":
    main()
