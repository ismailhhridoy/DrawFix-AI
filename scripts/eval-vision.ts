/**
 * Plan reading from images: Gemini traces each rendered demo floor (eval/vision-fixtures/*.png),
 * code scales it with the true building width (as a reviewer would type it), and the result is
 * scored against the DXF geometry it was drawn from. Run through scripts/eval-ai.ts --only vision.
 */
import fs from 'node:fs';
import path from 'node:path';
import { requestPlanReadingBase64 } from '../src/engine/aiApi';
import { loadSampleProject } from '../src/engine/fixBenchmark';
import { buildPlanFromVision, scoreReading } from '../src/engine/visionPlan';
import { runBuildingAudit } from '../src/engine/ruleEngine';
import { isProblem } from '../src/engine/layoutEdits';
import { SAMPLE_BUILDINGS } from '../src/engine/sampleDxf';

const pct = (a: number, b: number) => (b ? `${a}/${b} (${Math.round((a / b) * 100)}%)` : '–');

export async function evalVision(model: string, outDir: string, stamp: string) {
  const rows: Record<string, unknown>[] = [];
  for (const s of SAMPLE_BUILDINGS) {
    const project = loadSampleProject(s.id);
    for (let i = 0; i < project.floors.length; i++) {
      const id = `${s.id}-f${i}`;
      const png = path.join('eval/vision-fixtures', `${id}.png`);
      if (!fs.existsSync(png)) continue;
      const truth = project.floors[i];
      const xs = truth.walls.flatMap((w) => [w.start.x, w.end.x]);
      const widthM = Math.max(...xs) - Math.min(...xs);
      const t0 = Date.now();
      try {
        const reading = await requestPlanReadingBase64(fs.readFileSync(png).toString('base64'), 'image/png');
        const read = buildPlanFromVision(reading, { realWidthM: widthM, name: id, fileName: `${id}.png`, occupancyClass: project.occupancyClass, floorIndex: 0, floorLabel: truth.floorLabel });
        const score = scoreReading(read, truth);
        // Same checks on the image-read floor and on the DXF floor, as a single-floor upload.
        const one = (fl: typeof truth) => runBuildingAudit({ ...project, floors: [{ ...fl, floorIndex: 0 }] });
        const aRead = one(read);
        const aTruth = one(truth);
        const rulesTruth = aTruth.violations.filter(isProblem).map((v) => v.ruleId);
        const rulesRead = aRead.violations.filter(isProblem).map((v) => v.ruleId);
        const pool = [...rulesRead];
        let sameRule = 0;
        for (const r of rulesTruth) {
          const k = pool.indexOf(r);
          if (k >= 0) { sameRule++; pool.splice(k, 1); }
        }
        const row = { id, ms: Date.now() - t0, ...score, findingsTruth: rulesTruth.length, findingsRead: rulesRead.length, findingsSameRule: sameRule, walls: read.walls.length };
        rows.push(row);
        console.log(JSON.stringify(row));
      } catch (err) {
        rows.push({ id, error: err instanceof Error ? err.message : String(err) });
        console.log(id, 'ERROR', err);
      }
    }
  }
  const ok = rows.filter((r) => !r.error) as unknown as (ReturnType<typeof scoreReading> & { id: string; findingsTruth: number; findingsRead: number; findingsSameRule: number; ms: number })[];
  const sum = (f: (r: (typeof ok)[number]) => number) => ok.reduce((n, r) => n + f(r), 0);
  const lines = [
    `# Plan reading from images (Gemini traces, code scales and measures)`,
    ``,
    `Run ${new Date().toISOString()}, model \`${model}\`. ${rows.length} rendered demo floors (eval/vision-fixtures), scaled with the true building width. Matching: room centroid within 1.5 m, door within 0.8 m.`,
    ``,
    `| Floor | Rooms found | Doors found | Exits found | Room area error (mean) | Findings: DXF vs image (same rule) |`,
    `|---|---|---|---|---|---|`,
    ...rows.map((r: any) =>
      r.error
        ? `| ${r.id} | error: ${String(r.error).slice(0, 80)} | | | | |`
        : `| ${r.id} | ${pct(r.rooms.matched, r.rooms.truth)} (read ${r.rooms.read}) | ${pct(r.doors.matched, r.doors.truth)} (read ${r.doors.read}) | ${pct(r.exits.matched, r.exits.truth)} (read ${r.exits.read}) | ${r.meanRoomAreaErrorPct ?? '–'}% | ${r.findingsTruth} vs ${r.findingsRead} (${r.findingsSameRule} same rule) |`
    ),
    `| **All** | ${pct(sum((r) => r.rooms.matched), sum((r) => r.rooms.truth))} | ${pct(sum((r) => r.doors.matched), sum((r) => r.doors.truth))} | ${pct(sum((r) => r.exits.matched), sum((r) => r.exits.truth))} | | ${sum((r) => r.findingsSameRule)} of ${sum((r) => r.findingsTruth)} DXF findings reproduced |`,
    ``,
    `Errors: ${rows.length - ok.length}. Median time per floor: ${ok.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(ok.length / 2)] ?? 0} ms.`,
    `Limits: the images are clean renders of synthetic plans (no hatching, dimensions, furniture or scan noise), so this is an upper bound for real drawings. Locked doors are not drawn, so lock status is not measured.`,
  ];
  const base = path.join(outDir, `vision-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(rows, null, 2));
  fs.writeFileSync(`${base}.md`, lines.join('\n') + '\n');
  console.log(`\nWrote ${base}.md`);
}
