import { describe, expect, it } from 'vitest';
import { parseDxfString } from '../src/engine/dxfParser';

describe('DWG upload', () => {
  it('explains how to export a DXF instead of a generic parse error', () => {
    expect(() => parseDxfString('AC1032\u0000\u0000binary', { fileName: 'plan.dwg' })).toThrow(/SAVEAS/);
    expect(() => parseDxfString('anything', { fileName: 'PLAN.DWG' })).toThrow(/DWG file/);
  });
});
