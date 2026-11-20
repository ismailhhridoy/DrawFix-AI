# DrawFix AI

Reads an AutoCAD **DXF floor plan**, measures every escape route, checks it against Bangladesh building
rules (BNBC 2012 and a simplified Dhaka rule set), proposes fixes, re-checks them, plays the escape in
3D, and exports a PDF. Built for the International AI Builders Congress 2026.

> **Prototype and screening aid. Not an approval.** Every finding shows how far to trust it.
> A licensed reviewer must confirm before anything is filed.

## Why

Deadly building fires in Bangladesh repeat the same drawing-level failures: a missing second stair
(Bailey Road, 2024, 46 dead), locked exits (Mirpur, 2025, 16 dead; Tazreen, 2012, 112+ dead). Checking
plans against the code falls on stretched teams across several agencies. DrawFix gives a reviewer a
measured first pass. It addresses whether people can **get out**, not how fires start.
Sources and open questions: [`RESEARCH.md`](RESEARCH.md).

## Design rule

**AI proposes. Code verifies. A person approves.**

- Every distance, width, area and pass/fail comes from plain TypeScript (`src/engine/ruleEngine.ts`).
- Gemini proposes layout fixes (move a door, add an exit, add a stair core, move a wall), drives a fix
  agent through tools (run audit, try edits, stage, finish), and traces plan images/PDFs into walls,
  doors and rooms. It also classifies room labels, rewords findings in English and Bangla, answers
  questions from the tool's reference notes and drafts a review note.
- Every proposal is applied to a copy and the whole audit re-runs; only proposals that clear their
  findings without creating new ones are kept, and none counts until a reviewer approves it.
- Gemini never outputs a measurement or a clause. With no Gemini key the app still works: fixed
  wording, and the agent runs the hand-written fixes through the same re-check.

### How the screens are laid out (2026-11-20)

- Six numbered steps: Upload, Review, Report, Fixes, 3D view, Export. Opened steps get a tick, and
  the black header button always offers the next step ("Next: Report"). Permit desk is a separate
  tool after the steps, not step 6.
- Report opens with a plain summary (must be fixed / worth a second look / passed / slowest escape)
  and one "See how to fix them" button; building totals, capacity estimates and version tracking are
  under "More details" below the findings.
- Fixes shows the before/after numbers and the list of changes first; the AI search panel is below,
  and its trace and approval list only appear once a search has run.
- Review starts with three things to check and keeps a "Run the checks" bar at the bottom of the
  screen; plot data is lower down and optional.

### AI features and how they are measured

- **Fixes step → AI design agent**: live trace of the agent's tool calls, "options for one finding",
  and an approval list. Approved changes drive the after-plan, 3D view and export.
- **Upload step → read a plan image**: Gemini traces the image; code scales it with the
  building width you type; you confirm rooms and exits in Review.
- `npm run eval:ai -- --server http://localhost:3000 --only fixes,agent,vision` measures all three
  against the synthetic demo buildings (needs `GEMINI_API_KEY`; set `RATE_LIMIT_PER_MIN=1000` for the
  server during the run). Results go to `eval/`.
- Each finding has a trust level: `verified` (limit read in the BNBC 2012 text), `screening`
  (prototype value, not checked against the gazette) or `drawing` (consistency check on the drawing).
  Today: 9 verified, 12 screening, 2 drawing rules.

## Bangla

The app starts in English. Switch the language in the header (**EN**, **বাংলা**, or **EN + বাংলা**) on any
working screen; the choice is remembered per browser. The homepage is always English.

- Interface, findings, proposed fixes, question answers and the review note are shown in Bangla.
- Numbers never change between languages; only the digits do. AI-written text (English or Bangla) is
  rejected and replaced with fixed wording if it contains a number that is not in the measured data.
- Export has a **printable report** in English, Bangla or both. The browser shapes Bangla correctly;
  use "Save as PDF" in the print dialog. The jsPDF download is English only.
- Bangla room labels in DXF files are read, including AutoCAD `\U+09B6`-style escapes.
- The question box understands Bangla questions without Gemini.
- The Bangla wording is a machine draft until a native speaker with building-code knowledge reviews
  it. The glossary is at `src/i18n/glossary.ts`.

## Run locally

```bash
npm install
cp .env.example .env     # optional: add GEMINI_API_KEY (https://aistudio.google.com/apikey)
npm run dev              # http://localhost:3000
npm run lint             # type-check
npm test                 # 116 tests (engine, hand-checked plan, permits, server, Bangla, AI verifier, versions)
```

`GET /api/health` shows whether Gemini is configured and which model is in use.

## Deploy on Render (free)

`render.yaml` is included. Push to GitHub, then Render, New, Blueprint, select the repo, and set
`GEMINI_API_KEY` (optional). Health check path: `/api/health`. Free instances sleep after about
15 minutes idle (about a minute to wake), so open the URL before a demo.

## /docs (pitch, technical documentation and live status)

Open `/docs` on the site. The page is built from `src/docs/`:

- `content.ts` holds every section as plain data. Edit text there; the Markdown download is generated from it.
- `features.ts` holds the feature matrix status. Counts and "works without AI" are computed on the server.
- `team.ts` holds team members. Photos go in `public/team/`; a missing photo shows initials.
- `diagrams.ts` holds the architecture and data-flow diagrams as data.

Not built yet: an in-page WYSIWYG editor, drag-to-reorder, and versioned content. Edits are made in the files above.

See `CLAUDE.md` for the full handoff, status and next steps.
