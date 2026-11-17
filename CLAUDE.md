# DrawFix AI (PlanCheck AI) — project handoff

Read this first. It is the full context for continuing this project in Claude Code.

## What this is

A web app that reads an AutoCAD **DXF floor plan**, measures every escape route, and checks it
against Bangladesh building rules (BNBC 2012 and simplified Dhaka building rules). It shows the
findings on the plan, proposes fixes, re-checks them, plays the escape in 3D, and exports a PDF.

- Built for the **International AI Builders Congress 2026** hackathon.
- Best-fit track: **CivicSphere AI → GovCopilot** ("Faster, auditable service delivery").
  GovCopilot example prompt #1 is almost exactly this product: compliance checks against
  municipal codes. The challenge suggests "Document RAG"; this app deliberately uses a fixed,
  hand-verified rule engine instead. Say why on stage: RAG over legal text can misquote a
  clause, and a wrong fire-safety citation is worse than less flexibility.
- Realistic buyer: approval offices (RAJUK, city corporations), developers, insurers.
  **Not** architects checking their own work. Archistar (Australia) is the closest real
  competitor; the difference here is BNBC + Bangla, not a new category.
- Original version was generated with Google AI Studio. Repo:
  https://github.com/ismailhhridoy/DrawFix-AI

## Core design rule (do not break)

**Code measures. A person confirms the inputs. AI only does the wording.**

- Every distance, width, area, pass/fail and limit comes from plain TypeScript.
- Gemini is used only to: classify messy room labels, reword findings in English/Bangla,
  answer questions from the tool's own reference notes, draft a review note.
- Gemini never outputs a measurement, a limit or a clause number of its own.
- If Gemini is off or fails, the whole app still works with fixed wording.
- Every finding carries a **trust level** (`basis`):
  - `verified` — limit read in the BNBC 2012 text, Part 3 Ch. 1
    (https://law.resource.org/pub/bd/bnbc.2012/gov.bd.bnbc.2012.03.01.pdf)
  - `screening` — prototype value; governing clause (BNBC Part 4 Ch. 3, Dhaka Imarat Nirman
    Bidhimala 2008) **not verified** against the gazette. A reviewer must confirm.
  - `drawing` — consistency check on the drawing itself, not a code rule.
- Never present a `screening` limit as law. Never add a clause number you have not read.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add GEMINI_API_KEY
npm run dev                  # http://localhost:3000
npx tsc --noEmit             # type-check
npx vite build               # production build
```

Env vars (all optional): `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-4-hydrogen`),
`GEMINI_FALLBACK_MODEL` (default `gemini-2.5-flash`), `GEMINI_EMBEDDING_MODEL`, `PORT`.
`GET /api/health` reports whether Gemini is configured; the header shows "Gemini on/off".

`package.json` change: `esbuild` bumped `^0.25.0` → `^0.27.0` (npm install failed otherwise).

## Layout

```
server.ts                    Express + Vite. /api/* Gemini endpoints, model fallback,
                             rate limit (40 req/min/IP), /api/health. Strict prompts.
src/types/plan.ts            All types. Violation has basis, basisNote, blocked.
src/engine/
  dxfParser.ts               DXF -> ParsedFloorPlan. Units, wall-layer fallback, doors,
                             exits, stairs, rooms (polyline OR wall-enclosure).
  geometry.ts       (new)    detectWallOpenings(), segmentEnclosedRegions(), polygon utils.
  rules.ts          (new)    RULES registry: name, citation, basis, note per rule id.
  ruleEngine.ts              runBuildingAudit(), applyBuildingRemediationFixes().
  pathfinding.ts             A* nav grid, multi-floor escape, narrow-passage detection.
  aiFallback.ts              Fixed EN/BN explanations, client calls to /api, bn() digits.
  bnbcCorpus.ts              Reference notes for the question box, each with basis.
  sampleDxf.ts               4 synthetic demo buildings written as real DXF text.
src/components/
  shared.tsx        (new)    useAiStatus(), BasisBadge, measuredText().
  LandingPage.tsx            Rewritten: live plan as hero, rules-and-limits table.
  StepUpload / StepReview / StepReport / StepCompare / Viewport3D / StepExport
  Blueprint2D.tsx            SVG plan view.
test-fixtures/               Unfamiliar-convention DXFs used to test the parser.
```

## What was changed from the AI Studio version (and why)

### Functionality
1. **Parser works on drawings it was not written for.** Original needed helper layers
   (`A-AREA-POLY` room polygons, `EXIT` in block names). Now:
   - Rooms found from the areas the walls enclose when there are no room polylines.
   - Door widths measured from the wall gap, not trusted from the block name.
   - Doors drawn as an arc beside a gap (no block) are detected.
   - With no named exits, ground-floor doors in the outer wall are taken as exits (and
     the parser says so in `parseNotes`).
   - Wall layer: falls back to layers named like walls, then to the layer with most line work.
   - `$INSUNITS` honoured (mm, cm, m, inches, feet). Bad files get a clear error.
   - Tested on 3 synthetic "foreign" DXFs in `test-fixtures/`: all 8 rooms and the exit read.
2. **No invented data.**
   - Old app made up plot area (`footprint / 0.54`), road width 12.2 m and setbacks for any
     upload, then screened zoning on them. Now plot data is empty until a person enters it;
     zoning is listed under "Not checked" otherwise.
   - Stair headroom/handrail/riser/tread defaults are never checked. Only values written in
     the drawing (`HEADROOM=… HANDRAIL=…` text) are checked; the rest go to "Not checked".
   - Blocked rooms were reported as a fake `99.9 m`. Now `blocked: true`, shown as "No route".
3. **Honest citations.** Every rule goes through `rules.ts`. Corrected wrong references
   (bedroom area is Sec 1.13.2.2: 9.5 m² and 2.9 m wide; added the width check). Part 4
   items are labelled screening.
4. **`notChecked` list** in the audit: what could not be assessed and why.
5. Narrow-passage detection now also finds vertical corridors; wall-move fixes work both ways.
   Pinches under 0.4 m are ignored (double-line walls).
6. Single uploaded upper floor: travel is measured to its stairs.
7. Gemini replies are validated (unknown room ids or room types dropped). Model is
   configurable with fallback; the hard-coded `gemini-4-hydrogen` broke silently before.
8. Review screen: reviewer can tick Exit / Locked per door (`handleUpdateDoor` in App.tsx).
9. Share link only offered for demo plans (uploads are not stored anywhere).
10. PDF export rewritten: trust level per finding, "Not checked" section, Bangla text
    replaced with "[Bangla label]" instead of garbled glyphs (jsPDF font has no Bangla).
11. Review note / memo no longer imitates a RAJUK/FSCD document; starts with "DRAFT".

### UI
- Landing: real parsed plan as hero (stock photos removed), "Gemini on/off" status,
  plain "how it works", every rule with its trust badge, honest limits.
- Review: plan preview beside the room table (hover row → highlight room), exits table,
  parser notes on top, plot-data inputs empty by default.
- Report: trust badge on each finding, "How far to trust this report" + "Not checked" panel.
- Plan view keeps aspect ratio; Ctrl+scroll zooms (plain scroll scrolls the page);
  legend moved under the plan; door labels never upside down.
- Copy rewritten everywhere to plain language; no "Gemini 4 Hydrogen" claims when off.

## Current results (demo plans, computed live)

| Demo | Before | After fixes | Slowest escape |
|---|---|---|---|
| Gazipur 3-story RMG | 9 fail, 7 warn | 0 / 0 | 54.7 s → 36.7 s |
| Gazipur multi-wing L2 | 7 fail, 4 warn | 0 / 0 | 31.3 s → 12.7 s |
| Mirpur RMG floor 4 | 6 fail, 2 warn | 0 / 0 | 24.7 s → 16.7 s |
| Dhanmondi residential L3 | 5 fail, 4 warn | 0 / 0 | 26.7 s → 12.1 s |

22 rules: 9 verified, 12 screening, 1 drawing check. Type-check and build pass.

## Not done yet (next steps, in order)

1. **Screenshot-check** 3D escape and Export screens after the changes (Landing, Review,
   Report, Fixes were checked; 3D and Export were not re-checked).
2. Test with a **real** architect's DXF from Bangladesh. Synthetic fixtures are not proof.
   Expect trouble with: double-line walls, walls as blocks, curved walls, xrefs.
3. **Verify BNBC Part 4 Ch. 3** (exit width, exit count, travel distance table 4.3.x,
   occupant load, capacity factors) against the gazette. Then switch those rules in
   `rules.ts` from `screening` to `verified` with exact clause numbers. Do not guess.
4. Dhaka Imarat Nirman Bidhimala 2008 FAR/MGC/setback tables (currently simplified ladder).
5. Bangla font in PDF (embed a Bangla TTF in jsPDF) instead of "[Bangla label]".
6. Mobile layout pass (desktop checked at 1440 px only).
7. Commit and push. Nothing is committed yet. Suggested: branch `improve/honest-checks`.

## Pitch notes

- Lead with the escape-time drop (e.g. 54.7 s → 36.7 s), then show a locked exit.
- Live demo: download a demo DXF, delete a door in AutoCAD, re-upload, findings change.
  This proves it is not hard-coded.
- Have one spare DXF tested end to end in case a judge asks "what if I upload mine".
- Say clearly: prototype, screening aid, not an approval; which limits are verified.
- "Where is the AI?" → labels and language, never the measurement. That is the design.
