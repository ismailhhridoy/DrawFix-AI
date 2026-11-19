import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyBuildingRemediationFixes, runBuildingAudit } from '../src/engine/ruleEngine';
import {
  buildTemplateDeficiencyMemo,
  buildTemplateExplanation,
  buildTemplateNarration,
  requestAiViolationExplanations,
  violationNumberSources,
} from '../src/engine/aiFallback';
import { checkNumbers, guardText } from '../src/engine/numberGuard';
import { queryLocalCorpus } from '../src/engine/localIntelligence';
import { Bi, LangProvider, translate, fromBnDigits, toBnDigits } from '../src/i18n';
import { loadSample } from './helpers';
import { bnStrings } from '../src/i18n/bn';
import { GLOSSARY, glossaryPromptLines } from '../src/i18n/glossary';
import { RULES } from '../src/engine/rules';
import { REGULATORY_CORPUS } from '../src/engine/bnbcCorpus';

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

describe('step 2: number guard on AI text', () => {
  const v = audit.violations.find((x) => !x.blocked && x.unit === 'm')!;
  const sources = violationNumberSources(v);
  it('accepts Bangla text whose numbers come from the finding', () => {
    const txt = `পরিমাপ ${toBnDigits(v.measuredValue)} মিটার, সীমা ${toBnDigits(v.limitValue)} মিটার।`;
    expect(checkNumbers(txt, sources).ok).toBe(true);
  });
  it('rejects Bangla text with a changed number and falls back to the template', () => {
    const changed = Number((v.measuredValue + 3.4).toFixed(2));
    const txt = `পরিমাপ ${toBnDigits(changed)} মিটার।`;
    const res = checkNumbers(txt, sources);
    expect(res.ok).toBe(false);
    expect(guardText(txt, 'TEMPLATE', sources)).toBe('TEMPLATE');
  });
  it('rejects a clause number that is not in the data', () => {
    expect(checkNumbers('See Sec 9.9.9.9', ['Sec 1.13.8.2']).ok).toBe(false);
    expect(checkNumbers('See Sec 1.13.8.2', ['Sec 1.13.8.2']).ok).toBe(true);
  });
  it('allows rounding to fewer decimals but not a different value', () => {
    expect(checkNumbers('about 18 m', [17.96]).ok).toBe(true);
    expect(checkNumbers('about 17.9 m', [17.96]).ok).toBe(false);
    expect(checkNumbers('১৮.০ মিটার', [17.96]).ok).toBe(true);
  });
  it('drops a Gemini explanation whose Bangla changes a number', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          source: 'gemini',
          explanations: [
            {
              id: v.id,
              en: `Measured ${v.measuredValue} m against ${v.limitValue} m.`,
              bn: `পরিমাপ ${toBnDigits(v.measuredValue + 5)} মিটার।`,
              actionEn: 'Fix it.',
              actionBn: 'ঠিক করুন।',
            },
          ],
        })
      )) as typeof fetch;
    try {
      const out = await requestAiViolationExplanations([v]);
      expect(out[v.id].en).toBe(`Measured ${v.measuredValue} m against ${v.limitValue} m.`);
      expect(out[v.id].bn).toBe(buildTemplateExplanation(v).bn);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('step 4: glossary keeps Bangla terms consistent', () => {
  const allBangla: string[] = [
    ...Object.values(bnStrings),
    ...Object.values(RULES).map((r) => r.nameBn || ''),
    ...REGULATORY_CORPUS.flatMap((c) => [c.titleBn, c.textBn]),
    ...audit.violations.flatMap((v) => {
      const ex = buildTemplateExplanation(v);
      return [ex.bn, ex.actionBn];
    }),
    ...deltas.map((d) => d.summaryBn || ''),
    buildTemplateDeficiencyMemo(project, audit, after).memoBodyBn,
  ];

  it('no Bangla text uses a word the glossary says to avoid', () => {
    for (const g of GLOSSARY) {
      for (const bad of g.avoid || []) {
        const hits = allBangla.filter((s) => s.includes(bad));
        expect(hits, `"${bad}" (use "${g.bn}")`).toEqual([]);
      }
    }
  });

  it('every rule has a Bangla name', () => {
    for (const [id, r] of Object.entries(RULES)) expect(r.nameBn, id).toBeTruthy();
  });

  it('Bangla rule names keep the same numbers as the English names', () => {
    const nums = (s: string) => (fromBnDigits(s).match(/\d+(\.\d+)?/g) || []).map(Number);
    for (const [id, r] of Object.entries(RULES)) expect(nums(r.nameBn!), id).toEqual(nums(r.name));
  });

  it('reference notes keep the same numbers in Bangla', () => {
    const nums = (s: string) =>
      (fromBnDigits(s).match(/\d+(?:\.\d+)*/g) || []).map((x) => x.replace(/\.0+$/, '')).sort();
    for (const c of REGULATORY_CORPUS) expect(nums(c.textBn), c.id).toEqual(nums(c.text));
  });

  it('the Gemini prompt carries the glossary', () => {
    const lines = glossaryPromptLines();
    for (const g of GLOSSARY) expect(lines).toContain(g.bn);
  });
});
