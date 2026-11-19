import { describe, expect, it } from 'vitest';
import {
  buildDeterministicCorrectionPackage,
  generatePermitChecklist,
  SAMPLE_CORRECTION_LETTERS,
  type PermitProfileInput,
} from '../src/engine/permitEngine';
import type { ComplianceAudit } from '../src/types/plan';

const profile = (over: Partial<PermitProfileInput> = {}): PermitProfileInput => ({
  jurisdiction: 'rajuk',
  occupancyClass: 'residential',
  floorsCount: 4,
  storyHeightM: 3.2,
  plotAreaSqM: 300,
  abuttingRoadWidthM: 9,
  sprinklered: false,
  ...over,
});

const cleanAudit = (over: Partial<ComplianceAudit> = {}): ComplianceAudit =>
  ({
    violations: [],
    passedCount: 0,
    failCount: 0,
    warnCount: 0,
    escapePaths: [],
    worstEscapeSec: 0,
    trappedRoomCount: 0,
    floorSummaries: [],
    metrics: undefined,
    notChecked: [],
    ...over,
  }) as unknown as ComplianceAudit;

const classify = (text: string) =>
  buildDeterministicCorrectionPackage({ letterText: `1. ${text}` }).items[0];

describe('correction-letter classifier', () => {
  it('does not read "farther" as the FAR zoning rule', () => {
    expect(classify('The cabin is farther than 16 m from the nearest exit.').category).toBe('Fire & Egress');
  });
  it('does not read "broad" as a road-width zoning item', () => {
    expect(classify('The exit door on the broad east side is locked.').category).toBe('Fire & Egress');
  });
  it('keeps real zoning items in Zoning & Setback', () => {
    expect(classify('Submit the FAR and MGC schedule for the abutting road.').category).toBe('Zoning & Setback');
  });
  it('treats a locked stair discharge as egress, not stair geometry', () => {
    expect(classify('Blocked stair discharge: vestibule door is locked.').category).toBe('Fire & Egress');
  });
  it('keeps stair geometry items under Stair Safety', () => {
    expect(classify('Confirm stair headroom and handrail height.').category).toBe('Stair Safety');
  });
  it('sends plain document requests to Documentation', () => {
    expect(classify('Provide a toilet schedule for all floors.').category).toBe('Documentation');
  });
  it('classifies the bundled sample letters without any zoning mis-route of egress items', () => {
    for (const l of SAMPLE_CORRECTION_LETTERS) {
      const pkg = buildDeterministicCorrectionPackage({ letterText: l.text });
      for (const it of pkg.items) {
        if (/travel distance|locked|corridor/i.test(it.objectionSummary)) {
          expect(it.category, it.objectionSummary).not.toBe('Zoning & Setback');
        }
      }
    }
  });
});

describe('permit checklist honesty', () => {
  it('never marks a check ready when the audit could not run it', () => {
    const audit = cleanAudit({
      notChecked: [{ item: 'Travel distance to exits', reason: 'No exit identified.' }],
    });
    const items = generatePermitChecklist(profile(), null, audit);
    expect(items.find((i) => i.id === 'chk-travel-passage')!.status).toBe('verify');
    expect(items.find((i) => i.id === 'chk-egress-doors')!.status).toBe('verify');
  });

  it('can mark travel ready when the audit ran and raised nothing', () => {
    const items = generatePermitChecklist(profile(), null, cleanAudit());
    expect(items.find((i) => i.id === 'chk-travel-passage')!.status).toBe('pass');
  });

  it('never marks daylight ready: the engine does not measure the 15% opening area', () => {
    const items = generatePermitChecklist(profile(), null, cleanAudit());
    expect(items.find((i) => i.id === 'chk-daylight')!.status).not.toBe('pass');
  });

  it('labels the dimension-consistency item as a drawing check, not a verified code rule', () => {
    const items = generatePermitChecklist(profile(), null, cleanAudit());
    expect(items.find((i) => i.id === 'chk-dim-integrity')!.basis).toBe('drawing');
  });

  it('downgrades travel to screening when sprinklers are declared (22.5 m is not a verified value)', () => {
    const dry = generatePermitChecklist(profile({ sprinklered: false }), null, cleanAudit());
    const wet = generatePermitChecklist(profile({ sprinklered: true }), null, cleanAudit());
    expect(dry.find((i) => i.id === 'chk-travel-passage')!.basis).toBe('verified');
    expect(wet.find((i) => i.id === 'chk-travel-passage')!.basis).toBe('screening');
  });

  it('does not claim unsourced high-rise clearances as verified', () => {
    const items = generatePermitChecklist(profile({ floorsCount: 8 }), null, cleanAudit());
    const highRise = items.find((i) => i.id === 'chk-highrise-noc')!;
    expect(highRise.requirement).not.toMatch(/aviation|power|pressuri[sz]ed/i);
    const extra = items.find((i) => i.id === 'chk-highrise-clearances')!;
    expect(extra.basis).toBe('procedural');
    expect(extra.status).toBe('verify');
  });

  it('marks every procedural item as not verified', () => {
    const items = generatePermitChecklist(profile({ occupancyClass: 'industrial_rmg', floorsCount: 8 }), null, cleanAudit());
    for (const i of items.filter((x) => x.basis === 'procedural')) {
      expect(i.citation.toLowerCase()).toMatch(/not verified|confirm/);
    }
  });
});
