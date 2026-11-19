import { describe, expect, it } from 'vitest';
import { parseDxfString } from '../src/engine/dxfParser';
import { runBuildingAudit } from '../src/engine/ruleEngine';
import type { BuildingProject, SiteContext } from '../src/types/plan';

/**
 * Hand-checkable plans. Unlike the sample-building baselines, the expected numbers here come from
 * arithmetic on a drawing built in this file, not from the engine's own earlier output.
 *
 * Plan: a rectangular hall LEN m x 4 m (metres, $INSUNITS=6), walls on A-WALL, one 1.0 m exit door
 * in the middle of the left (x = 0) wall. The room centroid is LEN / 2 from that door.
 */
const line = (x1: number, y1: number, x2: number, y2: number) =>
  `0\nLINE\n8\nA-WALL\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0\n`;

function hallDxf(len: number): string {
  const walls =
    line(0, 0, len, 0) +
    line(0, 4, len, 4) +
    line(len, 0, len, 4) +
    line(0, 0, 0, 1.5) +
    line(0, 2.5, 0, 4); // 1.0 m gap for the door
  const door = `0\nINSERT\n8\nA-DOOR\n2\nEXIT_DOOR\n10\n0\n20\n2\n30\n0\n41\n1\n42\n1\n50\n0\n`;
  return `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${walls}${door}0\nENDSEC\n0\nEOF\n`;
}

function audit(len: number, sprinklered = false) {
  const floor = parseDxfString(hallDxf(len), { fileName: `hall${len}.dxf`, occupancyClass: 'industrial_rmg' });
  const siteContext = {
    plotAreaSqM: 0,
    abuttingRoadWidthM: 0,
    frontSetbackM: 0,
    rearSetbackM: 0,
    sideSetbackM: 0,
    sprinklered,
    zoneLabel: 'test',
  } as SiteContext;
  const project = {
    id: 'hall',
    name: 'hall',
    subtitle: '',
    occupancyClass: 'industrial_rmg',
    storyHeightM: 3.2,
    siteContext,
    floors: [floor],
  } as BuildingProject;
  return { floor, audit: runBuildingAudit(project) };
}

describe('hand-checked hall plan', () => {
  it('reads the room area as length x 4 m', () => {
    expect(audit(10).floor.rooms[0].areaSqM).toBeCloseTo(40, 1);
    expect(audit(36).floor.rooms[0].areaSqM).toBeCloseTo(144, 1);
  });

  it('finds the exit door', () => {
    const { floor } = audit(10);
    expect(floor.doors).toHaveLength(1);
    expect(floor.doors[0].isExit).toBe(true);
  });

  it('a 10 m hall (centroid 5 m from the door) raises no travel-distance finding', () => {
    const { audit: a } = audit(10);
    expect(a.violations.some((v) => /travel_distance/.test(v.ruleId))).toBe(false);
  });

  it('a 36 m hall (centroid 18 m from the door) exceeds the 16 m limit and measures about 18 m', () => {
    const { audit: a } = audit(36);
    const v = a.violations.find((x) => /travel_distance/.test(x.ruleId));
    expect(v, 'expected a travel-distance finding').toBeDefined();
    expect(v!.measuredValue).toBeGreaterThan(17.5);
    expect(v!.measuredValue).toBeLessThan(18.5);
    expect(v!.limitValue).toBe(16);
  });

  it('the same 18 m path is within the 22.5 m limit when sprinklers are declared', () => {
    const { audit: a } = audit(36, true);
    expect(a.violations.some((v) => /travel_distance/.test(v.ruleId))).toBe(false);
  });

  it('a single exit is flagged as fewer than two independent exits', () => {
    const { audit: a } = audit(10);
    expect(a.violations.some((v) => v.ruleId === 'bnbc_p4_dual_exit_count')).toBe(true);
  });
});
