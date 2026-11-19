import { describe, expect, it } from 'vitest';
import { parseDxfString } from '../src/engine/dxfParser';
import { runBuildingAudit } from '../src/engine/ruleEngine';
import { compareVersions } from '../src/engine/resubmission';
import type { BuildingProject, SiteContext } from '../src/types/plan';

/** Same hand-checkable hall as handchecked.test.ts: LEN x 4 m, one 1.0 m exit door in the left wall. */
const line = (x1: number, y1: number, x2: number, y2: number) =>
  `0\nLINE\n8\nA-WALL\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0\n`;

function hallAudit(len: number) {
  const walls =
    line(0, 0, len, 0) + line(0, 4, len, 4) + line(len, 0, len, 4) + line(0, 0, 0, 1.5) + line(0, 2.5, 0, 4);
  const door = `0\nINSERT\n8\nA-DOOR\n2\nEXIT_DOOR\n10\n0\n20\n2\n30\n0\n41\n1\n42\n1\n50\n0\n`;
  const dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${walls}${door}0\nENDSEC\n0\nEOF\n`;
  const floor = parseDxfString(dxf, { fileName: `hall${len}.dxf`, occupancyClass: 'industrial_rmg' });
  const project = {
    id: 'hall',
    name: 'hall',
    subtitle: '',
    occupancyClass: 'industrial_rmg',
    storyHeightM: 3.2,
    siteContext: {
      plotAreaSqM: 0, abuttingRoadWidthM: 0, frontSetbackM: 0, rearSetbackM: 0, sideSetbackM: 0,
      sprinklered: false, zoneLabel: 'test',
    } as SiteContext,
    floors: [floor],
  } as BuildingProject;
  return runBuildingAudit(project);
}

const travel = (v: { ruleId: string }) => /travel_distance/.test(v.ruleId);

describe('compareVersions (revised drawing vs earlier version)', () => {
  it('a shortened hall clears the travel-distance finding and keeps the single-exit finding', () => {
    const r = compareVersions(hallAudit(36), hallAudit(10));
    expect(r.cleared.some(travel)).toBe(true);
    expect(r.newlyFound.some(travel)).toBe(false);
    expect(r.stillOpen.some((c) => c.before.ruleId === 'bnbc_p4_dual_exit_count')).toBe(true);
  });

  it('a lengthened hall shows the travel-distance finding as new', () => {
    const r = compareVersions(hallAudit(10), hallAudit(36));
    expect(r.newlyFound.some(travel)).toBe(true);
    expect(r.cleared.some(travel)).toBe(false);
  });

  it('a slightly shorter hall that still fails is "still open" and marked better', () => {
    const r = compareVersions(hallAudit(36), hallAudit(34));
    const c = r.stillOpen.find((x) => travel(x.before));
    expect(c, 'expected the travel finding to stay open').toBeDefined();
    expect(c!.direction).toBe('better');
    expect(c!.after.measuredValue).toBeLessThan(c!.before.measuredValue);
  });

  it('the same drawing twice changes nothing', () => {
    const r = compareVersions(hallAudit(36), hallAudit(36));
    expect(r.cleared).toHaveLength(0);
    expect(r.newlyFound).toHaveLength(0);
    expect(r.stillOpen.every((c) => c.direction === 'same')).toBe(true);
  });
});
