import { describe, expect, it } from 'vitest';
import { buildDocsPayload } from './payload';
import { SECTIONS } from './content';
import { toMarkdown } from './markdown';

describe('toMarkdown', () => {
  const payload = buildDocsPayload({ commit: 'abc1234', aiConfigured: false, now: new Date('2026-11-20T00:00:00Z') });
  const md = toMarkdown(payload);

  it('has a title, the build stamp and every section heading', () => {
    expect(md.startsWith('# DrawFix AI: documentation')).toBe(true);
    expect(md).toContain('build abc1234');
    for (const s of SECTIONS) expect(md).toContain(`### ${s.title}`);
  });

  it('writes the feature matrix as a table with one row per feature', () => {
    const rows = md.split('\n').filter((l) => /\| (shipped|in-progress|planned) \|/.test(l));
    expect(rows.length).toBe(payload.live.features.length);
  });

  it('reports AI as off when no key is configured, and never includes a model name', () => {
    expect(md).toContain('AI features: off');
    expect(md.toLowerCase()).not.toMatch(/gemini-|haiku|sonnet|opus/);
  });
});
