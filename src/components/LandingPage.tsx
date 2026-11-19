import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  FileCheck2,
  Upload,
} from 'lucide-react';
import { DEFAULT_CONVENTIONS, parseDxfString } from '../engine/dxfParser';
import {
  buildScrutinyTriage,
  type ReviewerRole,
} from '../engine/localIntelligence';
import { applyBuildingRemediationFixes, runBuildingAudit } from '../engine/ruleEngine';
import { BNBC_P3_SOURCE_URL, RULES, type RuleBasis } from '../engine/rules';
import { SAMPLE_BUILDINGS, type SampleBuildingMeta } from '../engine/sampleDxf';
import type { AppStep, BuildingProject, ComplianceAudit } from '../types/plan';
import { Blueprint2D } from './Blueprint2D';
import { DrawFixLogo } from './DrawFixLogo';
import { HeroCadBackdrop } from './HeroCadBackdrop';
import { BasisBadge } from './shared';
import { useLang } from '../i18n';
import type { MsgKey } from '../i18n/en';

interface LandingPageProps {
  reviewerRole: ReviewerRole;
  onChangeReviewerRole: (role: ReviewerRole) => void;
  onOpenSample: (sample: SampleBuildingMeta, step: AppStep) => void;
  onGoToUpload: () => void;
  onGoToPermits: () => void;
}

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'landing.step1.title',
    body: 'landing.step1.body',
  },
  {
    number: '02',
    title: 'landing.step2.title',
    body: 'landing.step2.body',
  },
  {
    number: '03',
    title: 'landing.step3.title',
    body: 'landing.step3.body',
  },
  {
    number: '04',
    title: 'landing.step4.title',
    body: 'landing.step4.body',
  },
];

function getRuleDomain(ruleId: string): MsgKey {
  if (
    ruleId.includes('far') ||
    ruleId.includes('mgc') ||
    ruleId.includes('setback') ||
    ruleId.includes('highrise')
  ) {
    return 'landing.domain.zoning';
  }
  if (ruleId.includes('bedroom') || ruleId.includes('ventilation')) {
    return 'landing.domain.habitability';
  }
  if (ruleId.includes('stair')) {
    return 'landing.domain.stair';
  }
  if (ruleId.includes('dimension')) {
    return 'landing.domain.cad';
  }
  return 'landing.domain.fire';
}

const FAQ_ITEMS = [
  {
    q: 'landing.faq1.q',
    a: 'landing.faq1.a',
  },
  {
    q: 'landing.faq2.q',
    a: 'landing.faq2.a',
  },
  {
    q: 'landing.faq3.q',
    a: 'landing.faq3.a',
  },
  {
    q: 'landing.faq4.q',
    a: 'landing.faq4.a',
  },
  {
    q: 'landing.faq5.q',
    a: 'landing.faq5.a',
  },
];

export function LandingPage({
  reviewerRole,
  onChangeReviewerRole,
  onOpenSample,
  onGoToUpload,
  onGoToPermits,
}: LandingPageProps) {
  const { t, num, uiLang } = useLang();
  const [heroMode, setHeroMode] = useState<'before' | 'after'>('before');
  const [heroFloorIdx, setHeroFloorIdx] = useState(0);
  const [ruleFilter, setRuleFilter] = useState<'all' | RuleBasis>('all');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const primaryBenchmark = useMemo(() => {
    const sample = SAMPLE_BUILDINGS[0];
    if (!sample) return null;
    const floors = sample.floors.map((fl) =>
      parseDxfString(fl.dxfContent, {
        id: `${sample.id}-f${fl.floorIndex}`,
        name: sample.name,
        subtitle: sample.subtitle,
        fileName: fl.fileName,
        occupancyClass: sample.occupancyClass,
        conventions: DEFAULT_CONVENTIONS,
        floorIndex: fl.floorIndex,
        floorLabel: fl.floorLabel,
        floorName: fl.floorName,
      })
    );
    const project: BuildingProject = {
      id: sample.id,
      name: sample.name,
      subtitle: sample.subtitle,
      occupancyClass: sample.occupancyClass,
      storyHeightM: sample.storyHeightM,
      siteContext: { ...sample.siteContext, declared: true },
      floors,
    };
    const before = runBuildingAudit(project);
    const { fixedProject } = applyBuildingRemediationFixes(project, before);
    const after = runBuildingAudit(fixedProject);
    return { sample, project, fixedProject, before, after };
  }, []);

  const safeHeroFloorIdx = primaryBenchmark
    ? Math.min(heroFloorIdx, primaryBenchmark.project.floors.length - 1)
    : 0;
  const displayedHeroProject =
    heroMode === 'after' ? primaryBenchmark?.fixedProject : primaryBenchmark?.project;
  const displayedHeroAudit =
    heroMode === 'after' ? primaryBenchmark?.after : primaryBenchmark?.before;
  const heroFloor = displayedHeroProject?.floors[safeHeroFloorIdx];
  const heroFindings = displayedHeroAudit
    ? displayedHeroAudit.violations.filter((v) => (v.floorIndex ?? 0) === safeHeroFloorIdx)
    : [];
  const heroTriage =
    displayedHeroProject && displayedHeroAudit
      ? buildScrutinyTriage(displayedHeroProject, displayedHeroAudit)
      : null;

  const ruleList = useMemo(
    () =>
      Object.entries(RULES)
        .filter(([id]) => id !== 'input_exits_unidentified')
        .sort((a, b) => a[1].basis.localeCompare(b[1].basis) * -1),
    []
  );
  const verifiedRules = ruleList.filter(([, r]) => r.basis === 'verified').length;
  const screeningRules = ruleList.filter(([, r]) => r.basis === 'screening').length;
  const filteredRules =
    ruleFilter === 'all' ? ruleList : ruleList.filter(([, r]) => r.basis === ruleFilter);

  return (
    <div className="bg-white text-[#12111A]">
      {/* 1. Hero Section with Interactive Architectural CAD Backdrop */}
      <section className="relative bg-white pb-16 sm:pb-20 lg:pb-24">
        <div className="relative overflow-hidden bg-[#0D1120] text-white pt-14 pb-36 sm:pt-20 sm:pb-44 lg:pt-24 lg:pb-52">
          <HeroCadBackdrop />

          <div className="relative z-10 max-w-[1180px] mx-auto px-4 sm:px-8">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm font-medium text-blue-200/90">
                <span>{t('landing.hero.tag1')}</span>
                <span aria-hidden="true">·</span>
                <span>{t('landing.hero.tag2')}</span>
                <span aria-hidden="true">·</span>
                <span>{t('landing.hero.tag3')}</span>
              </div>

              <h1 className="font-display text-[clamp(2.65rem,5vw,4.5rem)] font-bold tracking-[-0.035em] leading-[1.05] text-white text-balance">
                {t('landing.hero.title1')}
                <span className="text-[#60A5FA]">{t('landing.hero.title2')}</span>
              </h1>

              <p className="max-w-2xl mx-auto text-lg sm:text-xl text-slate-200/90 leading-relaxed">
                {primaryBenchmark
                  ? t('landing.hero.lead', {
                      before: num(primaryBenchmark.before.worstEscapeSec.toFixed(0)),
                      after: num(primaryBenchmark.after.worstEscapeSec.toFixed(0)),
                    })
                  : t('landing.hero.lead', { before: '55', after: '37' })}
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
                {primaryBenchmark ? (
                  <button
                    type="button"
                    onClick={() => onOpenSample(primaryBenchmark.sample, 'report')}
                    className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold text-[#0A1324] bg-white hover:bg-blue-50 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0 shadow-sm"
                  >
                    <FileCheck2 className="w-4 h-4 text-[#2563EB]" />
                    {t('landing.hero.upload')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onGoToUpload}
                    className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold text-[#0A1324] bg-white hover:bg-blue-50 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0 shadow-sm"
                  >
                    <Upload className="w-4 h-4 text-[#2563EB]" />
                    {t('landing.hero.upload')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGoToUpload}
                  className="inline-flex items-center gap-2 px-5 py-3.5 text-base font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/15 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 backdrop-blur-xs"
                >
                  <Upload className="w-4 h-4 text-white/70" />
                  {t('nav.upload')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-20 max-w-[1180px] mx-auto px-4 sm:px-8 -mt-24 sm:-mt-32 lg:-mt-36">
          {/* Interactive CAD Inspection Viewport */}
          {primaryBenchmark && heroFloor && displayedHeroAudit && heroTriage && (
            <div className="rounded-xl border border-[#12111A]/10 bg-[#F4F5F7] p-3 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 px-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#12111A]/70">
                  <span className="font-semibold text-[#12111A]">
                    {t('landing.inspector')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {reviewerRole === 'government'
                      ? t('landing.inspector.gov', { d: t(`triage.${heroTriage.disposition}` as MsgKey), m: heroTriage.estimatedManualMinutesSaved })
                      : t('landing.inspector.arch', { f: displayedHeroAudit.failCount, w: displayedHeroAudit.warnCount })}
                  </span>
                  {displayedHeroAudit.metrics && displayedHeroAudit.metrics.plotAreaSqM > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        FAR {displayedHeroAudit.metrics.achievedFar} / MGC{' '}
                        {displayedHeroAudit.metrics.mgcPercent}%
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#12111A]/[0.08] rounded-lg">
                    <button
                      type="button"
                      onClick={() => onChangeReviewerRole('architect')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        reviewerRole === 'architect'
                          ? 'bg-[#12111A] text-white'
                          : 'text-[#12111A]/65 hover:text-[#12111A]'
                      }`}
                    >
                      {t('landing.role.architect')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeReviewerRole('government')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        reviewerRole === 'government'
                          ? 'bg-[#12111A] text-white'
                          : 'text-[#12111A]/65 hover:text-[#12111A]'
                      }`}
                    >
                      {t('landing.role.government')}
                    </button>
                  </div>

                  <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#12111A]/[0.08] rounded-lg">
                    {primaryBenchmark.project.floors.map((fl, idx) => (
                      <button
                        key={fl.id}
                        type="button"
                        onClick={() => setHeroFloorIdx(idx)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          safeHeroFloorIdx === idx
                            ? 'bg-[#2563EB] text-white'
                            : 'text-[#12111A]/65 hover:text-[#12111A]'
                        }`}
                      >
                        {fl.floorLabel || `F${idx + 1}`}
                      </button>
                    ))}
                  </div>

                  <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#12111A]/[0.08] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setHeroMode('before')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        heroMode === 'before'
                          ? 'bg-[#2563EB] text-white'
                          : 'text-[#12111A]/65 hover:text-[#12111A]'
                      }`}
                    >
                      {t('landing.mode.before')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeroMode('after')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        heroMode === 'after'
                          ? 'bg-[#2563EB] text-white'
                          : 'text-[#12111A]/65 hover:text-[#12111A]'
                      }`}
                    >
                      {t('landing.mode.after')}
                    </button>
                  </div>
                </div>
              </div>

              <Blueprint2D
                plan={heroFloor}
                violations={heroFindings}
                escapePaths={displayedHeroAudit.escapePaths}
                title={
                  reviewerRole === 'government'
                    ? t('landing.bp.gov', { floor: heroFloor.floorName || t('common.groundFloor'), d: heroTriage.dimensionTamperAlerts, n: heroFindings.length })
                    : `${heroFloor.floorName || t('common.groundFloor')} — ${heroMode === 'before' ? t('landing.bp.submitted') : t('landing.bp.validated')}`
                }
                mode={heroMode}
                compact
              />
            </div>
          )}

          {/* Quantitative Proof Bar */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 border border-[#12111A]/10 rounded-xl bg-white divide-y lg:divide-y-0 lg:divide-x divide-[#12111A]/10">
            <div className="p-5 sm:p-6">
              <div className="text-sm text-[#12111A]/60">{t('landing.stat1.label')}</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[#12111A]">
                {t('landing.stat1.value', { n: ruleList.length })}
              </div>
              <div className="mt-1 text-sm text-[#12111A]/60 tabular-nums">
                {t('landing.stat1.note', { v: verifiedRules, s: screeningRules })}
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="text-sm text-[#12111A]/60">{t('landing.stat2.label')}</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[#12111A]">
                {t('landing.stat2.value')}
              </div>
              <div className="mt-1 text-sm text-[#12111A]/60">
                {t('landing.stat2.note')}
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="text-sm text-[#12111A]/60">{t('landing.stat3.label')}</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[#12111A]">
                {t('landing.stat3.value')}
              </div>
              <div className="mt-1 text-sm text-[#12111A]/60">
                {t('landing.stat3.note')}
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="text-sm text-[#12111A]/60">{t('landing.stat4.label')}</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[#12111A]">
                {primaryBenchmark
                  ? `${primaryBenchmark.before.worstEscapeSec.toFixed(0)} → ${primaryBenchmark.after.worstEscapeSec.toFixed(0)} s`
                  : '55 → 37 s'}
              </div>
              <div className="mt-1 text-sm text-[#12111A]/60">
                {t('landing.stat4.note')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1b. Showcase: Three things to try */}
      <section className="bg-white py-16 sm:py-20 lg:py-24 px-4 sm:px-8 border-t border-[#12111A]/[0.06]">
        <div className="max-w-[1180px] mx-auto space-y-10">
          <div className="max-w-2xl space-y-2">
            <div className="text-xs uppercase tracking-widest font-medium text-[#12111A]/40">
              {t('landing.show.kicker')}
            </div>
            <h2 className="font-display text-[clamp(2.1rem,3.8vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1.08] text-[#12111A]">
              {t('landing.show.title1')}{' '}{t('landing.show.title2')}
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Panel 1: Failure replay */}
            <div className="bg-[#0D1120] text-white rounded-xl p-7 sm:p-8 flex flex-col space-y-5">
              <div>
                <div className="text-xs uppercase tracking-widest font-medium text-white/40 mb-3">
                  {t('landing.show.replay.kicker')}
                </div>
                <h3 className="font-display text-xl font-bold tracking-tight text-white">
                  {t('landing.show.replay.title')}
                </h3>
              </div>

              <div className="flex-1 space-y-3">
                <div className="flex items-start gap-3 p-3 bg-red-500/15 rounded-xl border border-red-500/25">
                  <span className="mt-0.5 text-red-400 shrink-0 text-lg leading-none">✕</span>
                  <div>
                    <div className="text-sm font-semibold text-red-300">Exit padlocked — no route</div>
                    <div className="text-xs text-white/60 mt-0.5">Bailey Road 2024 scenario · 1 of 3 failures</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-red-500/15 rounded-xl border border-red-500/25">
                  <span className="mt-0.5 text-red-400 shrink-0 text-lg leading-none">✕</span>
                  <div>
                    <div className="text-sm font-semibold text-red-300">1 staircase — BNBC requires 2</div>
                    <div className="text-xs text-white/60 mt-0.5">3-storey · occupant load exceeded</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-amber-500/15 rounded-xl border border-amber-500/25">
                  <span className="mt-0.5 text-amber-400 shrink-0 text-lg leading-none">!</span>
                  <div>
                    <div className="text-sm font-semibold text-amber-300">Travel distance 23.4 m — limit 22.5 m</div>
                    <div className="text-xs text-white/60 mt-0.5">BNBC 2012 Part 3, Sec 1.13.8.2</div>
                  </div>
                </div>
              </div>

              {primaryBenchmark && (
                <button
                  type="button"
                  onClick={() => onOpenSample(primaryBenchmark.sample, 'report')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#0A1324] bg-white hover:bg-blue-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap self-start"
                >
                  Open demo in report view
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Panel 2: AI trace */}
            <div className="bg-[#F4F5F7] rounded-xl p-7 sm:p-8 flex flex-col space-y-5">
              <div>
                <div className="text-xs uppercase tracking-widest font-medium text-[#12111A]/40 mb-3">
                  {t('landing.show.trace.kicker')}
                </div>
                <h3 className="font-display text-xl font-bold tracking-tight text-[#12111A]">
                  {t('landing.show.trace.title')}
                </h3>
              </div>

              <div className="flex-1 space-y-2">
                <div className="p-3 bg-white rounded-xl border border-[#12111A]/10 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#12111A]/35 tabular-nums shrink-0 w-5">01</span>
                    <span className="text-xs font-semibold text-[#12111A]">Layout search proposes</span>
                  </div>
                  <p className="text-sm text-[#12111A]/70 pl-7">Add exit door, north wall, midpoint, 1.2 m wide</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#12111A]/10 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#12111A]/35 tabular-nums shrink-0 w-5">02</span>
                    <span className="text-xs font-semibold text-[#12111A]">Code re-checks</span>
                  </div>
                  <p className="text-sm text-[#12111A]/70 pl-7">Travel drops 23.4 m → 15.7 m. Finding cleared. No new failure.</p>
                </div>
                <div className="p-3 bg-white rounded-xl border border-[#12111A]/10 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#12111A]/35 tabular-nums shrink-0 w-5">03</span>
                    <span className="text-xs font-semibold text-[#12111A]">You decide</span>
                  </div>
                  <p className="text-sm text-[#12111A]/70 pl-7">Approve or skip each proposed change before anything is applied.</p>
                </div>
              </div>

              <p className="text-xs text-[#12111A]/50 leading-relaxed">
                Every measurement comes from the rule engine. The layout search never states a number of its own.
              </p>
            </div>

            {/* Panel 3: Bilingual report */}
            <div className="bg-white border border-[#12111A]/10 rounded-xl p-7 sm:p-8 flex flex-col space-y-5">
              <div>
                <div className="text-xs uppercase tracking-widest font-medium text-[#12111A]/40 mb-3">
                  {t('landing.show.bi.kicker')}
                </div>
                <h3 className="font-display text-xl font-bold tracking-tight text-[#12111A]">
                  {t('landing.show.bi.title')}
                </h3>
              </div>

              <div className="flex-1 space-y-3">
                <div className="p-4 bg-[#F4F5F7] rounded-xl border border-[#12111A]/[0.06]">
                  <div className="text-[11px] font-mono text-[#12111A]/45 mb-2 uppercase tracking-wider">English</div>
                  <div className="font-semibold text-[#12111A] text-sm">Travel distance exceeds limit</div>
                  <div className="text-sm text-[#12111A]/70 mt-1">Measured: 23.4 m · Limit: 22.5 m</div>
                  <div className="text-xs text-[#12111A]/50 mt-1">BNBC 2012, Part 3, Sec 1.13.8.2</div>
                </div>
                <div className="p-4 bg-[#F4F5F7] rounded-xl border border-[#12111A]/[0.06]" style={{ fontFamily: "'Noto Sans Bengali', sans-serif" }}>
                  <div className="text-[11px] font-mono text-[#12111A]/45 mb-2 uppercase tracking-wider">বাংলা</div>
                  <div className="font-semibold text-[#12111A] text-sm">ভ্রমণ দূরত্ব সীমা ছাড়িয়েছে</div>
                  <div className="text-sm text-[#12111A]/70 mt-1">মাপা: ২৩.৪ মিটার · সীমা: ২২.৫ মিটার</div>
                  <div className="text-xs text-[#12111A]/50 mt-1">বিএনবিসি ২০১২, খণ্ড ৩, অনুচ্ছেদ ১.১৩.৮.২</div>
                </div>
              </div>

              <p className="text-xs text-[#12111A]/50 leading-relaxed">
                Every number is the same in both languages—the rule engine measures once.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Step-by-Step Process Section: How Teams Use DrawFix AI */}
      <section
        id="process"
        className="scroll-mt-20 bg-[#F4F5F7] py-16 sm:py-20 lg:py-24 px-4 sm:px-8 border-t border-[#12111A]/[0.06]"
      >
        <div className="max-w-[1180px] mx-auto space-y-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-2.5">
              <div className="text-xs uppercase tracking-widest font-medium text-[#12111A]/40">
                {t('landing.process.kicker')}
              </div>
              <h2 className="font-display text-[clamp(2.1rem,3.8vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1.08] text-[#12111A] text-balance">
                {t('landing.process.title1')}
                {t('landing.process.title2')}
              </h2>
            </div>
            <p className="max-w-md text-base leading-relaxed text-[#12111A]/70 lg:text-right">
              {t('landing.process.lead')}
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PROCESS_STEPS.map((step) => (
              <li
                key={step.number}
                className="bg-white border border-[#12111A]/10 rounded-xl p-6 sm:p-7 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="font-mono text-sm font-bold text-[#12111A]/40 tabular-nums">
                    {t('landing.stepN', { n: num(step.number) })}
                  </div>
                  <h3 className="font-display text-xl font-bold tracking-tight text-[#12111A]">
                    {t(step.title as MsgKey)}
                  </h3>
                  <p className="text-[15px] text-[#12111A]/70 leading-relaxed">{t(step.body as MsgKey)}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onGoToUpload}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#12111A] hover:bg-[#2563EB] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              {t('landing.process.cta1')}
            </button>
            <button
              type="button"
              onClick={onGoToPermits}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#12111A] bg-white border border-[#12111A]/15 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {t('landing.process.cta2')}
            </button>
          </div>
        </div>
      </section>

      {/* 3. Role-Specific Workflows: Architects vs. Government Scrutiny Desks */}
      <section
        id="workflows"
        className="scroll-mt-20 bg-white py-16 sm:py-20 lg:py-24 px-4 sm:px-8"
      >
        <div className="max-w-[1180px] mx-auto space-y-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <h2 className="max-w-xl font-display text-[clamp(2.1rem,3.8vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1.08] text-[#12111A] text-balance">
              {t('landing.wf.title1')}
              {t('landing.wf.title2')}
            </h2>
            <p className="max-w-md text-base leading-relaxed text-[#12111A]/70 lg:text-right">
              {t('landing.wf.lead')}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-7 bg-[#F4F5F7] border border-[#12111A]/10 rounded-xl p-7 sm:p-9 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div>
                  <span className="text-xs uppercase tracking-widest font-medium text-[#12111A]/40">
                    {t('landing.wf.arch.kicker')}
                  </span>
                </div>
                <h3 className="font-display text-2xl sm:text-[1.7rem] font-bold tracking-tight text-[#12111A]">
                  {t('landing.wf.arch.title')}
                </h3>
                <ul className="space-y-2.5 text-[15px] sm:text-base text-[#12111A]/75 leading-relaxed list-disc pl-5">
                  <li>
                    {t('landing.wf.arch.b1')}
                  </li>
                  <li>
                    {t('landing.wf.arch.b2')}
                  </li>
                  <li>
                    {t('landing.wf.arch.b3')}
                  </li>
                </ul>
              </div>
              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    onChangeReviewerRole('architect');
                    onGoToUpload();
                  }}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#12111A] hover:bg-[#2563EB] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {t('landing.wf.arch.cta')}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onGoToPermits}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-[#2563EB] hover:underline cursor-pointer whitespace-nowrap"
                >
                  {t('landing.wf.arch.cta2')}
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 bg-[#0D1120] text-white rounded-xl p-7 sm:p-9 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div>
                  <span className="text-xs uppercase tracking-widest font-medium text-white/40">
                    {t('landing.wf.gov.kicker')}
                  </span>
                </div>
                <h3 className="font-display text-2xl sm:text-[1.7rem] font-bold tracking-tight">
                  {t('landing.wf.gov.title')}
                </h3>
                <ul className="space-y-2.5 text-[15px] sm:text-base text-white/80 leading-relaxed list-disc pl-5">
                  <li>
                    {t('landing.wf.gov.b1')}
                  </li>
                  <li>
                    {t('landing.wf.gov.b2')}
                  </li>
                  <li>
                    {t('landing.wf.gov.b3')}
                  </li>
                </ul>
              </div>
              {primaryBenchmark && (
                <button
                  type="button"
                  onClick={() => {
                    onChangeReviewerRole('government');
                    onOpenSample(primaryBenchmark.sample, 'report');
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-[#12111A] bg-white hover:bg-[#60A5FA] hover:text-white rounded-lg transition-colors cursor-pointer self-start whitespace-nowrap"
                >
                  {t('landing.wf.gov.cta')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Rules Registry & Boundaries */}
      <section
        id="rules"
        className="scroll-mt-20 bg-[#F4F5F7] py-16 sm:py-20 lg:py-24 px-4 sm:px-8 border-y border-[#12111A]/[0.06]"
      >
        <div className="max-w-[1180px] mx-auto space-y-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-2.5">
              <h2 className="font-display text-[clamp(2rem,3.4vw,2.85rem)] font-bold tracking-[-0.03em] leading-[1.1] text-[#12111A]">
                {t('landing.rules.title')}
              </h2>
              {uiLang === 'bn' ? (
                <p className="text-base text-[#12111A]/70 leading-relaxed">
                  <strong className="text-[#12111A]">যাচাই করা</strong> চিহ্নিত সীমাগুলো{' '}
                  <a href={BNBC_P3_SOURCE_URL} target="_blank" rel="noreferrer" className="text-[#2563EB] underline underline-offset-2">
                    বিএনবিসি ২০১২ খণ্ড ৩, অধ্যায় ১-এর মূল পাঠ
                  </a>{' '}
                  থেকে হুবহু নেওয়া। <strong className="text-[#12111A]">স্ক্রিনিং</strong> চিহ্নিত সীমাগুলো প্রোটোটাইপ মান,
                  এখনও গেজেটের সঙ্গে মেলানো হয়নি; একজন লাইসেন্সধারী পর্যালোচককে এগুলো নিশ্চিত করতে হবে।
                </p>
              ) : (
              <p className="text-base text-[#12111A]/70 leading-relaxed">
                  Limits tagged <strong className="text-[#12111A]">Verified</strong> are taken verbatim
                  from the{' '}
                  <a
                    href={BNBC_P3_SOURCE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#2563EB] underline underline-offset-2"
                  >
                    BNBC 2012 Part 3, Chapter 1 source text
                  </a>
                  . Limits tagged <strong className="text-[#12111A]">Screening</strong> are screening
                  values not yet checked against the gazette; a licensed reviewer must confirm them.
                </p>
              )}
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#12111A]/10 rounded-xl self-start">
              {(
                [
                  ['all', t('landing.filter.all', { n: ruleList.length })],
                  ['verified', t('landing.filter.verified', { n: verifiedRules })],
                  ['screening', t('landing.filter.screening', { n: screeningRules })],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRuleFilter(key)}
                  className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    ruleFilter === key
                      ? 'bg-[#12111A] text-white'
                      : 'text-[#12111A]/65 hover:text-[#12111A]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#12111A]/10 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-[15px] border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[#12111A]/[0.08] bg-[#F4F5F7]/70 text-sm text-[#12111A]/65">
                  <th className="py-3.5 px-5 font-semibold">{t('landing.rules.th1')}</th>
                  <th className="py-3.5 px-5 font-semibold">{t('landing.rules.th2')}</th>
                  <th className="py-3.5 px-5 font-semibold">{t('landing.rules.th3')}</th>
                  <th className="py-3.5 px-5 font-semibold">{t('landing.rules.th4')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12111A]/[0.06]">
                {filteredRules.map(([id, r]) => (
                  <tr key={id}>
                    <td className="py-3.5 px-5 text-sm font-mono text-[#12111A]/65 whitespace-nowrap">
                      {t(getRuleDomain(id))}
                    </td>
                    <td className="py-3.5 px-5 font-medium text-[#12111A]">{uiLang === 'bn' && r.nameBn ? r.nameBn : r.name}</td>
                    <td className="py-3.5 px-5">
                      <BasisBadge basis={r.basis} />
                    </td>
                    <td className="py-3.5 px-5 text-sm text-[#12111A]/70">{r.citation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-[#12111A]/10 rounded-xl p-6 sm:p-7 space-y-3">
              <h3 className="font-display text-lg font-semibold text-[#12111A]">
                {t('landing.inputs.title')}
              </h3>
              <ul className="text-[15px] text-[#12111A]/70 space-y-2 list-disc pl-5">
                <li>{t('landing.inputs.b1')}</li>
                <li>{t('landing.inputs.b2')}</li>
                <li>{t('landing.inputs.b3')}</li>
              </ul>
            </div>
            <div className="bg-white border border-[#12111A]/10 rounded-xl p-6 sm:p-7 space-y-3">
              <h3 className="font-display text-lg font-semibold text-[#12111A]">
                {t('landing.limits.title')}
              </h3>
              <ul className="text-[15px] text-[#12111A]/70 space-y-2 list-disc pl-5">
                <li>{t('landing.limits.b1')}</li>
                <li>{t('landing.limits.b2')}</li>
                <li>{t('landing.limits.b3')}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. FAQ Accordion */}
      <section id="faq" className="scroll-mt-20 bg-white py-16 sm:py-20 lg:py-24 px-4 sm:px-8">
        <div className="max-w-[920px] mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h2 className="font-display text-[clamp(2.1rem,3.8vw,3.25rem)] font-bold tracking-[-0.03em] text-[#12111A]">
              {t('landing.faq.title1')} {t('landing.faq.title2')}
            </h2>
            <p className="text-base sm:text-lg text-[#12111A]/65 max-w-lg mx-auto">
              {t('landing.faq.lead')}
            </p>
          </div>

          <div className="divide-y divide-[#12111A]/[0.08] border-y border-[#12111A]/[0.08]">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div key={item.q} className="py-5 sm:py-6">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 text-left cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-baseline gap-4">
                      <span className="font-mono text-sm text-[#12111A]/45 tabular-nums">
                        {num(`0${idx + 1}`)}
                      </span>
                      <span className="font-display text-lg sm:text-xl font-semibold text-[#12111A]">
                        {t(item.q as MsgKey)}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-[#12111A]/50 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-3.5 pl-9 text-base text-[#12111A]/70 leading-relaxed">
                      {t(item.a as MsgKey)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer with Monumental Bottom Brand Wordmark */}
      <footer className="bg-[#0D1120] text-white border-t border-white/10 overflow-hidden">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-14 pb-6 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex items-center gap-4">
              <DrawFixLogo size={56} />
              <div className="space-y-1">
                <div className="font-display font-bold text-xl tracking-tight text-white">
                  DrawFix AI
                </div>
                <p className="text-sm text-slate-400 max-w-sm">
                  {t('landing.footer.tagline')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-slate-300">
              <a href="#process" className="hover:text-white transition-colors">
                {t('nav.process')}
              </a>
              <a href="#workflows" className="hover:text-white transition-colors">
                {t('nav.workflows')}
              </a>
              <button
                type="button"
                onClick={onGoToPermits}
                className="hover:text-white transition-colors cursor-pointer"
              >
                {t('nav.permits')}
              </button>
              <a href="#rules" className="hover:text-white transition-colors">
                {t('nav.rules')}
              </a>
              <button
                type="button"
                onClick={onGoToUpload}
                className="hover:text-white transition-colors cursor-pointer"
              >
                {t('landing.footer.upload')}
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 text-xs text-slate-400">
            {t('landing.footer.disclaimer')}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-4 overflow-hidden select-none"
        >
          <div className="font-display font-bold text-[clamp(4.25rem,17.5vw,15rem)] leading-[0.8] tracking-[-0.045em] text-center whitespace-nowrap bg-gradient-to-b from-white/[0.17] via-white/[0.09] to-transparent bg-clip-text text-transparent translate-y-[8%]">
            DrawFix AI
          </div>
        </div>
      </footer>
    </div>
  );
}
