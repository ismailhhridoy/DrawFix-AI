import { describe, expect, it } from 'vitest';
import { SAMPLE_BUILDINGS } from '../src/engine/sampleDxf';
import { DEFAULT_CONVENTIONS, parseDxfString } from '../src/engine/dxfParser';
import { classifyRoomWithGeometry } from '../src/engine/localIntelligence';

/**
 * Regression: the offline classifier used to call unlabelled-looking rooms (ARCHIVE-3, FIRE-CONTROL,
 * SECURITY-DESK) bedrooms, which added false 9.5 m2 / 2.9 m findings on the main demo.
 */
describe('offline room classifier', () => {
  it('never calls a room a bedroom unless its label says so', () => {
    const offenders: string[] = [];
    for (const s of SAMPLE_BUILDINGS) {
      for (const fl of s.floors) {
        const plan = parseDxfString(fl.dxfContent, {
          fileName: fl.fileName,
          occupancyClass: s.occupancyClass,
          conventions: DEFAULT_CONVENTIONS,
          floorIndex: fl.floorIndex,
          floorLabel: fl.floorLabel,
          floorName: fl.floorName,
        });
        for (const room of plan.rooms) {
          const out = classifyRoomWithGeometry(room, plan);
          const labelSaysBedroom = /br-|bed|sleep|master|guest|dorm/i.test(room.originalLabel || '');
          if (out.taxonomy === 'bedroom' && !labelSaysBedroom) offenders.push(`${s.id}: ${room.originalLabel}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
