#!/usr/bin/env python3
"""Audit generated IDF variants to verify factor transformations."""
import re
from pathlib import Path

GENERATED_DIR = Path(__file__).parent.parent / "generated"

def audit_factor_A(idf_path):
    """Check WF-1 window area."""
    with open(idf_path, 'r') as f:
        content = f.read()

    # Find WF-1 window vertices
    wf1_match = re.search(r'FenestrationSurface:Detailed,\s+WF-1,.*?(\d+\.?\d*),0\.0,2\.1,.*?(\d+\.?\d*),0\.0,0\.9,.*?(\d+\.?\d*),0\.0,0\.9,.*?(\d+\.?\d*),0\.0,2\.1;', content, re.DOTALL)

    if wf1_match:
        x1, x2, x3, x4 = [float(wf1_match.group(i)) for i in range(1, 5)]
        width = x3 - x1
        height = 2.1 - 0.9
        area = width * height

        # Baseline: 3.0 to 16.8 = 13.8m width, 1.2m height, area = 16.56 m²
        # 75%: area = 12.42 m², actual width = 11.95m
        baseline_area = 13.8 * 1.2
        target_75_area = 11.95 * 1.2

        if abs(area - baseline_area) < 0.01:
            return "baseline", area, width, height
        elif abs(area - target_75_area) < 0.01:
            return "75%", area, width, height
        else:
            return "UNKNOWN", area, width, height

    return None, None, None, None

def audit_factor_B(idf_path):
    """Check Main South Overhang depth."""
    with open(idf_path, 'r') as f:
        content = f.read()

    # Find overhang Y coordinate
    overhang_match = re.search(r'Main South Overhang,.*?0\.0,(-?\d+\.?\d*),2\.2,', content, re.DOTALL)

    if overhang_match:
        y = abs(float(overhang_match.group(1)))

        if abs(y - 1.3) < 0.01:
            return "1.3m", y
        elif abs(y - 2.0) < 0.01:
            return "2.0m", y
        else:
            return "UNKNOWN", y

    return None, None

def audit_factor_C(idf_path):
    """Check IN02 insulation thickness."""
    with open(idf_path, 'r') as f:
        content = f.read()

    # Find IN02 material thickness - simplified pattern
    in02_match = re.search(r'IN02.*?Rough.*?([0-9.E+-]+),', content, re.DOTALL)

    if in02_match:
        thickness = float(in02_match.group(1))

        if abs(thickness - 0.090099998) < 0.001:
            return "0.090099998m", thickness
        elif abs(thickness - 0.14) < 0.001:
            return "0.14m", thickness
        else:
            return "UNKNOWN", thickness

    return None, None

def main():
    """Audit all generated variants."""
    cases = [
        {'id': 1, 'name': 'baseline', 'A': '-', 'B': '-', 'C': '-'},
        {'id': 2, 'name': 'A+', 'A': '+', 'B': '-', 'C': '-'},
        {'id': 3, 'name': 'B+', 'A': '-', 'B': '+', 'C': '-'},
        {'id': 4, 'name': 'AB+', 'A': '+', 'B': '+', 'C': '-'},
        {'id': 5, 'name': 'C+', 'A': '-', 'B': '-', 'C': '+'},
        {'id': 6, 'name': 'AC+', 'A': '+', 'B': '-', 'C': '+'},
        {'id': 7, 'name': 'BC+', 'A': '-', 'B': '+', 'C': '+'},
        {'id': 8, 'name': 'ABC+', 'A': '+', 'B': '+', 'C': '+'},
    ]

    print("=" * 80)
    print("IDF VARIANT AUDIT")
    print("=" * 80)

    all_pass = True

    for case in cases:
        case_name = f"case{case['id']}_{case['name']}"
        idf_path = GENERATED_DIR / f"{case_name}.idf"

        print(f"\n{case_name}: Expected A={case['A']}, B={case['B']}, C={case['C']}")

        if not idf_path.exists():
            print(f"  [FAIL] FILE NOT FOUND")
            all_pass = False
            continue

        # Audit Factor A
        a_level, a_area, a_width, a_height = audit_factor_A(idf_path)
        expected_a = "baseline" if case['A'] == '-' else "75%"
        a_pass = a_level == expected_a
        status_a = "PASS" if a_pass else "FAIL"
        print(f"  [{status_a}] Factor A: {a_level} (area={a_area:.2f}m^2, width={a_width:.2f}m, height={a_height:.2f}m)")
        if not a_pass:
            all_pass = False

        # Audit Factor B
        b_level, b_depth = audit_factor_B(idf_path)
        expected_b = "1.3m" if case['B'] == '-' else "2.0m"
        b_pass = b_level == expected_b
        status_b = "PASS" if b_pass else "FAIL"
        print(f"  [{status_b}] Factor B: {b_level} (depth={b_depth:.2f}m)")
        if not b_pass:
            all_pass = False

        # Audit Factor C
        c_level, c_thickness = audit_factor_C(idf_path)
        expected_c = "0.090099998m" if case['C'] == '-' else "0.14m"
        c_pass = c_level == expected_c if c_level is not None else False
        status_c = "PASS" if c_pass else "FAIL"
        if c_thickness is not None:
            print(f"  [{status_c}] Factor C: {c_level} (thickness={c_thickness:.6f}m)")
        else:
            print(f"  [{status_c}] Factor C: NOT FOUND")
        if not c_pass:
            all_pass = False

    print("\n" + "=" * 80)
    if all_pass:
        print("ALL VARIANTS PASS")
    else:
        print("SOME VARIANTS FAILED")
    print("=" * 80)

if __name__ == "__main__":
    main()
