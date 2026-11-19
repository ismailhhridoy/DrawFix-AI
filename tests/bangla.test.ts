import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyBuildingRemediationFixes, runBuildingAudit } from '../src/engine/ruleEngine';
import {
  buildTemplateDeficiencyMemo,
  buildTemplateExplanation,
  buildTemplateNarration,
} from '../src/engine/aiFallback';
import { queryLocalCorpus } from '../src/engine/localIntelligence';
import { Bi, LangProvider, translate, fromBnDigits, toBnDigits } from '../src/i18n';
import { loadSample } from './helpers';

const project = loadSample('gazipur-3story');
const audit = runBuildingAudit(project);
const { fixedProject, deltas } = applyBuildingRemediationFixes(project, audit);
const after = runBuildingAudit(fixedProject);

const hasBangla = (s: string) => /[ঀ-৿]/.test(s);

describe('step 1: Bangla content exists without Gemini', () => {
  it('every finding has a Bangla explanation and action', () => {
    for (const v of audit.violations) {
      const ex = buildTemplateExplanation(v);
      expect(hasBangla(ex.bn), v.ruleId).toBe(true);
      expect(hasBangla(ex.actionBn), v.ruleId).toBe(true);
    }
  });

  it('every proposed fix has a Bangla summary with the same numbers', () => {
    expect(deltas.length).toBeGreaterThan(0);
    const nums = (s: string) => (fromBnDigits(s).match(/\d+(\.\d+)?/g) || []).map(Number).sort();
    for (const d of deltas) {
      expect(hasBangla(d.summaryBn || '')).toBe(true);
      expect(nums(d.summaryBn!)).toEqual(nums(d.summary));
    }
    const n = buildTemplateNarration(project.name, deltas, audit, after);
    for (const b of n.bulletChanges) expect(hasBangla(b.bn)).toBe(true);
  });

  it('the review note has a Bangla body', () => {
    const memo = buildTemplateDeficiencyMemo(project, audit, after);
    expect(hasBangla(memo.memoBodyBn)).toBe(true);
    expect(memo.memoBodyBn).toContain('খসড়া');
    expect(memo.memoBodyBn).toContain(toBnDigits(audit.failCount) + 'টি ত্রুটি');
  });

  it('the offline question box gives a Bangla answer', () => {
    const r = queryLocalCorpus('What is the maximum travel distance for a cabin?', project, audit);
    expect(hasBangla(r.answerBn)).toBe(true);
  });
});

describe('step 1: language switch renders the right fields', () => {
  const render = (lang: 'en' | 'bn' | 'both') =>
    renderToStaticMarkup(
      createElement(LangProvider, { initial: lang }, createElement(Bi, { en: 'Exit is locked', bn: 'দরজা তালাবদ্ধ' }))
    );
  it('en shows English only', () => {
    const html = render('en');
    expect(html).toContain('Exit is locked');
    expect(html).not.toContain('দরজা তালাবদ্ধ');
  });
  it('bn shows Bangla only', () => {
    const html = render('bn');
    expect(html).toContain('দরজা তালাবদ্ধ');
    expect(html).not.toContain('Exit is locked');
    expect(html).toContain('lang="bn"');
  });
  it('both shows both', () => {
    const html = render('both');
    expect(html).toContain('Exit is locked');
    expect(html).toContain('দরজা তালাবদ্ধ');
  });
  it('bn falls back to English and says so when no Bangla exists', () => {
    const html = renderToStaticMarkup(
      createElement(LangProvider, { initial: 'bn' }, createElement(Bi, { en: 'Only English' }))
    );
    expect(html).toContain('Only English');
    expect(html).toContain(translate('bn', 'lang.noBangla'));
  });
});
