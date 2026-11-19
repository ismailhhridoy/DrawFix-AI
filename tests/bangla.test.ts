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
import { Bi, LangProvider, LangScope, readStoredLang, translate, fromBnDigits, toBnDigits } from '../src/i18n';
import { loadSample } from './helpers';
import { twoRoomDxf } from './fixtures-bangla';
import { cleanDxfText, decodeDxfUnicode, matchBanglaRoom } from '../src/engine/banglaText';
import { DEFAULT_CONVENTIONS, parseDxfString } from '../src/engine/dxfParser';
import { classifyRoomWithGeometry } from '../src/engine/localIntelligence';
import { PrintReport } from '../src/components/PrintReport';
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
  it('bn falls back to English with no placeholder text', () => {
    const html = renderToStaticMarkup(
      createElement(LangProvider, { initial: 'bn' }, createElement(Bi, { en: 'Only English' }))
    );
    expect(html).toContain('Only English');
    expect(html).not.toMatch(/এখনও|placeholder|TODO|\[Bangla/i);
  });
  it('the homepage scope forces English even when Bangla is on', () => {
    const html = renderToStaticMarkup(
      createElement(
        LangProvider,
        { initial: 'bn' },
        createElement(LangScope, { force: 'en', children: createElement(Bi, { en: 'Home', bn: 'হোম' }) })
      )
    );
    expect(html).toContain('Home');
    expect(html).not.toContain('হোম');
  });
  it('default language is English', () => {
    expect(readStoredLang()).toBe('en');
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

describe('step 5: printable Bangla report', () => {
  const render = (lang: 'en' | 'bn' | 'both') =>
    renderToStaticMarkup(
      createElement(
        LangProvider,
        { initial: lang },
        createElement(PrintReport, {
          project,
          beforeAudit: audit,
          afterAudit: after,
          deltas,
          generatedAt: new Date('2026-11-19T00:00:00Z'),
        })
      )
    );

  it('renders a Bangla report with the same numbers in Bangla digits', () => {
    const html = render('bn');
    expect(html).toContain(translate('bn', 'print.title'));
    expect(html).toContain(`${toBnDigits(audit.failCount)}টি ত্রুটি`);
    const v = audit.violations.find((x) => !x.blocked && x.unit === 'm')!;
    expect(html).toContain(`${toBnDigits(v.measuredValue)} m`);
    expect(html).toContain(RULES[v.ruleId].nameBn!);
    expect(html).not.toContain('[Bangla label]');
    expect(html).toContain(translate('bn', 'bnNotice.text'));
  });

  it('renders English only in English mode, with no Bangla script', () => {
    const html = render('en');
    expect(html).toContain('DrawFix AI: escape-route and plan check report');
    expect(/[ঀ-৿]/.test(html)).toBe(false);
  });

  it('shows both languages for each finding in both mode', () => {
    const html = render('both');
    const ex = buildTemplateExplanation(audit.violations[0]);
    expect(html).toContain(ex.bn.slice(-25));
    expect(html).toContain(ex.en.slice(-15).replace(/"/g, "&quot;"));
  });
});

describe('step 6: Bangla labels in drawings', () => {
  const esc = (s: string) => [...s].map((c) => `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join('');

  it('decodes AutoCAD \\U+ escapes', () => {
    expect(decodeDxfUnicode('\\U+09B6\\U+09DF\\U+09A8')).toBe('শয়ন');
    expect(decodeDxfUnicode('ROOM \\U+09E7')).toBe('ROOM ১');
  });

  it('strips MTEXT formatting but keeps the words', () => {
    expect(cleanDxfText('{\\fArial|b0|i0|c0|p34;BED\\PROOM}')).toBe('BED ROOM');
    expect(cleanDxfText('\\LKITCHEN\\l')).toBe('KITCHEN');
    expect(cleanDxfText('{\\C1;\\H0.3x;' + esc('রান্নাঘর') + '}')).toBe('রান্নাঘর');
    expect(cleanDxfText('Ø%%c 50')).toBe('ØØ 50');
    expect(cleanDxfText('A\\\\B')).toBe('A\\B');
  });

  it('matches Bangla room words whichever way য় / ড় is encoded', () => {
    expect(matchBanglaRoom('শয়নকক্ষ')?.taxonomy).toBe('bedroom');
    expect(matchBanglaRoom('শয়নকক্ষ')?.taxonomy).toBe('bedroom');
    expect(matchBanglaRoom('ড্রয়িং রুম')?.taxonomy).toBe('habitable');
    expect(matchBanglaRoom('টয়লেট')?.taxonomy).toBe('utility');
    expect(matchBanglaRoom('শৌচাগার')?.taxonomy).toBe('utility');
    expect(matchBanglaRoom('বাথরুম ২')?.taxonomy).toBe('utility');
    expect(matchBanglaRoom('ডাইনিং')?.taxonomy).toBe('habitable');
    expect(matchBanglaRoom('লিফট লবি')?.taxonomy).toBe('lobby');
    expect(matchBanglaRoom('জরুরি বহির্গমন')?.taxonomy).toBe('exit');
    expect(matchBanglaRoom('BEDROOM')).toBeNull();
  });

  it('a DXF with \\U+ escaped Bangla labels gives the right rooms', () => {
    const plan = parseDxfString(twoRoomDxf(esc('শয়নকক্ষ'), `{\\fArial|b0;${esc('রান্নাঘর')}}`, true), {
      fileName: 'bangla.dxf',
      conventions: DEFAULT_CONVENTIONS,
      occupancyClass: 'residential',
    });
    const labels = plan.rooms.map((r) => [r.originalLabel, r.taxonomy]);
    expect(labels).toContainEqual(['শয়নকক্ষ', 'bedroom']);
    expect(labels).toContainEqual(['রান্নাঘর', 'habitable']);
  });

  it('plain UTF-8 Bangla labels still work, and the geometry classifier agrees', () => {
    const plan = parseDxfString(twoRoomDxf('শোবার ঘর', 'টয়লেট'), {
      fileName: 'bangla-utf8.dxf',
      conventions: DEFAULT_CONVENTIONS,
      occupancyClass: 'residential',
    });
    const byLabel = Object.fromEntries(plan.rooms.map((r) => [r.originalLabel, r]));
    expect(byLabel['শোবার ঘর'].taxonomy).toBe('bedroom');
    expect(byLabel['টয়লেট'].taxonomy).toBe('utility');
    expect(classifyRoomWithGeometry(byLabel['শোবার ঘর'], plan).taxonomy).toBe('bedroom');
    expect(classifyRoomWithGeometry(byLabel['টয়লেট'], plan).taxonomy).toBe('utility');
  });
});

describe('step 7: Bangla questions offline', () => {
  const q = 'বের হওয়ার পথের সর্বোচ্চ দূরত্ব কত?';

  it('a Bangla question scores above zero and finds Sec 1.13.8.2', () => {
    const r = queryLocalCorpus(q, project, audit);
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations[0].score).toBeGreaterThan(0);
    expect(r.citations.map((c) => c.id)).toContain('bnbc-2012-1.13.8.2-cabins');
    expect(hasBangla(r.answerBn)).toBe(true);
  });

  it('gives the same answer when asked twice (no stateful /g regex)', () => {
    const a = queryLocalCorpus('Which exit door width applies?', project, audit);
    const b = queryLocalCorpus('Which exit door width applies?', project, audit);
    expect(a.citations.map((c) => c.id)).toEqual(b.citations.map((c) => c.id));
    const c = queryLocalCorpus(q, project, audit);
    const d = queryLocalCorpus(q, project, audit);
    expect(c.citations.map((x) => x.id)).toEqual(d.citations.map((x) => x.id));
  });

  it('other Bangla questions find the right note', () => {
    const top = (s: string) => queryLocalCorpus(s, project, audit).citations[0]?.id;
    expect(top('সিঁড়ির হাতলের উচ্চতা কত হবে?')).toBe('bnbc-2012-1.13.5-stairs');
    expect(top('শয়নকক্ষের ন্যূনতম আয়তন কত?')).toBe('bnbc-2012-1.13.2.2-bedroom');
    expect(top('সেটব্যাক ও এফএআর কীভাবে যাচাই হয়?')).toBe('screen-zoning');
  });

  it('returns "no matching note" when nothing matches', () => {
    const r = queryLocalCorpus('qwxz zzyv', project, audit);
    expect(r.citations).toEqual([]);
    expect(r.answerEn).toMatch(/No reference note matched/);
    expect(hasBangla(r.answerBn)).toBe(true);
  });
});
