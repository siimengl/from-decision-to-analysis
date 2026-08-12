# From Decision to Analysis

*A lightweight AI decision layer around the performance tools professionals already trust.*

**First-round assignment prototype ¡ª Scenario B: Building-performance engineer**

Conceived and built specifically for this assignment as a working exploration of how AI could improve early-stage performance decisions before detailed technical analysis begins.

## The idea

Early performance work can involve a large space of variables, combinations, constraints, and trade-offs. The prototype uses AI to make that search more intelligent ¡ª not to replace simulation or professional judgment.

**AI frames what deserves evidence ¡ú trusted simulation produces evidence ¡ú the professional decides what the evidence means.**

## Workflow

**Read the Work ¡ú Decision Map ¡ú Early Decision Brief ¡ú Smallest Useful Test Set ¡ú Professional Challenge ¡ú Real Evidence ¡ú Evidence-Backed Recommendation ¡ú Decision Delta ¡ú Practice Signals**

The professional can revise or reject the AI framing and remains responsible for what gets simulated and what advances.

## What was tested

The prototype includes a completed **2¡Á2¡Á2 EnergyPlus pilot** using three early-stage variables and eight simulation cases.

The evidence challenged part of the initial framing: the expected window-area ¡Á overhang interaction was weak in the tested range, while insulation emerged as a stronger measured energy lever.

That reversal is intentional and important:

**The goal is not to prove that AI guessed correctly. The goal is to let real evidence challenge and reorder the AI framing.**

## Human¨CAI boundaries

- Source facts, AI inference, and evidence are kept distinct.
- AI can prioritize questions and test directions; it does not act as the simulator.
- Simulation evidence can change priorities; it does not make the final project decision.
- Professionals can accept, revise, or reject AI framing.
- Practice Signals capture workflow behavior, not employee profiling.
- Completed pilot history is not rewritten by later live AI output.

## Prototype

The browser experience contains prepared pilot framing for immediate review, with optional live AI framing and interpretation.

EnergyPlus is **not** run on demand in the browser. The pilot evidence was generated locally and bundled into the prototype.

## Evidence & reproducibility

- `data/client-brief.md` ¡ª fictional/sanitized project brief
- `data/5ZoneAirCooled.idf` ¡ª public EnergyPlus sample model
- `data/USA_IL_Chicago-OHare_TMY3.epw` ¡ª Chicago TMY3 weather file
- `data/evidence.json` ¡ª completed pilot evidence
- `scripts/` ¡ª scripts used to generate, audit, and verify the simulation study

## Tech

Next.js ¡¤ TypeScript ¡¤ Anthropic-compatible API ¡¤ EnergyPlus ¡¤ Python

---

**Public sample data only. This is an independent assignment prototype, not an M Moser or client project.**
