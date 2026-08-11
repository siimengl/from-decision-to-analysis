#!/usr/bin/env python3
"""Verify factorial calculations are order-independent."""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
EVIDENCE_FILE = DATA_DIR / "evidence.json"

def compute_factorial_effects_from_states(results, metric_key):
    """Compute effects using explicit A/B/C states, order-independent."""
    # Build lookup: (A, B, C) -> metric_value
    lookup = {}
    for r in results:
        factors = r['factors']
        key = (factors['A'], factors['B'], factors['C'])
        lookup[key] = r['metrics'][metric_key]

    # Extract values by state combination
    y_mmm = lookup[('-', '-', '-')]
    y_pmm = lookup[('+', '-', '-')]
    y_mpm = lookup[('-', '+', '-')]
    y_ppm = lookup[('+', '+', '-')]
    y_mmp = lookup[('-', '-', '+')]
    y_pmp = lookup[('+', '-', '+')]
    y_mpp = lookup[('-', '+', '+')]
    y_ppp = lookup[('+', '+', '+')]

    # Main effects (average change when factor goes from - to +)
    A = ((y_pmm - y_mmm) + (y_ppm - y_mpm) + (y_pmp - y_mmp) + (y_ppp - y_mpp)) / 4
    B = ((y_mpm - y_mmm) + (y_ppm - y_pmm) + (y_mpp - y_mmp) + (y_ppp - y_pmp)) / 4
    C = ((y_mmp - y_mmm) + (y_pmp - y_pmm) + (y_mpp - y_mpm) + (y_ppp - y_ppm)) / 4

    # Two-way interactions
    AB = ((y_ppm - y_mpm) - (y_pmm - y_mmm) + (y_ppp - y_mpp) - (y_pmp - y_mmp)) / 4
    AC = ((y_pmp - y_mmp) - (y_pmm - y_mmm) + (y_ppp - y_mpp) - (y_ppm - y_mpm)) / 4
    BC = ((y_mpp - y_mmp) - (y_mpm - y_mmm) + (y_ppp - y_pmp) - (y_ppm - y_pmm)) / 4

    # Three-way interaction
    ABC = ((y_ppp - y_mpp) - (y_pmp - y_mmp) - (y_ppm - y_mpm) + (y_pmm - y_mmm)) / 4

    return {
        'A': A, 'B': B, 'C': C,
        'AB': AB, 'AC': AC, 'BC': BC,
        'ABC': ABC
    }

def main():
    """Verify factorial calculations."""
    with open(EVIDENCE_FILE, 'r') as f:
        evidence = json.load(f)

    results = evidence['raw_results']
    baseline_metrics = results[0]['metrics']
    metric_keys = list(baseline_metrics.keys())

    print("=" * 80)
    print("FACTORIAL CALCULATION VERIFICATION")
    print("=" * 80)

    all_match = True

    for metric in metric_keys:
        # Recompute using order-independent method
        new_effects = compute_factorial_effects_from_states(results, metric)

        # Compare with stored effects
        stored_effects = evidence['factorial_analysis'][metric]['effects']

        print(f"\n{metric}:")
        for factor in ['A', 'B', 'C', 'AB', 'AC', 'BC', 'ABC']:
            new_val = new_effects[factor]
            stored_val = stored_effects[factor]
            diff = abs(new_val - stored_val)
            match = diff < 0.001
            status = "PASS" if match else "FAIL"
            print(f"  [{status}] {factor}: stored={stored_val:.6f}, computed={new_val:.6f}, diff={diff:.6f}")
            if not match:
                all_match = False

    print("\n" + "=" * 80)
    if all_match:
        print("ALL EFFECTS MATCH - CALCULATIONS ARE CORRECT")
    else:
        print("SOME EFFECTS DIFFER - NEEDS INVESTIGATION")
    print("=" * 80)

if __name__ == "__main__":
    main()
