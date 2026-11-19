# DrawFix AI: full project handoff

Written 2026-11-19 (Dhaka evening) from the repo's `main` branch (commit d561b89) and the project notes.
This file is self-contained. A person or another Claude can understand and continue the project from it
with no other context. It contains no secrets.

- Repo: https://github.com/ismailhhridoy/DrawFix-AI (source of truth; `main`)
- Live app: https://drawfix-ai.onrender.com (Render free tier; sleeps when idle, open it a minute before a demo)
- Owner and founder: Ismail H Hridoy (team Tallisor)
- Built for: International AI Builders Congress 2026 hackathon, track **CivicSphere AI → GovCopilot**
  ("Faster, auditable service delivery")

---

## 1. What it is, in one paragraph

DrawFix AI checks a building's floor plan against Bangladesh's building code **before it is filed with
RAJUK** (the Dhaka approval authority). An architect or a plan-review officer uploads an AutoCAD DXF (or a
plan image/PDF), and DrawFix finds the rooms, doors, exits and stairs, measures every escape route, checks
23 rules from BNBC 2012 and the Dhaka building rules, shows each finding on the drawing with a trust level,
proposes fixes that the rule engine re-checks, and lets a person approve them. The revised drawing can then
be compared with the earlier one (cleared / new / still open). Reports come in English and Bangla.

**The problem it solves:** faster government scrutiny and fewer correction rounds. Plans go back and forth
between the architect and RAJUK reviewers; each round costs weeks. DrawFix gives the architect a pre-check
before filing, and gives the reviewer a measured first pass. Fire escape is one feature among several
(zoning, room standards, stair geometry and drawing accuracy are also checked), and it is the one with the
strongest human stakes.

**Core design rule (do not break):** **AI proposes. Code verifies. A person approves.**

---

## 2. The problem and the evidence

Full sources with confidence tags are in `RESEARCH.md` in the repo. Key facts:

### The approval loop (the main pitch)
- RAJUK runs an online permit system, **ECPS** (ecps.gov.bd). Its own pages say the building construction
  committee approves a design "within 45 days of submission", depending on meeting frequency. [confirmed: official site]
- Each application passes through several reviewers (AO, AAO, Chief Inspector, Inspector, Tracer). The officer
  workflow has an "Applicants' Clarifications" tab: this is where correction rounds happen. [confirmed]
- RAJUK's own review checklists (DCQR) include **Means of Egress**, smoke and heat vents, fire fighting,
  fire detection and alarm, and a 130-item blank checklist. So egress is an official review item. [confirmed]
- Reported volume: 10,985 online permit applications in seven months, 7,993 approved. [single-source]
- Enforcement is split across RAJUK, city corporations and the Fire Service; the authority meant to enforce
  BNBC 2020 (BBRA) was reported as not yet set up. [single-source]

### Why the egress check matters
- Bangladesh records about 27,000 fires a year (2024: 26,659 fires, 140 deaths; 2025: about 27,059, 85 deaths). [confirmed]
- Most fires start from electrical faults, cigarettes and stoves, which a plan check cannot see.
  **Pitch it as "can people get out", never "prevents fires".**
- The deadliest recent cases failed on drawing-level basics:
  - **Bailey Road, Dhaka, 2024:** 46 dead. One staircase where two were required, no fire exits, stair blocked.
  - **Mirpur, Oct 2025:** 16 dead. Padlocked roof door.
  - **Tazreen, 2012:** 112+ dead. Locked exits.
- **Do not cite** the 66% / 60% / 40% / 37.39% "non-compliance" figures that circulate online. Their original
  documents were never found.

### Honest limits (say them before a judge does)
- Padlocks and changes of use happen **after** approval. A drawing check sees only the drawing, plus what a
  reviewer ticks in the Review step (Exit / Locked per door).
- 12 of the 23 rules use screening values that have not been checked against the gazette text.
- No real Bangladeshi architect's DXF has been tested yet (synthetic demo plans only).
- Whether RAJUK's ECPS accepts DXF/DWG at upload is unknown (the form is behind login). One architect told the
  team architects work in CAD files.

### Buyers and competition
- Realistic buyers: approval offices (RAJUK, city corporations), architects and developers checking before
  filing, insurers.
- Closest competitor: **Archistar AI PreCheck** (Australia/US/Canada; City of Austin contract 2024). The
  difference: BNBC and Dhaka rules, Bangla, and 2D DXF input instead of BIM, with every limit labelled by how
  far it can be trusted. Not a new category.
- Why a fixed rule engine and not "Document RAG": RAG over legal text can misquote a clause, and a wrong
  fire-safety citation is worse than less flexibility.

---

## 3. The product, step by step

The app has a landing page and seven working steps:

1. **Upload:** an AutoCAD DXF, or a plan image/PDF that Gemini traces (see AI features). A DWG gets a clear
   message to save it as DXF (`SAVEAS DXF`). Four synthetic demo buildings are built in.
2. **Review:** plan preview beside the room table, exits table, parser notes. The reviewer can tick each door
   as Exit or Locked and enter plot data (plot area, road width, setbacks). Nothing is invented: plot data
   stays empty until a person enters it.
3. **Report:** every finding on the plan with a trust badge, a "How far to trust this report" panel and a
   "Not checked" list (what could not be assessed and why). Includes a question box over reference notes.
   **Version compare** lives here (section 7).
4. **Fixes:** the AI fix agent and approval list (section 5).
5. **3D:** escape replay of the before and after plans, with escape times.
6. **Permits:** permit checklist and correction-letter handling (classifies a RAJUK correction letter's items
   into categories). Procedural items are marked "not verified, confirm with the authority".
7. **Export:** jsPDF report (English only) and a printable HTML report in English, Bangla or both.

### Parser (works on drawings it was not written for)
- Rooms from room polylines, or from the areas the walls enclose when there are none.
- Door widths measured from the wall gap; doors drawn as an arc beside a gap are detected.
- With no named exits, ground-floor doors in the outer wall are taken as exits (and the parser says so).
- Wall layer falls back to wall-like names, then to the layer with the most line work.
- Units from `$INSUNITS` (mm, cm, m, inches, feet). Bad files get a clear error.
- Bangla labels read, including AutoCAD `\U+09B6`-style escapes and MTEXT formatting codes.

### Demo results (computed live by the engine)

| Demo plan | Before | After fixes | Slowest escape |
|---|---|---|---|
| Gazipur 3-storey garment factory (RMG) | 9 fail, 7 warn | 0 / 0 | 54.7 s → 36.7 s |
| Gazipur multi-wing L2 | 7 fail, 4 warn | 0 / 0 | 31.3 s → 12.7 s |
| Mirpur RMG floor 4 | 6 fail, 2 warn | 0 / 0 | 24.7 s → 16.7 s |
| Dhanmondi residential L3 | 5 fail, 4 warn | 0 / 0 | 26.7 s → 12.1 s |

Caveat: these baselines were recorded from the engine's own output, so they catch regressions but do not prove
correctness. Only `tests/handchecked.test.ts` checks the engine against arithmetic done by hand (a 36 x 4 m hall
with one exit: 144 m², about 18 m travel, fails the 16 m limit, passes 22.5 m if sprinklered).

---

## 4. The 23 rules

All rules are registered in `src/engine/rules.ts` (name, Bangla name, citation, trust level, note). Every
finding carries a **trust level**:

- `verified`: limit read in the BNBC 2012 text, Part 3 Ch. 1
  (https://law.resource.org/pub/bd/bnbc.2012/gov.bd.bnbc.2012.03.01.pdf). **9 rules.**
- `screening`: prototype value; the governing clause (BNBC Part 4 Ch. 3, Dhaka Imarat Nirman Bidhimala 2008)
  is **not verified** against the gazette. A reviewer must confirm. **12 rules.**
- `drawing`: consistency check on the drawing itself, not a code rule. **2 rules.**

Grouped by topic: **15 fire and escape, 3 room standards, 3 zoning, 2 drawing checks** (= 23).
(An earlier summary said "2 room standards"; counting `rules.ts` gives 3, because the window check sits with
the two bedroom-size rules.)

| # | Rule | Topic | Trust |
|---|---|---|---|
| 1 | Cabin farther than 16 m from an exit | Fire & escape | verified |
| 2 | Long travel distance to exit | Fire & escape | screening |
| 3 | No walking route to any open exit | Fire & escape | screening |
| 4 | Passage clear width below 0.75 m | Fire & escape | verified |
| 5 | Staircase clear headroom below 2.15 m | Fire & escape (stair) | verified |
| 6 | Staircase handrail height below 0.90 m | Fire & escape (stair) | verified |
| 7 | Stair riser/tread proportion out of range | Fire & escape (stair) | verified |
| 8 | High-rise building (above 20 m) | Fire & escape | verified |
| 9 | Locked or obstructed exit door | Fire & escape | screening |
| 10 | Exit door narrower than 0.90 m | Fire & escape | screening |
| 11 | Fewer than two independent exits | Fire & escape | screening |
| 12 | Stair does not continue to ground floor | Fire & escape | screening |
| 13 | Stair has no open route to the street | Fire & escape | screening |
| 14 | Ground exit width low for occupant load | Fire & escape | screening |
| 15 | Stair width low for upper-floor load | Fire & escape | screening |
| 16 | Sleeping room below 9.5 m² (Sec 1.13.2.2) | Room standards | verified |
| 17 | Sleeping room narrower than 2.9 m | Room standards | verified |
| 18 | No window found on a habitable room | Room standards | verified |
| 19 | Ground coverage above screening limit | Zoning | screening |
| 20 | FAR above screening limit | Zoning | screening |
| 21 | Setback below screening minimum | Zoning | screening |
| 22 | Dimension text does not match the geometry | Drawing | drawing |
| 23 | No exit could be identified on this floor | Drawing | drawing |

Rules for the rules:
- Never present a `screening` limit as law. Never add a clause number nobody has read.
- Stair headroom/handrail/riser/tread are checked only when the drawing states them (`HEADROOM=… HANDRAIL=…`
  text); otherwise they go to "Not checked". Zoning is checked only after a person enters plot data.
- A blocked room is reported as "No route", never as a fake distance.

---

## 5. AI features and the Gemini setup

### What Gemini does, and what it never does
- Every distance, width, area, pass/fail and limit comes from plain TypeScript. Gemini **never outputs a
  measurement, a limit or a clause number**.
- Gemini **proposes**; code **verifies**; a person **approves**.

### The three real AI features (all on `main`)
1. **AI layout-fix proposals** (`src/engine/layoutEdits.ts`, `aiLayoutProposer.ts`). Gemini proposes edits in a
   small edit language: unlock / widen / move a door, add an exit door, move a wall, add a stair core, set a
   stair value, fix a dimension text. Each edit is validated (ids exist, values inside `EDIT_BOUNDS`), applied
   to a copy, and the full audit re-runs (`verifyCandidate`). A proposal is kept only if its target findings
   are gone and nothing new fails or warns. Two rounds, with the engine's reasons fed back.
2. **Fix agent with an approval gate** (`src/engine/fixAgent.ts`, `AiFixAgentPanel.tsx`, Fixes step). The agent
   works through tools: run_audit, get_floor, try_edits, stage, finish. The screen shows a live trace,
   "options for one finding", and an approval list with undo. Nothing changes the "after" plan until the
   reviewer ticks it (`applyApprovedChanges` re-applies and re-audits). Approved changes drive the after-plan,
   3D view and export.
3. **Plan image/PDF reading** (`src/engine/visionPlan.ts`, `VisionUpload.tsx`, Upload step). Gemini traces walls,
   doors, rooms and stairs in 0-1000 image units only. Code scales them to metres from a building width the
   reviewer types, and every element goes to Review for confirmation. Needs Gemini.

Gemini also: classifies room labels, rewords findings in English and Bangla, answers questions from the
reference notes, and drafts a review note (which says it is not an approval).

### Guardrails
- **Number guard** (`src/engine/numberGuard.ts`): any AI sentence (English or Bangla) containing a number that
  is not in the finding's own data is rejected and replaced with fixed wording. Bangla digits are converted
  before checking. Rounding to fewer decimals is allowed; dotted clause numbers must match exactly. Numbers
  written as words are not caught.
- Gemini replies are validated (unknown room ids or room types dropped).
- **If Gemini is off or fails, the whole app still works:** fixed wording, keyword room labels, and the agent
  runs the hand-written fixes through the same verifier (labelled "Fixed rules"). Only image reading needs Gemini.
- Server rate limit: 40 requests/min/IP (`trust proxy` on; `TRUST_PROXY=0` turns it off).

### Configuration (`server.ts`, `aiDesignRoutes.ts`)
- Env vars (all optional): `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_EMBEDDING_MODEL`,
  `PORT`, `TRUST_PROXY`, `RATE_LIMIT_PER_MIN`. The server reads `.env` only (not `.env.local`).
- Models are tried in order; the first that answers is remembered. Code defaults today: primary
  `gemini-4-hydrogen`, fallback `gemini-3.1-flash-lite`, embeddings `gemini-embedding-2`. (CLAUDE.md still says
  the fallback is `gemini-2.5-flash`; the code is the truth.) These model ids are unconfirmed in production.
- The placeholder key `MY_GEMINI_API_KEY` counts as "no key".
- `GET /api/health` reports `aiConfigured` and the model; the header shows Gemini on/off.
- AI endpoints: `/api/ai/propose-layout-fixes`, `/api/ai/agent-step`, `/api/ai/read-plan-image`, plus the
  explanation, question, review-note and `/api/ai/interpret-corrections` endpoints in `server.ts`.

### Measuring the AI
- `fixBenchmark.ts`: 56 benchmark cases (sets A/B/C) from the demo buildings.
- No-AI baselines: hand-written fixes cover 26 of 56 cases (all 26 pass); a brute-force search
  (`searchBaseline`) solves 53 of 53 attempted.
- `npm run eval:ai -- --server http://localhost:3000 --only fixes,agent,vision` measures the three features
  (needs a Gemini key; set `RATE_LIMIT_PER_MIN=1000` on the server). Results go to `eval/`. **Gemini's own
  numbers have not been measured yet** because no real key has been available. Report them next to the
  baselines honestly when they exist, even if Gemini scores below the search baseline.

---

## 6. Bangla support

Goal: a Bangla-speaking reviewer can use the whole flow in Bangla, upload plans with Bangla labels and take
away a Bangla report, with no number changing between languages.

- **Language switch** in the header: EN / বাংলা / EN + বাংলা, remembered per browser (`drawfix.lang`), sets
  `<html lang>`. The app starts in English; the **homepage is always English**.
- Interface strings: typed dictionaries `src/i18n/en.ts` and `bn.ts` (a missing Bangla key fails the
  type-check), Bangla digits for numbers, Bangla rule names.
- Findings, fix summaries, question answers and the review note are shown in Bangla (fixed templates without
  Gemini; Gemini text passes the number guard).
- **Glossary** of 37 code terms (`src/i18n/glossary.ts`) used by templates and Gemini prompts; tests reject the
  "avoid" variants.
- **Printable report** in English, Bangla or both (`PrintReport.tsx`, browser print dialog, "Save as PDF").
  The browser shapes Bangla conjuncts correctly. The jsPDF download is English only.
- **Bangla in drawings:** UTF-8 labels and AutoCAD `\U+XXXX` escapes are decoded; a Bangla room dictionary
  (শয়নকক্ষ, রান্নাঘর, টয়লেট, …) classifies rooms.
- **Bangla questions offline:** Bangla synonym map; a question that matches no note returns "no reference note
  matched" instead of a made-up answer.
- Still English in Bangla mode: parser notes, "Not checked" reasons, basis notes, names from the DXF, sample
  descriptions, permit checklist and correction-letter text, the jsPDF file.
- **The Bangla is a machine draft. It has not been reviewed by a native speaker with building-code knowledge.**
  The on-screen notice saying so was removed at Ismail's request (finished-product look); track it internally.
- Bijoy/SutonnyMJ-encoded DXF text is not converted; waiting for a real file that uses it.

---

## 7. Version compare (resubmission)

`src/engine/resubmission.ts` (`compareVersions`) and `VersionCompare.tsx`, in the Report step:
1. Save the current audit as version 1.
2. Upload the revised DXF.
3. See which findings **cleared**, which are **new** and which are **still open**.

This is exactly what a correction round needs and is central to the "fewer correction rounds" story.
English only for now. Tests: `tests/resubmission.test.ts`.

---

## 8. Tech stack and architecture

- **Frontend:** React 19, Vite 8, Tailwind CSS 4, three.js (3D replay), motion, lucide-react, jsPDF.
- **Backend:** Express 4 server (`server.ts`) run with `tsx`; serves the Vite app and the `/api/*` Gemini
  endpoints. Gemini via `@google/genai`.
- **DXF parsing:** `dxf-parser` plus own geometry code.
- **Language:** TypeScript throughout. Tests: Vitest. Node 20+ (Render uses 22).
- Original version was generated with Google AI Studio, then largely rewritten.

```
server.ts                Express + Vite; /api/* Gemini endpoints, model fallback, rate limit, /api/health
aiDesignRoutes.ts        /api/ai/propose-layout-fixes, /api/ai/agent-step, /api/ai/read-plan-image
src/types/plan.ts        All types (Violation has basis, basisNote, blocked)
src/engine/
  dxfParser.ts           DXF -> ParsedFloorPlan (units, wall fallback, doors, exits, stairs, rooms)
  geometry.ts            Wall openings, enclosed regions, polygon utils
  rules.ts               The 23-rule registry (name, nameBn, citation, basis, note)
  ruleEngine.ts          runBuildingAudit(), hand-written remediation fixes
  pathfinding.ts         A* navigation grid, multi-floor escape, narrow passages
  layoutEdits.ts         Edit language, validation, apply to copy, verifyCandidate
  aiLayoutProposer.ts    Gemini proposals -> validate -> verify
  fixAgent.ts            Agent loop + applyApprovedChanges
  visionPlan.ts          Plan image/PDF trace -> plan, scaled by reviewer width
  fixBenchmark.ts        56 benchmark cases + no-AI search baseline
  numberGuard.ts         Rejects AI text with numbers not in the data
  resubmission.ts        Version compare
  permitEngine.ts        Permit checklist + correction-letter classifier
  localIntelligence.ts   Non-LLM room classification, question box, triage
  banglaText.ts          \U+ decoding, MTEXT cleanup, Bangla room words and query synonyms
  aiFallback.ts          Fixed EN/BN wording; client calls to /api
  bnbcCorpus.ts          Reference notes for the question box, each with a trust level
  sampleDxf.ts           4 synthetic demo buildings written as real DXF text
src/i18n/                LangProvider, useLang, en.ts, bn.ts, digits.ts, glossary.ts
src/components/          LandingPage, StepUpload/Review/Report/Compare(Fixes)/Permits/Export,
                         Viewport3D, Blueprint2D, AiFixAgentPanel, VisionUpload, VersionCompare, PrintReport
tests/                   Vitest suites (see section 9)
scripts/                 eval-ai.ts, eval-vision.ts, render-vision-fixtures.ts
render.yaml              Render Blueprint (the Dockerfile is unused and untested)
CLAUDE.md, README.md, RESEARCH.md   Project notes (kept as separate files)
video/                   Remotion project for the launch film (on its own branch, see section 12)
```

Heavy steps (3D, Export, Permits) are lazy-loaded; the main chunk is about 488 kB (141 kB gzip).

### Deploy on Render
- `render.yaml`: free web service, `npm install && npm run build`, start `npm start`
  (`NODE_ENV=production tsx server.ts`), health check `/api/health`, `NODE_VERSION=22`.
- `GEMINI_API_KEY` is set in the Render dashboard (never in the repo). The app works without it.
- Free instances sleep after about 15 minutes idle and take about a minute to wake.
- Live URL: https://drawfix-ai.onrender.com. **Check `/api/health` shows `aiConfigured: true`** before relying
  on AI in a demo.

---

## 9. How to run it and test it

```bash
git clone https://github.com/ismailhhridoy/DrawFix-AI && cd DrawFix-AI
npm install
cp .env.example .env     # optional: put a real GEMINI_API_KEY in .env (https://aistudio.google.com/apikey)
npm run dev              # http://localhost:3000
npm run lint             # type-check (tsc --noEmit)
npm test                 # Vitest
npx vite build           # production build
npm start                # production server
```

- **116 tests** at the last count (CLAUDE.md, 2026-11-19), in `tests/`: engine baselines, hand-checked plan,
  permits, server (spawns the server; rate limit), Bangla, AI design (verifier, validation, agent gate with a
  stubbed Gemini), vision, labels, resubmission, DWG message.
- After a failing run, re-run only the failing tests while fixing.
- `esbuild` is pinned at `^0.27.0` (npm install failed otherwise).
- Live demo trick that proves nothing is hard-coded: download a demo DXF, delete a door in AutoCAD, re-upload,
  and watch the findings change.

---

## 10. Landing page positioning

- Hero tags: "For architects", "For plan review officers", "Bangladesh building rules".
- **Headline: "Faster government scrutiny. Validated before filing."**
- Lead: DrawFix AI reads AutoCAD DXF floor plans and checks them against Bangladesh building rules (zoning,
  habitability, stair geometry, dimension accuracy and fire egress). On the demo building, fixing the locked
  exit and missing stair cuts the slowest escape from 54.7 s to 36.7 s (numbers filled in live). Built for review
  officers who need a first-pass audit and architects checking plans before submission.
- **Primary button: "Test Demo CAD Drawing"**; secondary: "Permit & Corrections Desk".
- Showcase panels use real engine output on the demo building.
- Plain language, architect first, review officers second. No air-gapped or "100% local" claims (Gemini sends
  data), no invented time-saved stats, no official-looking certificates.
- Known tension: the word "Validated" is in the headline while 12 of 23 rules are screening values. Kept by
  choice; be ready to explain the trust levels.
- The most recent commit (d561b89) reverted an experimental "unslop" landing redesign and restored the original
  landing design.

---

## 11. Competition submission status

- Platform: cloudcampbd.com. Phase: "Idea to Unicorn — Preliminary Submission".
- **Due: Nov 20, 2026, 11:59 PM Dhaka time (GMT+6).**
- **Draft is saved.** 8 of 9 required fields are filled; **only the YouTube link is missing (pending the video)**.
- Last known scores (2026-11-19): Submission Score 142/215 (Story 30, Proof 12, AI 67, Data 11, Ready 22);
  Pre-Judgment 238/425.
- Filled: project name, elevator pitch, public summary, problem statement, solution description, data and AI
  provenance, tooling and IDE, 4 prompts in the Prompt Library, demo/live links (Render app, README, RESEARCH,
  health endpoint). The app has no login, so the test-credentials field says so.
- Updated field texts that match the current app are in `submission/updated-fields.md` in the project files
  (elevator pitch, public summary, problem statement, solution description; evaluation now "116 Vitest tests";
  data lifecycle adds version comparison).
- Deliberately left blank because the app does not use them: vector/graph database, local LLMs, n8n,
  fine-tuning, storage (nothing is stored). Do not claim RAG or MCP in the product.
- Never fill, save or submit the form without Ismail's go-ahead.

Elevator pitch (current):
> DrawFix AI checks a building's floor plan against Bangladesh's building code before it goes to RAJUK, shows
> every escape-route problem on the drawing, and proposes fixes the code re-checks, so plans need fewer
> correction rounds.

---

## 12. Launch video status

- One film serves as the competition's required YouTube video and as a YC-style launch video.
- **Cut 1 is rendered:** `drawfix-film-v1.mp4`, 1920x1080, 30 fps, about 1:57. Sent to Ismail for review;
  **not yet approved**.
- Project files: `video/drawfix-film-v1.mp4`, `video/drawfix-film-captions-en.srt` (29 English cues),
  `video/youtube-details.md` (title, description, visibility), `video/drawfix-launch-film-handoff.md`
  (full video handoff: script, shot list, render steps).
- Built in Remotion (repo folder `video/`, branch `claude/project-thread-0hpoio`). Scenes use real engine output
  for the sample plan; stock footage from Pexels; voice is the Mac "Rishi" Indian-English voice.
- Story: opens and closes on a staircase. Bailey Road stakes → RAJUK approval loop → upload, 23 rules, 9 failures,
  trust levels → AI proposes, code re-checks, a person approves → 9 failures to 0, 54.7 s to 36.7 s → version
  compare and Bangla report → honest limit (can't see a padlock added later, can see a missing staircase) →
  "Two staircases. Checked before it's filed."
- Planned upgrade: a Gemini TTS voice with a Bangladeshi accent. Blocked until the Mac `.env` holds a real
  Gemini key (it holds the placeholder).
- YouTube title: "DrawFix AI: building plans checked before they're filed". Visibility Unlisted unless the
  competition asks for Public. Description discloses: screening aid, not an approval; test plan, not a real
  building; Pexels footage; AI voice.
- Next: Ismail reviews cut 1 → apply notes and re-render → upload to YouTube → paste the link into the
  submission form before the deadline.

---

## 13. Ismail's standing rules

1. **Auto-push to `main`.** All work goes to the GitHub repo and is pushed without asking. Commit and push
   from a cloud clone. On Ismail's Mac folder (`~/Work/Projects/Competition/drawfix-ai`) only the `.md` notes are
   kept in sync; do not change code there.
2. **No demo, beta, prototype, placeholder or disclaimer bars in the UI.** The app must look finished.
   Honesty lives in the data instead: per-finding trust badges, the "Not checked" list, and the review note's
   "not an approval" line.
3. **Never ask about team members** (for example NRB or female-member fields on the submission form). Skip those.
4. Keep `CLAUDE.md`, `RESEARCH.md` and `README.md` as separate files. After every work session add an update-log
   line to `CLAUDE.md`, new findings (with a confidence tag and source) to `RESEARCH.md`, and changed behaviour
   to `README.md`. Never delete earlier content; mark wrong text as corrected, with the date and reason.
5. Never put a secret (such as the Gemini key) in the repo, a log or a message. Never put a model name in
   commits or repository files.

---

## 14. Open items

**Needs people or materials:**
1. **Native Bangla review** of `src/i18n/bn.ts`, `glossary.ts`, the Bangla templates in `aiFallback.ts` and
   `ruleEngine.ts`, and the Bangla reference notes. Until then the Bangla is a machine draft.
2. **A real DXF** from a Bangladeshi architect, ideally with Bangla labels. Synthetic fixtures are not proof.
   Expect trouble with double-line walls, walls as blocks, curved walls and xrefs. It also decides whether
   Bijoy/SutonnyMJ conversion is needed.
3. **The Gemini key.** No real key exists in cloud sessions, and the Mac `.env` holds a placeholder. Needed to:
   confirm `/api/health` shows `aiConfigured: true` on Render, run the Gemini eval (`npm run eval:ai`), and make
   the Bangladeshi-accent voice. Confirm the model ids work.
4. **YouTube link** for the submission, after Ismail approves the film.
5. The competition's exact wording on Bangla (UI? output? input? voice?).

**Engineering and verification:**
6. Verify BNBC Part 4 Ch. 3 (exit width, exit count, travel distance tables, occupant load) against the gazette,
   then move those rules from screening to verified with exact clause numbers. Map RAJUK's DCQR "Means of
   Egress" checklist to `rules.ts`.
7. Dhaka Imarat Nirman Bidhimala 2008 FAR / ground coverage / setback tables (currently a simplified ladder).
8. Screenshot-check the 3D and Export screens after the latest changes; mobile layout pass (desktop checked
   at 1440 px only).
9. Version compare and the remaining English-only strings in Bangla mode.
10. `/api/ai/interpret-corrections` output is only prompt-guarded, not validated against the audit.
11. Answer: does RAJUK's ECPS accept DXF/DWG at upload, or only PDF?

---

## 15. Pitch notes

- Lead with the approval loop (45 days, many reviewers, correction rounds), then the demo: escape time drops
  54.7 s → 36.7 s, failures 9 → 0, then show a locked exit.
- "Where is the AI?" → it proposes layout fixes, drives the fix agent and reads plan images. The code measures
  and verifies, and a person approves. That is the design.
- Say clearly: a screening aid, not an approval; which limits are verified; padlocks after approval are outside
  a drawing check.
- Have one spare DXF tested end to end in case a judge asks "what if I upload mine".
