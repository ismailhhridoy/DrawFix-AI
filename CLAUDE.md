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

**AI proposes. Code verifies. A person approves.**

(Changed 2026-11-19 from "AI only does the wording". Gemini now does real work, but never has the last word on a number.)

- Every distance, width, area, pass/fail and limit comes from plain TypeScript. That has not changed.
- Gemini **proposes**: layout changes (`src/engine/layoutEdits.ts` edit language: unlock/widen/move a
  door, add an exit door, move a wall, add a stair core, set a stair value, fix a dimension text), the
  next step of the fix agent (`fixAgent.ts`), and a trace of a plan image/PDF (`visionPlan.ts`, positions
  in 0-1000 image units only, never metres). It also still classifies labels, rewords findings, answers
  questions and drafts a review note.
- Code **verifies**: every proposed edit is validated (ids exist, values inside `EDIT_BOUNDS`), applied to a
  copy, and the full audit re-runs (`verifyCandidate`). A proposal is kept only if its target findings are
  gone and nothing new fails or warns. Image readings are scaled by code from a width the reviewer types.
- A person **approves**: nothing an AI proposed changes the "after" plan until the reviewer ticks it in the
  approval list (`applyApprovedChanges` re-applies and re-audits again). Image readings go to Review.
- Gemini never outputs a measurement, a limit or a clause number of its own. Its notes/rationales are
  number-guarded (`numberGuard.ts`).
- If Gemini is off or fails, the whole app still works: fixed wording, and the agent runs the hand-written
  fixes through the same verifier (labelled "Fixed rules (Gemini off)"). Image reading needs Gemini.
- Every finding carries a **trust level** (`basis`):
  - `verified` — limit read in the BNBC 2012 text, Part 3 Ch. 1
    (https://law.resource.org/pub/bd/bnbc.2012/gov.bd.bnbc.2012.03.01.pdf)
  - `screening` — prototype value; governing clause (BNBC Part 4 Ch. 3, Dhaka Imarat Nirman
    Bidhimala 2008) **not verified** against the gazette. A reviewer must confirm.
  - `drawing` — consistency check on the drawing itself, not a code rule.
- Never present a `screening` limit as law. Never add a clause number you have not read.

## Why this problem (short version — full sources in `RESEARCH.md`)

- Bangladesh logs about 27,000 fires a year (2024: 26,659, 140 deaths; 2025: about 27,059, 85 deaths),
  but electrical faults, cigarettes and stoves start most of them. A plan check cannot see ignition.
  **Pitch DrawFix as "can people get out", not "prevents fires".**
- The deadliest recent cases failed on the drawing-level basics: Bailey Road 2024 (46 dead: one stair
  where two are required, no fire exits, blocked stair); Mirpur Oct 2025 (16 dead: padlocked roof door);
  Tazreen 2012 (112+ dead: locked exits).
- Enforcement is thin and split: RAJUK, city corporations and the Fire Service share the job; the
  authority meant to enforce BNBC 2020 (BBRA) was reported not yet set up.
- Hard limit: padlocks and changes of use happen after approval. A drawing check only sees the drawing
  plus what a reviewer ticks in the Review step. Say so before a judge does.
- Do **not** cite the 66% / 60% / 40% / 37.39% non-compliance figures: originals not found.
- Open questions that change the product: do Bangladeshi architects submit DXF/DWG to RAJUK (ECPS)?
  Exact BNBC Part 4 Ch. 3 text? See `RESEARCH.md` section 8.

## Run it

```bash
npm install
cp .env.example .env         # optional: add GEMINI_API_KEY (server reads .env only)
npm run dev                  # http://localhost:3000
npx tsc --noEmit             # type-check
npm test                     # vitest: 94 tests in tests/ (engine, hand-checked plan, permits, server, Bangla)
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
test-fixtures/               Unfamiliar-convention DXFs used to test the parser (all 3 come from one
                             script, make_fixtures.py, so they are one case, not three).
tests/                       Vitest: engine.test.ts (sample baselines), handchecked.test.ts (arithmetic
                             check), permit.test.ts (classifier + checklist honesty), server.test.ts (rate limit).
render.yaml                  Render Blueprint (free web service). Dockerfile is unused/untested.
RESEARCH.md                  Sourced problem research with confidence tags. Keep it updated.
src/engine/permitEngine.ts   Permit checklist + correction-letter handling, used by StepPermits.tsx.
                             Audited 2026-11-19 (see Not done #9); procedural items are marked not verified.
src/engine/localIntelligence.ts  Local (non-LLM) room classification, question box, triage.
src/engine/numberGuard.ts    Rejects AI text (EN/BN) with a number not in the source data.
src/engine/layoutEdits.ts    AI feature core: LayoutEdit language, normalizeEdit (validation), applyLayoutEdits
                             (copy only), verifyCandidate (re-audit; accept only if targets clear, nothing new).
src/engine/aiLayoutProposer.ts  Gemini candidates -> validate -> verify; 2 rounds with the engine's reasons.
src/engine/fixAgent.ts       Agent loop (run_audit, get_floor, try_edits, stage, finish); applyApprovedChanges.
src/engine/visionPlan.ts     Plan image/PDF trace (0-1000 units) -> ParsedFloorPlan, scaled by reviewer width;
                             scoreReading, planToSvg. Ported from the parallel thread's branch.
src/engine/fixBenchmark.ts   56 benchmark cases (sets A/B/C) from the demo buildings + searchBaseline (no AI).
src/engine/aiApi.ts          Client fetch helpers; setApiBase() for scripts.
aiDesignRoutes.ts            /api/ai/propose-layout-fixes, /api/ai/agent-step, /api/ai/read-plan-image.
src/components/AiFixAgentPanel.tsx  Fixes step: agent trace, options for one finding, approval list.
src/components/VisionUpload.tsx     Upload step: read a plan image/PDF (needs Gemini).
scripts/eval-ai.ts (+ eval-vision.ts)  Measures the three features; results in eval/. Fixture PNGs from
                             scripts/render-vision-fixtures.ts (needs Playwright).
tests/aiDesign.test.ts, tests/visionPlan.test.ts  Verifier, validation, agent gate (stubbed Gemini), vision.
src/engine/banglaText.ts     DXF \U+ decoding, MTEXT cleanup, Bangla room words, Bangla query synonyms.
src/i18n/                    index.tsx (LangProvider, useLang, Bi, LanguageSwitch), en.ts, bn.ts
                             (typed: missing Bangla key fails tsc), digits.ts, glossary.ts.
src/components/PrintReport.tsx   Printable EN/BN/both report (browser print dialog).
src/components/BanglaNotice.tsx  "Bangla is a machine draft" bar + glossary, shown when Bangla is on.
tests/bangla.test.ts         Bangla steps 1-7; tests/fixtures-bangla.ts builds a 2-room DXF.
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

23 rules in `rules.ts`: 9 verified, 12 screening, 2 drawing checks. Type-check, build and
94 tests pass (checked 2026-11-19, after the Bangla work).

**Caveat on these numbers:** the sample-building baselines in `tests/engine.test.ts` were recorded
from the engine's own output, so they catch regressions but do not prove the numbers are right
(circular). Only `tests/handchecked.test.ts` is checked against arithmetic done by hand.

## Bangla readiness plan (written 2026-11-19; steps 1-7 done the same day, see each step)

Goal: a Bangla-speaking reviewer can use the whole flow in Bangla, upload plans with Bangla labels,
and take away a Bangla report, without any number changing between languages.

### What was true before the work (audit of 2026-11-19, kept for context; now fixed unless a step says otherwise)
- Bangla is **generated but never shown**. `aiFallback.ts` has Bangla templates and the server asks
  Gemini for `bn` / `actionBn` / `answerBn` / `headlineBn` / `memoBodyBn`, but components only render
  the English fields (`StepReport.tsx:648-652`, `StepExport.tsx:194`). No language toggle exists.
- All UI copy is hard-coded English; `<html lang="en">`; no i18n layer. Noto Sans Bengali is already
  loaded (`index.css`), and `bn()` converts digits.
- PDF: `StepExport.tsx:112-119` strips every non-Latin character. jsPDF has no Bangla font and, even
  with one, does not shape Bangla conjuncts/vowel signs, so embedding a TTF alone will render broken
  text (verify with a test page before committing to an approach).
- DXF input: UTF-8 Bangla labels work (`শয়নকক্ষ` -> bedroom). AutoCAD-style `\U+09B6...` escapes are
  **not decoded**: the label stays as `\U+09B6\U+09DF\U+09A8` and the room was classed **cabin**.
  Legacy Bijoy/SutonnyMJ text (ASCII bytes drawn with a Bangla font) is not handled either; how common
  it is in real submissions is unconfirmed until we see real DXFs.
- Question box without Gemini: an English question scores 67.5; the Bangla question
  "বের হওয়ার পথের সর্বোচ্চ দূরত্ব কত?" scores **0** on every note yet still returns an answer.
- `server.ts:76-99` Bangla synonym regexes use `/g` with `.test()` (stateful; misses on repeat calls).

### Steps (in order; each ends with tests + md update + push)
1. **DONE 2026-11-19.** `src/i18n/` (LangProvider, `useLang()`, `<Bi>`, `LanguageSwitch` in the header,
   choice stored in localStorage `drawfix.lang`, sets `<html lang>`). Report, Compare, question box and
   review note show Bangla. Fix summaries carry `summaryBn`; the fixed review note and offline answers
   now have Bangla text; reference notes have `titleBn`/`textBn`/`keywordsBn`. Tests: `tests/bangla.test.ts`.
   Original plan: **Show what already exists (biggest demo win, smallest change).** Language switch EN / বাংলা /
   both in the header, stored per viewer. Report shows `bn` + `actionBn`; Compare shows the Bangla
   narration; question box shows `answerBn`; review note shows `memoBodyBn`. Fixed (non-AI) Bangla
   templates cover the no-key case.
2. **DONE 2026-11-19.** `src/engine/numberGuard.ts` (`checkNumbers`, `guardText`), applied in
   `aiFallback.ts` to Gemini explanations, fix narration, question answers and review note, in English
   and Bangla, field by field (a rejected field falls back to the fixed template). Rounding to fewer
   decimals is allowed; dotted clause numbers must match exactly. Numbers written as words are not caught.
   Original plan: **Number guard for Bangla AI text.** Before showing any Gemini Bangla, convert Bangla digits to
   Latin, extract every number, and reject the text (fall back to the fixed template) if a number is
   not in the finding's own data. Keeps the "AI never changes a measurement" rule true in Bangla.
3. **DONE 2026-11-19.** `src/i18n/en.ts` + `bn.ts` (bn typed `Record<MsgKey,string>`, so a missing
   Bangla key fails `tsc`), `t(key, vars)` with Bangla digits for numeric vars, `num()` for engine
   numbers, `ruleName()` + `nameBn` in `rules.ts`. Covered: Header, Landing, Review, Report, Fixes, plan
   view, Upload, 3D overlay, Export, Permit desk chrome. Still English: parser notes, "Not checked"
   reasons, room/floor names from the DXF, sample-plan descriptions, permit checklist item text,
   correction-letter analysis, PDF. Also fixed two landing sentences that called screening limits
   "confirmed by a licensed reviewer". Original plan: **UI strings.** Small in-house `t(key)` dictionary (`src/i18n/en.ts`, `bn.ts`), no library.
   Translate the demo path first: Header, Landing, Review, Report, Compare; then Upload, Permits,
   3D, Export. Set `<html lang>` on switch; Bangla digits for measurements via `bn()`. Keep clause
   names (e.g. "BNBC 2012, Part 3, Sec 1.13.8.2") in the original form next to the Bangla.
4. **DONE (code part) 2026-11-19; native review still needed.** `src/i18n/glossary.ts` (37 terms,
   `avoid` variants, `GLOSSARY_STATUS = 'machine-draft'`), used in the Gemini prompts (`BN_STYLE` in
   `server.ts`), enforced by tests (no avoided variant in any of our Bangla; Bangla rule names and
   reference notes keep the English numbers). An amber notice under the header (`BanglaNotice.tsx`)
   says the Bangla is a machine draft and shows the glossary whenever Bangla is on screen.
   Original plan: **Glossary + native review.** One `bn` glossary for code terms (travel distance, exit, stair,
   setback, FAR...) used by templates, UI and the Gemini prompt so wording is consistent. A native
   Bangla speaker with building-code context must review templates and glossary; do not ship
   machine-only Bangla as "official".
5. **DONE 2026-11-19.** Export has "Printable report (English / বাংলা)": `PrintReport.tsx` is portalled
   into `<body>`, `@media print` CSS in `index.css` hides the app, and `window.print()` opens the dialog
   (user saves as PDF). Follows the language switch. Checked in headless Chromium: Bangla conjuncts
   shape correctly. The jsPDF button is now labelled "(English only)".
   Original plan: **Bangla report.** Recommended: a print-friendly HTML report and `window.print()` (the browser
   shapes Bangla correctly; user saves as PDF). Alternatives to test: html2canvas image of the
   Bangla section inside the jsPDF file (not selectable), or a jsPDF Bangla font after a shaping test.
6. **DONE 2026-11-19 (Bijoy part not started).** `src/engine/banglaText.ts`: `decodeDxfUnicode`
   (`\U+XXXX`), `cleanDxfText` (MTEXT codes incl. toggles, stacked fractions, `%%c/%%d/%%p`),
   `BANGLA_ROOM_WORDS` + `matchBanglaRoom` (NFC-normalised, longest word wins), used by the parser and
   the geometry classifier. `\U+` Bangla now classifies correctly (bedroom, not cabin). Test DXF builder:
   `tests/fixtures-bangla.ts`. Bijoy/SutonnyMJ still waits for a real DXF.
   Original plan: **Bangla in drawings.** Decode `\U+XXXX` escapes in TEXT/MTEXT (and strip MTEXT formatting codes);
   widen the Bangla room dictionary (রান্নাঘর, টয়লেট/শৌচাগার, বাথরুম, ডাইনিং, ড্রয়িং, লিফট...); add a
   Bijoy/SutonnyMJ-to-Unicode converter **only after** a real DXF shows that encoding.
7. **DONE 2026-11-19.** `BANGLA_QUERY_SYNONYMS` + `expandBanglaQuery` + `banglaNoteScore` in
   `banglaText.ts`, used by the server and `queryLocalCorpus`. Stateful `/g` regexes removed (server
   map and `LOCAL_SYNONYMS`). Zero score now returns "no reference note matched" with no citations,
   offline and on the server. Also fixed `tests/server.test.ts` leaking the spawned server (killing npx
   left tsx running, so later runs silently tested stale code). Original plan: **Bangla questions offline.** Bangla keyword map for `queryLocalCorpus` (reuse the server synonym
   list, without `/g`), and return "no matching note" instead of an answer when the best score is 0.
8. **DONE 2026-11-19** (except Bijoy, not added). All in `tests/bangla.test.ts` plus two server tests;
   94 tests total. Original plan: **Tests:** `\U+` decoding, Bijoy sample (if added), number guard rejects a changed number,
   language switch renders Bangla fields, offline Bangla question finds Sec 1.13.8.2.

### Still open after steps 1-7
- Native Bangla review of `bn.ts`, `glossary.ts`, the Bangla templates in `aiFallback.ts`/`ruleEngine.ts`
  and `titleBn`/`textBn` in `bnbcCorpus.ts`. Until then the on-screen notice calls it a machine draft.
- Still English in Bangla mode: parser notes, "Not checked" reasons, basis notes, room/floor names from
  the DXF, sample-plan descriptions, permit checklist and correction-letter text, the jsPDF file.
- Bijoy/SutonnyMJ text in DXF: not handled; needs a real file first.
- Number guard does not catch numbers written as words.

### Needed from the team
- The competition's exact wording on Bangla (UI? output? input? voice?), to set what "ready" means.
- A native Bangla reviewer for step 4, and one real DXF with Bangla labels for step 6.

## Not done yet (next steps, in order)

1. **Screenshot-check** 3D escape and Export screens after the changes (Landing, Review,
   Report, Fixes were checked; 3D and Export were not re-checked).
2. Test with a **real** architect's DXF from Bangladesh. Synthetic fixtures are not proof.
   Expect trouble with: double-line walls, walls as blocks, curved walls, xrefs.
3. **Verify BNBC Part 4 Ch. 3** (exit width, exit count, travel distance table 4.3.x,
   occupant load, capacity factors) against the gazette. Then switch those rules in
   `rules.ts` from `screening` to `verified` with exact clause numbers. Do not guess.
4. Dhaka Imarat Nirman Bidhimala 2008 FAR/MGC/setback tables (currently simplified ladder).
5. ~~Bangla font in PDF~~ Replaced by the printable HTML report (Bangla step 5). The jsPDF file stays
   English only and is labelled so.
6. Mobile layout pass (desktop checked at 1440 px only).
7. ~~Commit and push~~ Done: work is on `main` and pushed (auto-push is the standing rule).
8. ~~Rate limiter bug~~ Fixed 2026-11-19. `server.ts` now sets `trust proxy` (turn off with
   `TRUST_PROXY=0`) and prunes the `hits` map. `tests/server.test.ts` spawns the server and checks 45
   different client IPs get no 429 while one IP over 40/min is still blocked (fails if the fix is removed).
9. ~~Audit permitEngine~~ Done 2026-11-19. Found and fixed (covered by `tests/permit.test.ts`):
   - Correction-letter matcher used substrings: "farther than 16 m" was filed under Zoning (FAR) and
     "broad" matched "road". Now whole-word. A locked stair discharge is Fire & Egress, not stair geometry.
   - Checklist showed "pass" (and counted "ready") for checks that never ran (`audit.notChecked`) and
     for daylight, where the engine only checks a window exists, never the 15% area. Now "verify".
   - Trust labels inflated: dimension check labelled verified (it is a drawing check); 22.5 m sprinklered
     travel shown as verified (it is screening); high-rise item listed aviation/power NOCs and pressurised
     stairs as verified (only the >20 m definition is sourced). Extra clearances are now a separate
     `procedural` "not verified, confirm with authority" item. DIFE and professional-seal lists reworded
     as "typical, not verified".
   - Checklist rows now show a trust badge and the exported checklist includes the trust level.
   - Still open: `REGULATORY_CORPUS` clause text was not re-read against the gazette; the Gemini
     `/api/ai/interpret-corrections` output is only prompt-guarded, not validated against the audit.
10. ~~Lazy-load~~ Done 2026-11-19: Viewport3D, StepExport and StepPermits load on demand. Main chunk
    1,565 kB to 488 kB (gzip 444 to 141 kB). Still to do: screenshot-check these screens after lazy loading.
11. ~~Hand-calculated tests~~ Done 2026-11-19 (`tests/handchecked.test.ts`): a 36 x 4 m hall with one
    exit door measures 144 m2 and about 18 m travel, fails the 16 m limit, passes at 22.5 m if
    sprinklered. Sample-building baselines in `tests/engine.test.ts` are still circular (see caveat above).
12. Answer the open questions in `RESEARCH.md` section 8 (DXF vs PDF at RAJUK, BNBC Part 4 text).
13. Confirm Gemini works after deploy: `/api/health` must show `aiConfigured: true`. Model ids
    `gemini-4-hydrogen` / `gemini-embedding-2` are unconfirmed; failover to `gemini-2.5-flash`.

## Pitch notes

- Lead with the escape-time drop (e.g. 54.7 s → 36.7 s), then show a locked exit.
- Live demo: download a demo DXF, delete a door in AutoCAD, re-upload, findings change.
  This proves it is not hard-coded.
- Have one spare DXF tested end to end in case a judge asks "what if I upload mine".
- Say clearly: prototype, screening aid, not an approval; which limits are verified.
- "Where is the AI?" → labels and language, never the measurement. That is the design.

## Update log (add a line every time work is done; newest first)

- 2026-11-19: Real AI features. Design rule now "AI proposes, code verifies, a person approves". Gemini layout
  proposals + verifier, fix agent with approval gate (Fixes step), plan image reading (Upload step, ported from
  the parallel thread). No-AI search baseline solves 53/53 benchmark cases; hand-written fixes cover 26/53.
  Gemini numbers: see eval/ once measured. 110 tests pass.

- 2026-11-19: Language rules: homepage always English (`LangScope`), switch hidden there, no placeholder text when a Bangla string is missing, default English.
- 2026-11-19: Bangla step 8 and docs: README Bangla section, CLAUDE.md layout/limits updated; 94 tests pass.
- 2026-11-19: Bangla step 7: Bangla questions work offline and on the server; no-match answer; fixed stateful regexes and leaked test server.
- 2026-11-19: Bangla step 6: decode \U+ escapes and MTEXT codes in DXF text; Bangla room dictionary in both classifiers.
- 2026-11-19: Bangla step 5: printable HTML report (EN / BN / both) via the browser's print dialog.
- 2026-11-19: Bangla step 4: shared glossary (prompts, tests, on-screen machine-draft notice). Native review still needed.
- 2026-11-19: Bangla step 3: Bangla interface strings (typed dictionary), Bangla digits, Bangla rule names.
- 2026-11-19: Bangla step 2: number guard rejects AI text (EN or BN) containing a number not in the finding's data.
- 2026-11-19: Bangla step 1: language switch (EN / বাংলা / both) and Bangla shown in Report, Fixes, question box, review note.
- 2026-11-19: Fixed `CLAUDE.md`: env file is `.env` (dotenv ignores `.env.local`); restored the circular-test caveat.
- 2026-11-19: Bangla readiness audit and plan added (section "Bangla readiness plan"). No code changed.
- 2026-11-19: Fixed rate limiter behind proxy; audited and fixed permit checklist and correction-letter
  classifier (trust labels, false "pass", substring mis-routing); lazy-loaded heavy steps (main chunk
  488 kB); added 22 tests (62 total).
- 2026-11-18: Researched the problem; added `RESEARCH.md`; synced this file (rule count, permits step,
  tests, Render, rate-limit bug, circular-test caveat); rewrote README to match the design rule.
- 2026-11-18: Added Vitest suite (40 tests) and fixed esbuild peer conflict (`^0.27.0`); CI runs
  `npm ci` + `npm test`.
- 2026-11-18: Made Render-deployable (`render.yaml`, `npm start` via tsx, engines); removed the
  Cloud Run deploy workflow; renamed package to `drawfix-ai`.
- Earlier: author's AI Studio to DrawFix rewrite (see "What was changed" above).
