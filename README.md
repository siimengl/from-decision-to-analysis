# From Decision to Analysis

A lightweight AI decision layer around the performance tools professionals already trust.

## Phase 1: Staged-Mode Prototype

This is Phase 1 implementation with deterministic staged content. No live Anthropic API calls, no fabricated simulation results.

## What's Included

Complete single-page reviewer journey:

1. **Before AI** — Capture baseline plan before AI output
2. **Read the Work** — Load sample project (Chicago office, EnergyPlus model, client brief)
3. **Decision Map** — Current decision, goals, drivers, interactions, assumptions, missing evidence (all tagged: FROM SOURCE / AI INFERENCE / NEEDS EVIDENCE)
4. **Early Decision Brief** — Prioritized hypotheses with transparent reasoning (FOCUS NOW / WATCH / DEFER)
5. **Smallest Useful Test Set** — 8-case 2×2×2 factorial design with rationale
6. **Professional Challenge** — Accept/Revise/Reject with reason capture
7. **Real Evidence** — Placeholder (no fabricated numbers)
8. **Evidence-Backed Recommendation** — Placeholder (awaiting real simulation)
9. **Decision Delta** — Compare WITHOUT AI vs WITH AI + EVIDENCE
10. **Practice Signals** — Behavioral feedback in localStorage (clear anytime)
11. **Draft Practice Card** — Reviewable pattern card
12. **Production Path** — Footer explaining real deployment requirements

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Build

```bash
npm run build
npm start
```

## Sample Data

- `data/5ZoneAirCooled.idf` — Public EnergyPlus 26.1 example
- `data/USA_IL_Chicago-OHare_TMY3.epw` — Public Chicago TMY3 weather
- `data/client-brief.md` — Fictional/sanitized project brief
- `data/evidence.json` — (Not included yet; awaiting real EnergyPlus runs)

## Phase 1 Scope

- ✅ Complete staged-mode UX with deterministic content
- ✅ All 11 sections of reviewer journey
- ✅ localStorage-based practice signals
- ✅ Professional aesthetic (no AI gradients/sparkles)
- ✅ Source/inference/evidence tagging throughout
- ✅ Working interactions (load project, challenge AI, adjust priorities)
- ❌ No Anthropic API integration (Phase 2+)
- ❌ No fabricated simulation results
- ❌ No live AI model calls

## Tech Stack

- Next.js 16 + App Router
- React 19
- TypeScript
- Tailwind CSS 4

## Design Principles

- Professional AEC/consulting aesthetic
- Restrained neutral palette, strong typography, generous whitespace
- Polished and built-environment appropriate
- Intelligent, warm, concise — not overconfident
- Decision-support tool, not autonomous simulator
