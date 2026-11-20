import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCS_CONFIG, resolveDocsAccess, safeEqual, validateDocsConfig } from './access';

const at = (iso: string) => new Date(iso);
const sched = { mode: 'scheduled' as const, from: '2026-11-20T00:00:00.000Z', to: '2026-11-21T00:00:00.000Z', updatedAt: null };

describe('resolveDocsAccess', () => {
  it('is public by default', () => {
    expect(DEFAULT_DOCS_CONFIG.mode).toBe('public');
    expect(resolveDocsAccess(DEFAULT_DOCS_CONFIG, at('2026-11-20T12:00:00Z'), undefined, 'k')).toEqual({ state: 'open' });
  });

  it('stays closed when an admin sets off', () => {
    const cfg = { ...DEFAULT_DOCS_CONFIG, mode: 'off' as const };
    expect(resolveDocsAccess(cfg, at('2026-11-20T12:00:00Z'), undefined, undefined)).toEqual({
      state: 'closed',
      reason: 'off',
      opensAt: null,
    });
  });

  it('is open to everyone in public mode', () => {
    const cfg = { ...DEFAULT_DOCS_CONFIG, mode: 'public' as const };
    expect(resolveDocsAccess(cfg, at('2026-01-01T00:00:00Z'), undefined, undefined)).toEqual({ state: 'open' });
  });

  it('opens only inside the scheduled window', () => {
    expect(resolveDocsAccess(sched, at('2026-11-19T23:00:00Z'), undefined, undefined)).toEqual({
      state: 'closed',
      reason: 'not-yet',
      opensAt: sched.from,
    });
    expect(resolveDocsAccess(sched, at('2026-11-20T12:00:00Z'), undefined, undefined)).toEqual({ state: 'open' });
    expect(resolveDocsAccess(sched, at('2026-11-21T01:00:00Z'), undefined, undefined).state).toBe('closed');
  });

  it('treats a scheduled mode without dates as closed', () => {
    const cfg = { ...DEFAULT_DOCS_CONFIG, mode: 'scheduled' as const };
    expect(resolveDocsAccess(cfg, at('2026-11-20T12:00:00Z'), undefined, undefined)).toEqual({
      state: 'closed',
      reason: 'unscheduled',
      opensAt: null,
    });
  });

  it('requires the view key in restricted mode', () => {
    const cfg = { ...DEFAULT_DOCS_CONFIG, mode: 'restricted' as const };
    const now = at('2026-11-20T12:00:00Z');
    expect(resolveDocsAccess(cfg, now, 'wrong', 'secret')).toEqual({ state: 'locked' });
    expect(resolveDocsAccess(cfg, now, undefined, 'secret')).toEqual({ state: 'locked' });
    expect(resolveDocsAccess(cfg, now, 'secret', 'secret')).toEqual({ state: 'open' });
  });

  it('fails closed in restricted mode when no view key is configured', () => {
    const cfg = { ...DEFAULT_DOCS_CONFIG, mode: 'restricted' as const };
    expect(resolveDocsAccess(cfg, at('2026-11-20T12:00:00Z'), '', undefined).state).toBe('closed');
  });
});

describe('safeEqual', () => {
  it('compares strings of equal and unequal length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('validateDocsConfig', () => {
  const now = '2026-11-19T00:00:00.000Z';
  it('rejects unknown modes and non-objects', () => {
    expect(validateDocsConfig(null, now).ok).toBe(false);
    expect(validateDocsConfig({ mode: 'everyone' }, now).ok).toBe(false);
  });
  it('requires ordered dates for scheduled mode', () => {
    expect(validateDocsConfig({ mode: 'scheduled', from: '2026-11-20T00:00:00Z' }, now).ok).toBe(false);
    expect(
      validateDocsConfig({ mode: 'scheduled', from: '2026-11-21T00:00:00Z', to: '2026-11-20T00:00:00Z' }, now).ok,
    ).toBe(false);
  });
  it('rejects malformed dates', () => {
    expect(validateDocsConfig({ mode: 'public', from: 'not a date' }, now).ok).toBe(false);
  });
  it('accepts a valid scheduled window and stamps updatedAt', () => {
    const res = validateDocsConfig({ mode: 'scheduled', from: '2026-11-20T00:00:00Z', to: '2026-11-21T00:00:00Z', extra: 1 }, now);
    expect(res).toEqual({
      ok: true,
      value: { mode: 'scheduled', from: '2026-11-20T00:00:00.000Z', to: '2026-11-21T00:00:00.000Z', updatedAt: now },
    });
  });
});
