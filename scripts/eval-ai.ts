/**
 * Measures the AI features against the synthetic demo buildings, where the truth is known.
 *
 *   npm run dev            (with GEMINI_API_KEY in .env; RATE_LIMIT_PER_MIN=1000 recommended)
 *   npx tsx scripts/eval-ai.ts --server http://localhost:3000 --only fixes,agent,vision
 *
 * Writes eval/<feature>-<date>.json and eval/<feature>-<date>.md. Every pass/fail here is decided
 * by the rule engine (verifyCandidate / runBuildingAudit), never by Gemini.
 */
import fs from 'node:fs';
import path from 'node:path';
import { setApiBase } from '../src/engine/aiApi';
import { buildBenchmarkCases, loadSampleProject } from '../src/engine/fixBenchmark';
import { fixSpecToEdits, verifyCandidate } from '../src/engine/layoutEdits';
import { proposeAndVerify } from '../src/engine/aiLayoutProposer';
import { runFixAgent } from '../src/engine/fixAgent';
import { SAMPLE_BUILDINGS } from '../src/engine/sampleDxf';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const server = arg('server', 'http://localhost:3000');
const only = arg('only', 'fixes,agent').split(',');
const outDir = arg('out', 'eval');
const limit = Number(arg('limit', '0'));
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
setApiBase(server);
fs.mkdirSync(outDir, { recursive: true });

const pct = (a: number, b: number) => (b ? `${a}/${b} (${Math.round((a / b) * 100)}%)` : '0/0');

async function health() {
  const r = await fetch(`${server}/api/health`).then((x) => x.json()).catch(() => null);
  if (!r?.aiConfigured) {
    console.error('Gemini is not configured on the server (GET /api/health). Aborting.');
    process.exit(2);
  }
  return r as { model: string };
}

async function evalFixes(model: string) {
  let cases = buildBenchmarkCases();
  if (limit) cases = cases.slice(0, limit);
  const rows: Record<string, unknown>[] = [];
  for (const c of cases) {
    const hw = c.handWrittenAvailable
      ? c.targets.every((t) => verifyCandidate(c.project, c.audit, fixSpecToEdits(t, c.project)!, [t], 'rule').accepted)
      : null;
    const t0 = Date.now();
    const res = await proposeAndVerify(c.project, c.audit, c.targets, { rounds: 2, maxCandidates: 3 });
    const ms = Date.now() - t0;
    const r1 = res.all.filter((x) => x.round === 1);
    const first = r1.find((x) => x.rank === 0);
    const row = {
      id: c.id,
      set: c.set,
      targets: c.targets.length,
      handWritten: hw,
      source: res.source,
      geminiError: res.source !== 'gemini',
      round1Candidates: r1.length,
      refusedEdits: res.all.reduce((n, x) => n + x.refused.length, 0),
      firstTry: Boolean(first?.verdict.accepted),
      anyRound1: r1.some((x) => x.verdict.accepted),
      anyAfterRetry: res.all.some((x) => x.verdict.accepted),
      firstReason: first?.verdict.reason ?? 'no candidate',
      acceptedEdits: res.all.find((x) => x.verdict.accepted)?.descriptions.map((d) => d.en) ?? [],
      ms,
    };
    rows.push(row);
    if (row.geminiError && rows.length >= 4 && rows.filter((r) => r.geminiError).length / rows.length > 0.5) {
      console.error('More than half of the Gemini calls failed; check /api/health lastAiError. Aborting.');
      process.exit(3);
    }
    console.log(`${row.firstTry ? 'PASS' : row.anyAfterRetry ? 'pass*' : 'fail'}  ${c.id}  (${ms} ms)  ${row.firstReason.slice(0, 100)}`);
  }
  const sets = ['A', 'B', 'C', 'all'] as const;
  const lines = [
    `# Gemini layout-fix proposals, re-measured by the rule engine`,
    ``,
    `Run ${new Date().toISOString()}, model \`${model}\`, ${rows.length} cases from the 4 synthetic demo buildings.`,
    `"First try" = Gemini's first candidate in its first reply passes the re-check (target findings gone, nothing new fails or warns, no new trapped room).`,
    ``,
    `| Set | Cases | Hand-written fix exists | Hand-written passes | Gemini first try | Gemini any of 3 | Gemini after 1 retry |`,
    `|---|---|---|---|---|---|---|`,
  ];
  for (const s of sets) {
    const rs = rows.filter((r) => s === 'all' || r.set === s);
    const hwAvail = rs.filter((r) => r.handWritten !== null);
    lines.push(
      `| ${s} | ${rs.length} | ${pct(hwAvail.length, rs.length)} | ${pct(hwAvail.filter((r) => r.handWritten).length, rs.length)} | ${pct(rs.filter((r) => r.firstTry).length, rs.length)} | ${pct(rs.filter((r) => r.anyRound1).length, rs.length)} | ${pct(rs.filter((r) => r.anyAfterRetry).length, rs.length)} |`
    );
  }
  lines.push('', 'Set A: findings that have a hand-written fix. Set B: findings with none (travel distance, exit count). Set C: a ground-floor exit door deleted from the fixed building.', '');
  lines.push(`Gemini call errors (counted as fail above): ${rows.filter((r) => r.geminiError).length}.`, '');
  lines.push(`Edits refused before the check (unknown id or out of bounds): ${rows.reduce((n, r) => n + (r.refusedEdits as number), 0)}. Median time per case: ${median(rows.map((r) => r.ms as number))} ms.`, '');
  lines.push('| Case | First try | After retry | Engine reason (first candidate) | Accepted change |', '|---|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.id} | ${r.firstTry ? 'pass' : 'fail'} | ${r.anyAfterRetry ? 'pass' : 'fail'} | ${String(r.firstReason).replace(/\|/g, '/')} | ${(r.acceptedEdits as string[]).join('; ').replace(/\|/g, '/')} |`);
  write('fixes', rows, lines);
}

async function evalAgent(model: string) {
  const rows: Record<string, unknown>[] = [];
  const projects: { id: string; project: ReturnType<typeof loadSampleProject> }[] = SAMPLE_BUILDINGS.map((s) => ({ id: s.id as string, project: loadSampleProject(s.id) }));
  const cCases = buildBenchmarkCases(['C']).filter((c) => /minus-EXIT_(MAIN|WEST|FIRE)/.test(c.id));
  for (const c of cCases) projects.push({ id: c.id, project: c.project });
  for (const p of limit ? projects.slice(0, limit) : projects) {
    const t0 = Date.now();
    const run = await runFixAgent(p.project, { maxSteps: 30, policy: 'gemini' });
    const rules = await runFixAgent(p.project, { policy: 'rules' });
    const row = {
      id: p.id,
      steps: run.steps.length,
      tries: run.tries,
      acceptedTries: run.acceptedTries,
      staged: run.staged.length,
      before: `${run.baseAudit.failCount} fail / ${run.baseAudit.warnCount} warn`,
      afterGemini: `${run.stagedAudit.failCount} fail / ${run.stagedAudit.warnCount} warn`,
      afterRules: `${rules.stagedAudit.failCount} fail / ${rules.stagedAudit.warnCount} warn`,
      escape: `${run.baseAudit.worstEscapeSec.toFixed(1)} s -> ${run.stagedAudit.worstEscapeSec.toFixed(1)} s`,
      stopped: run.stoppedBecause,
      ms: Date.now() - t0,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const lines = [
    `# Fix agent (Gemini drives the tools, the engine measures)`,
    ``,
    `Run ${new Date().toISOString()}, model \`${model}\`. Up to 30 tool calls per building. "Fixed rules" = the same loop using only the hand-written fixes.`,
    ``,
    `| Building | Before | Agent staged | After (Gemini agent) | After (fixed rules) | Tries accepted | Slowest escape | Stopped because |`,
    `|---|---|---|---|---|---|---|---|`,
    ...rows.map((r) => `| ${r.id} | ${r.before} | ${r.staged} | ${r.afterGemini} | ${r.afterRules} | ${r.acceptedTries}/${r.tries} | ${r.escape} | ${String(r.stopped).replace(/\|/g, '/')} |`),
  ];
  write('agent', rows, lines);
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}
function write(name: string, rows: unknown, lines: string[]) {
  const base = path.join(outDir, `${name}-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(rows, null, 2));
  fs.writeFileSync(`${base}.md`, lines.join('\n') + '\n');
  console.log(`\nWrote ${base}.md`);
}

const h = await health();
if (only.includes('fixes')) await evalFixes(h.model);
if (only.includes('agent')) await evalAgent(h.model);
if (only.includes('vision')) {
  const { evalVision } = await import('./eval-vision');
  await evalVision(h.model, outDir, stamp);
}
