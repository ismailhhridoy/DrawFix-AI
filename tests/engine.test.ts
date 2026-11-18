import { describe, expect, it } from 'vitest';
import { SAMPLE_BUILDINGS } from '../src/engine/sampleDxf';
import { DEFAULT_CONVENTIONS, parseDxfString } from '../src/engine/dxfParser';
import {
  applyBuildingRemediationFixes,
  runBuildingAudit,
  CABIN_TRAVEL_LIMIT_M,
  MIN_PASSAGE_WIDTH_M,
  SCREEN_TRAVEL_LIMIT_SPRINKLERED_M,
} from '../src/engine/ruleEngine';
import { RULES } from '../src/engine/rules';
import { pointInPolygon, pointToSegmentDist, polygonArea } from '../src/engine/geometry';
import type { BuildingProject } from '../src/types/plan';

type Sample = (typeof SAMPLE_BUILDINGS)[number];

function load(s: Sample): BuildingProject {
  return {
    id: s.id,
    name: s.name,
    subtitle: s.subtitle,
    occupancyClass: s.occupancyClass,
    storyHeightM: s.storyHeightM,
    siteContext: { ...s.siteContext },
    floors: s.floors.map((fl) =>
      parseDxfString(fl.dxfContent, {
        id: `${s.id}-f${fl.floorIndex}`,
        name: s.name,
        subtitle: s.subtitle,
        fileName: fl.fileName,
        occupancyClass: s.occupancyClass,
        conventions: DEFAULT_CONVENTIONS,
        floorIndex: fl.floorIndex,
        floorLabel: fl.floorLabel,
        floorName: fl.floorName,
      })
    ),
  };
}

// Regression baseline: values observed from the engine on the bundled sample buildings.
// If a rule change moves these on purpose, update them and say why in the commit.
const BASELINE: Record<string, { floors: number; fail: number; warn: number; worstSec: number }> = {
  'gazipur-3story': { floors: 3, fail: 9, warn: 7, worstSec: 54.7 },
  'gazipur-complex': { floors: 1, fail: 7, warn: 4, worstSec: 31.3 },
  'mirpur-rmg': { floors: 1, fail: 6, warn: 2, worstSec: 24.7 },
  'dhanmondi-res': { floors: 1, fail: 5, warn: 4, worstSec: 26.7 },
};

describe('rule constants', () => {
  it('match the BNBC 2012 Sec 1.13.8.2 values', () => {
    expect(CABIN_TRAVEL_LIMIT_M).toBe(16);
    expect(MIN_PASSAGE_WIDTH_M).toBe(0.75);
    expect(SCREEN_TRAVEL_LIMIT_SPRINKLERED_M).toBe(22.5);
  });
});

describe.each(SAMPLE_BUILDINGS.map((s) => [s.id, s] as const))('sample building %s', (id, sample) => {
  const project = load(sample);
  const audit = runBuildingAudit(project);
  const expected = BASELINE[id];

  it('has a baseline entry', () => {
    expect(expected).toBeDefined();
  });

  it('parses the expected number of floors', () => {
    expect(project.floors).toHaveLength(expected.floors);
    expect(project.floors.every((f) => f.rooms.length > 0)).toBe(true);
  });

  it('is deterministic: the same input gives identical output', () => {
    expect(runBuildingAudit(load(sample))).toEqual(audit);
  });

  it('reproduces the recorded fail/warn counts and worst escape time', () => {
    expect(audit.failCount).toBe(expected.fail);
    expect(audit.warnCount).toBe(expected.warn);
    expect(audit.worstEscapeSec).toBeCloseTo(expected.worstSec, 1);
  });

  it('counts failures and warnings consistently with the violation list', () => {
    expect(audit.violations.filter((v) => v.status === 'FAIL')).toHaveLength(audit.failCount);
    expect(audit.violations.filter((v) => v.status === 'WARN')).toHaveLength(audit.warnCount);
  });

  it('only raises rules that exist in the registry, each with a citation', () => {
    for (const v of audit.violations) {
      expect(RULES[v.ruleId], `unknown rule ${v.ruleId}`).toBeDefined();
      expect(v.citation.length).toBeGreaterThan(0);
    }
  });

  it('never reports a negative or non-finite measurement', () => {
    for (const v of audit.violations) {
      expect(Number.isFinite(v.measuredValue)).toBe(true);
      expect(v.measuredValue).toBeGreaterThanOrEqual(0);
    }
  });

  it('remediation clears every failure without making escape slower', () => {
    const { fixedProject } = applyBuildingRemediationFixes(project, audit);
    const after = runBuildingAudit(fixedProject);
    expect(after.failCount).toBe(0);
    expect(after.worstEscapeSec).toBeLessThanOrEqual(audit.worstEscapeSec);
  });

  it('does not mutate the original project when applying fixes', () => {
    const before = JSON.stringify(project);
    applyBuildingRemediationFixes(project, audit);
    expect(JSON.stringify(project)).toBe(before);
  });
});

describe('geometry helpers', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  it('polygonArea of a 4x4 square is 16', () => {
    expect(Math.abs(polygonArea(square))).toBeCloseTo(16);
  });
  it('pointInPolygon distinguishes inside from outside', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 2 }, square)).toBe(false);
  });
  it('pointToSegmentDist measures to the nearest point on the segment', () => {
    expect(pointToSegmentDist({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3);
    expect(pointToSegmentDist({ x: 7, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3);
  });
});
