/**
 * Renders each demo floor (known geometry) to a PNG for the plan-reading measurement.
 *   npx tsx scripts/render-vision-fixtures.ts   -> eval/vision-fixtures/<building>-f<i>.png
 * Needs Playwright's Chromium (pre-installed in the cloud workspace). The PNGs are committed, so the
 * measurement itself (scripts/eval-ai.ts --only vision) does not need a browser.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { SAMPLE_BUILDINGS } from '../src/engine/sampleDxf';
import { loadSampleProject } from '../src/engine/fixBenchmark';
import { planToSvg } from '../src/engine/visionPlan';

const out = 'eval/vision-fixtures';
fs.mkdirSync(out, { recursive: true });
// Playwright is not a project dependency; use the one installed on the machine (NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const s of SAMPLE_BUILDINGS) {
  const p = loadSampleProject(s.id);
  for (let i = 0; i < p.floors.length; i++) {
    const svg = planToSvg(p.floors[i], 30);
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const el = await page.$('svg');
    await el!.screenshot({ path: `${out}/${s.id}-f${i}.png` });
    console.log(`${out}/${s.id}-f${i}.png`);
  }
}
await browser.close();
