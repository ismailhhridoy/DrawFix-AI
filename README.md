# PlanCheck AI

**Deterministic BNBC fire-egress compliance checker, CAD DXF floor-plan analyzer, and 3D fire-escape simulator for Bangladesh.**

Upload a DXF floor plan → get an instant compliance report against BNBC 2020/2012, Imarat Bidhimala 2008, and FSCD rules — with bilingual (English + বাংলা) violation explanations powered by Gemini AI, before/after remediation comparison, and a 3D escape-time simulation.

---

## ✨ Features

| Feature | Detail |
|---|---|
| DXF parser | Reads AutoCAD DXF layers (walls, doors, stairs, room labels); AI-assisted layer convention inference |
| Rule engine | Travel distance (16 m / 22.5 m sprinklered), corridor width, FAR/MGC ratios, setbacks, habitability |
| A\* pathfinding | Per-room escape times; multi-floor routes through stairs |
| 3D simulation | Three.js walkthrough of before/after escape paths |
| AI explanations | Bilingual violation summaries grounded in rule-engine output (Gemini) |
| RAG copilot | Ask questions about BNBC clauses; hybrid BM25 + embedding retrieval |
| Deficiency memo | RAJUK/FSCD-style pre-submission memo (EN + বাংলা) |
| PDF export | jsPDF report with all findings and remediation summary |
| Sample buildings | Mirpur RMG factory, Dhanmondi residential block, Gazipur 3-floor complex |

---

## 🚀 Local development

### 1. Install dependencies

```bash
npm install --legacy-peer-deps
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY="your-key-here"   # https://aistudio.google.com/apikey
APP_URL="http://localhost:3000"
```

> The app works **without** a Gemini key — AI features fall back to template strings. You can test the DXF parsing, rule engine, and 3D simulation with no key at all.

### 3. Start the dev server

```bash
npm run dev
```

Open **http://localhost:3000** — the Gazipur 3-floor complex loads automatically.

### 4. Build for production

```bash
npm run build      # outputs to dist/
npm start          # serves the dist/ build on port 3000
```

---

## ☁️ Deploy to Render (free)

`render.yaml` is included.

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo (or **New → Web Service** and use the build/start commands from `render.yaml`).
3. When prompted, set `GEMINI_API_KEY` (optional — without it the AI features use template fallbacks).
4. Deploy. Health check: `/api/health`.

Free instances sleep after ~15 min idle (about 1 min to wake) — open the URL once before a demo.

## 📁 Project structure

```
server.ts              Express API (AI endpoints, Vite middleware)
src/
  App.tsx              Root state machine — 7 steps
  components/          UI step components + Blueprint2D + Viewport3D
  engine/
    dxfParser.ts       DXF → ParsedFloorPlan
    ruleEngine.ts      BNBC compliance (deterministic)
    pathfinding.ts     A* escape routing (single + multi-floor)
    bnbcCorpus.ts      Regulatory clause database (inline)
    aiFallback.ts      Gemini API client + template fallbacks
    sampleDxf.ts       Built-in sample buildings
  types/plan.ts        Shared TypeScript types
index.html             SPA entry
vite.config.ts         Vite + Tailwind + React config
```

---

## 📜 Regulatory scope

| Document | Coverage |
|---|---|
| BNBC 2012 Part 3 Ch. 1 | Egress travel distance (16 m), corridor width (0.75 m) |
| BNBC 2020 Part 4 Ch. 3 | Sprinklered allowance (22.5 m), FAR/MGC tables |
| Imarat Bidhimala 2008 | RAJUK setbacks, floor area ratio by road width |
| FSCD Checklist | High-rise NOC trigger (>20 m), fire-lift requirements |

> **Disclaimer**: PlanCheck AI is a screening tool. All findings require review by a licensed engineer and official RAJUK/FSCD officer before filing.
