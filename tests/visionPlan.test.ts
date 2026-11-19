import { describe, expect, it } from 'vitest';
import { buildPlanFromVision, planToSvg, scoreReading, type VisionReading } from '../src/engine/visionPlan';
import { runBuildingAudit } from '../src/engine/ruleEngine';
import type { ParsedFloorPlan } from '../src/types/plan';
import { loadSample } from './helpers';

/** Turns a known plan into what a perfect AI trace would return (0-1000 image units, y down). */
function perfectReading(plan: ParsedFloorPlan, jitter = 0): VisionReading {
  const xs = plan.walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = plan.walls.flatMap((w) => [w.start.y, w.end.y]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), maxY = Math.max(...ys);
  const k = 1000 / (maxX - minX);
  const ix = (x: number) => (x - minX) * k;
  const iy = (y: number) => (maxY - y) * k;
  // Jitter moves doors and rooms but not walls, like a careless trace.
  const jx = (x: number) => ix(x) + jitter;
  const jy = (y: number) => iy(y) + jitter;
  return {
    walls: plan.walls.map((w) => ({ x1: ix(w.start.x), y1: iy(w.start.y), x2: ix(w.end.x), y2: iy(w.end.y), exterior: w.isExterior })),
    doors: plan.doors.map((d) => ({ x: jx(d.position.x), y: jy(d.position.y), widthUnits: d.widthM * k, isExit: d.isExit, label: d.blockName })),
    rooms: plan.rooms.map((r) => ({ label: r.originalLabel, polygon: r.polygon.map((p) => [jx(p.x), jy(p.y)]) })),
    stairs: plan.stairs.map((s) => ({ label: s.label, polygon: s.polygon.map((p) => [ix(p.x), iy(p.y)]) })),
  };
}

const truth = loadSample('mirpur-rmg').floors[0];
const widthM = Math.max(...truth.walls.flatMap((w) => [w.start.x, w.end.x])) - Math.min(...truth.walls.flatMap((w) => [w.start.x, w.end.x]));
const opts = { realWidthM: widthM, name: 'test', fileName: 'plan.png', occupancyClass: truth.occupancyClass };

describe('plan reading from an image (conversion and scoring, no AI call)', () => {
  it('a perfect trace converts back to the same rooms, doors and exits', () => {
    const read = buildPlanFromVision(perfectReading(truth), opts);
    const score = scoreReading(read, truth);
    expect(score.rooms.matched).toBe(truth.rooms.length);
    expect(score.doors.matched).toBe(truth.doors.length);
    expect(score.exits.matched).toBe(truth.doors.filter((d) => d.isExit).length);
    expect(score.meanRoomAreaErrorPct).toBeLessThan(1);
    expect(score.recall).toBe(1);
  });
  it('marks every element as read by AI and never checks stair values it could not see', () => {
    const read = buildPlanFromVision(perfectReading(truth), opts);
    expect(read.parseNotes[0]).toMatch(/Read by AI from an image/);
    expect(read.doors.every((d) => d.widthSource === 'ai-vision')).toBe(true);
    expect(read.rooms.every((r) => r.boundarySource === 'ai-vision')).toBe(true);
    expect(read.stairs.every((s) => s.stated && !s.stated.headroom && !s.stated.handrail)).toBe(true);
  });
  it('the rule engine runs on a read plan', () => {
    const read = buildPlanFromVision(perfectReading(truth), opts);
    const audit = runBuildingAudit({ id: 'v', name: 'v', subtitle: '', occupancyClass: truth.occupancyClass, storyHeightM: 3.2, floors: [read] });
    expect(audit.violations.length).toBeGreaterThan(0);
  });
  it('a sloppy trace scores lower', () => {
    const read = buildPlanFromVision(perfectReading(truth, 25), opts);
    expect(scoreReading(read, truth).recall).toBeLessThan(1);
  });
  it('refuses to guess a scale or work from too few walls', () => {
    expect(() => buildPlanFromVision(perfectReading(truth), { ...opts, realWidthM: 0 })).toThrow(/width in metres/);
    expect(() => buildPlanFromVision({ walls: [], doors: [], rooms: [] }, opts)).toThrow(/enough walls/);
  });
  it('can draw a plan as SVG for the evaluation script', () => {
    expect(planToSvg(truth)).toMatch(/^<svg/);
  });
});
