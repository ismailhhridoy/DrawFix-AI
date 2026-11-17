import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Compass,
  FileCode2,
  Layers,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { DEFAULT_CONVENTIONS, parseDxfString } from '../engine/dxfParser';
import {
  applyBuildingRemediationFixes,
  runBuildingAudit,
} from '../engine/ruleEngine';
import { SAMPLE_BUILDINGS, type SampleBuildingMeta } from '../engine/sampleDxf';
import type { AppStep } from '../types/plan';

interface LandingPageProps {
  onOpenSample: (sample: SampleBuildingMeta, step: AppStep) => void;
  onGoToUpload: () => void;
}

const HERO_IMAGE = '/src/assets/images/hero_architecture_studio_1794756385005.jpg';
const FACILITY_IMAGE = '/src/assets/images/bento_garment_facility_1794756385553.jpg';
const RESIDENTIAL_IMAGE = '/src/assets/images/bento_residential_block_1794756386027.jpg';

interface BenchmarkRow {
  sample: SampleBuildingMeta;
  floorCount: number;
  roomCount: number;
  beforeFail: number;
  beforeWarn: number;
  afterFail: number;
  beforeWorstSec: number;
  afterWorstSec: number;
  deltaCount: number;
  achievedFar: number;
  maxFar: number;
}

export function LandingPage({ onOpenSample, onGoToUpload }: LandingPageProps) {
  const [heroImgOk, setHeroImgOk] = useState(true);
  const [facilityImgOk, setFacilityImgOk] = useState(true);
  const [resImgOk, setResImgOk] = useState(true);

  const benchmarks: BenchmarkRow[] = useMemo(() => {
    return SAMPLE_BUILDINGS.map((sample) => {
      const parsedFloors = sample.floors.map((fl) =>
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
      const proj = {
        id: sample.id,
        name: sample.name,
        subtitle: sample.subtitle,
        occupancyClass: sample.occupancyClass,
        storyHeightM: sample.storyHeightM,
        siteContext: { ...sample.siteContext },
        floors: parsedFloors,
      };
      const beforeAudit = runBuildingAudit(proj);
      const { fixedProject, deltas } = applyBuildingRemediationFixes(proj, beforeAudit);
      const afterAudit = runBuildingAudit(fixedProject);

      return {
        sample,
        floorCount: parsedFloors.length,
        roomCount: parsedFloors.reduce((acc, f) => acc + f.rooms.length, 0),
        beforeFail: beforeAudit.failCount,
        beforeWarn: beforeAudit.warnCount,
        afterFail: afterAudit.failCount,
        beforeWorstSec: beforeAudit.worstEscapeSec,
        afterWorstSec: afterAudit.worstEscapeSec,
        deltaCount: deltas.length,
        achievedFar: beforeAudit.metrics?.achievedFar ?? 0,
        maxFar: beforeAudit.metrics?.maxAllowedFar ?? 0,
      };
    });
  }, []);

  const totals = useMemo(() => {
    const totalFailuresResolved = benchmarks.reduce(
      (s, b) => s + (b.beforeFail - b.afterFail),
      0
    );
    const totalZones = benchmarks.reduce((s, b) => s + b.roomCount, 0);
    const totalTransforms = benchmarks.reduce((s, b) => s + b.deltaCount, 0);
    return {
      buildingsCount: benchmarks.length,
      totalFailuresResolved,
      totalZones,
      totalTransforms,
    };
  }, [benchmarks]);

  const primaryBenchmark = benchmarks[0];

  return (
    <div className="bg-[#F4F6F9] text-slate-900">
      {/* 1. Asymmetric 12-Column Editorial Hero */}
      <section className="max-w-[1280px] mx-auto px-6 pt-10 pb-12 lg:pt-14 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-between space-y-8 py-2">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-600">
                <span>BNBC 2012 / 2020</span>
                <span aria-hidden="true">·</span>
                <span>Dhaka Imarat Bidhimala 2008</span>
                <span aria-hidden="true">·</span>
                <span>RAJUK & FSCD Pre-Scrutiny</span>
              </div>

              <h1 className="font-display text-[clamp(2.25rem,3.9vw,3.4rem)] font-bold tracking-tight text-slate-900 leading-[1.1] text-balance">
                Verify fire egress, zoning and habitability before concrete is poured.
              </h1>

              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
                PlanCheck AI reads AutoCAD DXF drawings across single and multi-story stacks,
                runs deterministic geometric checks with exact Bangladesh code citations, and
                simulates evacuation in 3D before plan submission.
              </p>

              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                অটোক্যাড (.dxf) নকশা থেকে নির্ভুল দূরত্ব, FAR, MGC, প্রাকৃতিক আলো ও বহির্গমন পথ যাচাই করুন
                এবং এক ক্লিকে ইংরেজি ও বাংলায় যাচাই স্মারক প্রস্তুত করুন।
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onOpenSample(SAMPLE_BUILDINGS[0], 'report')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  Inspect 3-Story Audit
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onGoToUpload}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-slate-600" />
                  Upload .DXF Plans
                </button>

                <button
                  type="button"
                  onClick={() => onOpenSample(SAMPLE_BUILDINGS[0], 'simulate')}
                  className="inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium text-blue-800 hover:text-blue-900 underline underline-offset-4 cursor-pointer"
                >
                  Open 3D Escape View
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>

              <div className="pt-4 border-t border-slate-200/90 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
                <span>Deterministic TypeScript rule engine</span>
                <span aria-hidden="true">·</span>
                <span>Zero AI-guessed measurements</span>
                <span aria-hidden="true">·</span>
                <span>Source .DXF files remain untouched</span>
              </div>
            </div>
          </div>

          {/* Hero Visual Frame */}
          <div className="lg:col-span-5 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 min-h-[340px] lg:min-h-[460px] shadow-sm">
            {heroImgOk ? (
              <img
                src={HERO_IMAGE}
                alt="Architectural engineering drafting desk with floor plans overlooking the Dhaka skyline"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgOk(false)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 flex flex-col items-center justify-center p-8 text-center">
                <Compass className="w-10 h-10 text-blue-300 mb-3" />
                <div className="font-display text-base font-semibold text-white">
                  PlanCheck AI CAD Workbench
                </div>
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent pointer-events-none" />

            {primaryBenchmark && (
              <div className="absolute bottom-0 inset-x-0 p-5 text-white space-y-2">
                <div className="text-[11px] font-mono text-slate-300 flex items-center justify-between gap-2">
                  <span>Active Reference Stack</span>
                  <span className="tabular-nums">
                    {primaryBenchmark.floorCount} Floors · {primaryBenchmark.roomCount} Zones
                  </span>
                </div>
                <div className="font-display text-base font-semibold leading-snug">
                  {primaryBenchmark.sample.name}
                </div>
                <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/15 text-xs font-mono tabular-nums">
                  <span className="text-red-300">
                    As-Drawn: {primaryBenchmark.beforeFail} Fail /{' '}
                    {primaryBenchmark.beforeWarn} Warn
                  </span>
                  <span className="text-emerald-300">
                    Remediated: {primaryBenchmark.afterFail} Fail (
                    {primaryBenchmark.afterWorstSec.toFixed(1)}s)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Full-Width Verified Baseline Metrics Strip (Computed Live) */}
        <div className="mt-10 bg-white border border-slate-200/90 rounded-xl shadow-xs grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/90">
          <div className="p-5 sm:p-6">
            <div className="text-xs text-slate-500">Pre-Loaded Test Buildings</div>
            <div className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
              {totals.buildingsCount} Stacks
            </div>
            <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
              {totals.totalZones} CAD room zones parsed
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="text-xs text-slate-500">Code Failures Resolved</div>
            <div className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
              {totals.totalFailuresResolved} → 0
            </div>
            <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
              Across {totals.totalTransforms} non-destructive JSON fixes
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="text-xs text-slate-500">Multi-Domain Scope</div>
            <div className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
              4 Code Domains
            </div>
            <div className="mt-1 text-xs font-mono text-slate-500">
              Egress · FAR/MGC · Habitability · Capacity
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <div className="text-xs text-slate-500">Scrutiny Output</div>
            <div className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
              EN + বাংলা
            </div>
            <div className="mt-1 text-xs font-mono text-slate-500">
              Grounded RAG + PDF + RAJUK Memo
            </div>
          </div>
        </div>
      </section>

      {/* 2. Capabilities Bento Grid (01 - 04) */}
      <section
        id="capabilities"
        className="max-w-[1280px] mx-auto px-6 py-12 lg:py-16 border-t border-slate-200/80 space-y-8"
      >
        <div className="max-w-2xl space-y-2">
          <div className="text-xs font-mono text-blue-700 font-semibold">
            Architecture & Core Modules
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Built around geometry first, with grounded AI where drawings get messy.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 01 Wide Bento Card */}
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-xs grid grid-cols-1 md:grid-cols-12">
            <div className="md:col-span-7 p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="text-xs font-mono text-slate-500">
                  01. Multi-Floor CAD Extraction
                </div>
                <h3 className="font-display text-xl font-semibold text-slate-900">
                  Multi-Story .DXF Stacking & Stair Continuity
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Drop Ground, Level 2, and Level 3 DXF drawings together or append floors
                  incrementally. Extracts walls, doors, windows, stair cores, room polygons,
                  and detects stale manual CAD dimension overrides.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
                <span className="font-mono text-slate-500">
                  $INSUNITS mm/m · AI Layer Inference
                </span>
                <button
                  type="button"
                  onClick={onGoToUpload}
                  className="font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  Try Upload <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="md:col-span-5 min-h-[220px] bg-slate-100 relative">
              {facilityImgOk ? (
                <img
                  src={FACILITY_IMAGE}
                  alt="Modern multi-story garment manufacturing building with glass exterior stairwell"
                  referrerPolicy="no-referrer"
                  onError={() => setFacilityImgOk(false)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-slate-500" />
                </div>
              )}
            </div>
          </div>

          {/* 02 Compact Bento Card */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-6 flex flex-col justify-between shadow-xs space-y-5">
            <div className="space-y-3">
              <div className="text-xs font-mono text-slate-500">
                02. Real-Estate & RAJUK Zoning
              </div>
              <h3 className="font-display text-xl font-semibold text-slate-900">
                Imarat Bidhimala 2008 FAR, MGC & Habitability
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Computes Ground Coverage (MGC %), achieved vs. road-width FAR, front/rear/side
                setbacks, occupant-load exit capacity, and bedroom minimum area and exterior
                daylight windows live as plot parameters change.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
              <div>
                <div className="text-slate-500">Egress</div>
                <div className="font-semibold text-slate-900 mt-0.5">16.0 / 22.5 m</div>
              </div>
              <div>
                <div className="text-slate-500">Bedroom Min</div>
                <div className="font-semibold text-slate-900 mt-0.5">9.5 m²</div>
              </div>
              <div>
                <div className="text-slate-500">Stair Width</div>
                <div className="font-semibold text-slate-900 mt-0.5">1.20–1.50 m</div>
              </div>
            </div>
          </div>

          {/* 03 Compact Bento Card */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl p-6 flex flex-col justify-between shadow-xs space-y-5">
            <div className="space-y-3">
              <div className="text-xs font-mono text-slate-500">
                03. Vertical Escape Simulation
              </div>
              <h3 className="font-display text-xl font-semibold text-slate-900">
                Interactive 3D Building Stack & Before/After Diffs
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Trace 3D A* evacuation paths from any upper-floor room down stair flights to
                street discharge at 1.2 m/s horizontal and 0.75 m/s stair descent, with exploded
                floor cutaways and shareable deep-links.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-500">
                Non-destructive JSON remediation
              </span>
              <button
                type="button"
                onClick={() => onOpenSample(SAMPLE_BUILDINGS[0], 'simulate')}
                className="font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer"
              >
                Launch 3D View <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 04 Wide Bento Card */}
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-xs grid grid-cols-1 md:grid-cols-12">
            <div className="md:col-span-5 min-h-[220px] bg-slate-100 relative order-2 md:order-1">
              {resImgOk ? (
                <img
                  src={RESIDENTIAL_IMAGE}
                  alt="Contemporary brick and concrete apartment building in Dhaka with shaded balconies and courtyard setbacks"
                  referrerPolicy="no-referrer"
                  onError={() => setResImgOk(false)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                  <Layers className="w-8 h-8 text-slate-500" />
                </div>
              )}
            </div>

            <div className="md:col-span-7 p-6 flex flex-col justify-between space-y-4 order-1 md:order-2">
              <div className="space-y-3">
                <div className="text-xs font-mono text-slate-500">
                  04. Hybrid RAG Code Copilot
                </div>
                <h3 className="font-display text-xl font-semibold text-slate-900">
                  Clause-Grounded Q&A & Bilingual Scrutiny Memos
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Combines Gemini semantic embeddings with BM25 lexical ranking over curated
                  BNBC & Imarat clauses to answer reviewer questions with strict citations and
                  draft English + বাংলা RAJUK/FSCD objection memos.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
                <span className="font-mono text-slate-500">
                  PDF Export · TXT Memo · Share URL
                </span>
                <button
                  type="button"
                  onClick={() => onOpenSample(SAMPLE_BUILDINGS[0], 'export')}
                  className="font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  Inspect Memo <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Live Case Benchmarks (Wired directly to SAMPLE_BUILDINGS) */}
      <section
        id="benchmarks"
        className="max-w-[1280px] mx-auto px-6 py-12 lg:py-16 border-t border-slate-200/80 space-y-8"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs font-mono text-blue-700 font-semibold">
              Verified Sample CAD Benchmarks
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Open any pre-parsed building stack directly in the audit workbench.
            </h2>
          </div>
          <button
            type="button"
            onClick={onGoToUpload}
            className="text-sm font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            Or upload your own .DXF <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {benchmarks.map((row) => {
            const isMulti = row.floorCount > 1;
            const beforeTimeStr = Number.isFinite(row.beforeWorstSec)
              ? `${row.beforeWorstSec.toFixed(1)}s`
              : 'Blocked';
            const afterTimeStr = Number.isFinite(row.afterWorstSec)
              ? `${row.afterWorstSec.toFixed(1)}s`
              : 'Blocked';

            return (
              <div
                key={row.sample.id}
                className="bg-white border border-slate-200/90 rounded-xl p-6 shadow-xs flex flex-col justify-between space-y-5"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3 text-xs font-mono text-slate-500">
                    <span>
                      {isMulti ? `${row.floorCount}-Story Stack` : 'Single-Floor DXF'} ·{' '}
                      {row.roomCount} Zones
                    </span>
                    <span className="tabular-nums">
                      FAR {row.achievedFar.toFixed(2)} / {row.maxFar.toFixed(2)}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {row.sample.name}
                  </h3>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    {row.sample.summary}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs font-mono tabular-nums">
                    <div>
                      <div className="text-slate-500">Before Audit</div>
                      <div className="font-semibold text-red-700 mt-0.5">
                        {row.beforeFail} Fail · {row.beforeWarn} Warn
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">After JSON Fix</div>
                      <div className="font-semibold text-emerald-700 mt-0.5">
                        {row.afterFail} Fail ({row.deltaCount} diffs)
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Worst Escape</div>
                      <div className="font-semibold text-slate-900 mt-0.5">
                        {beforeTimeStr} → {afterTimeStr}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenSample(row.sample, 'report')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <FileCode2 className="w-3.5 h-3.5" />
                      Open Audit Report
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSample(row.sample, 'simulate')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                    >
                      3D Escape Simulation
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSample(row.sample, 'review')}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800 px-2 py-2 cursor-pointer"
                    >
                      Review Geometry
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Dark Slate Contrast Band: Deterministic vs. Grounded AI & Honest Boundaries */}
      <section id="scope" className="bg-slate-900 text-slate-100 py-14 lg:py-16">
        <div className="max-w-[1280px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-blue-300">
              <ShieldCheck className="w-4 h-4" />
              <span>Engineering Truth Contract</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance">
              Every distance, FAR and occupant count is measured in deterministic code.
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Language models never guess geometry or invent code thresholds. If a rule
              violation appears in a report, a specific TypeScript measurement function
              calculated it directly from parsed DXF coordinates.
            </p>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="border border-slate-700/80 bg-slate-800/60 rounded-xl p-5 space-y-2.5">
              <div className="text-xs font-mono font-semibold text-emerald-300">
                What Deterministic Code Executes
              </div>
              <ul className="space-y-2 text-xs text-slate-200 leading-relaxed">
                <li>· DXF polyline, wall, door, window, stair & dimension extraction</li>
                <li>· 2D & vertical multi-floor A* egress distance and travel seconds</li>
                <li>· BNBC occupant load, exit capacity, bedroom area & daylight checks</li>
                <li>· Dhaka Imarat Bidhimala 2008 FAR, MGC % & plot setback verification</li>
              </ul>
            </div>

            <div className="border border-slate-700/80 bg-slate-800/60 rounded-xl p-5 space-y-2.5">
              <div className="text-xs font-mono font-semibold text-blue-300">
                What Grounded AI & Explicit Scope Cover
              </div>
              <ul className="space-y-2 text-xs text-slate-200 leading-relaxed">
                <li>· Infers non-standard CAD layer names & messy Bangla/English room tags</li>
                <li>· Answers code queries via Hybrid Embedding + BM25 clause retrieval</li>
                <li>· Drafts EN + বাংলা RAJUK/FSCD memos locked to rule-engine numbers</li>
                <li>· Out of scope: modifying source DWGs, seismic FEM, official permits</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Quiet Architectural Footer */}
      <footer className="bg-white border-t border-slate-200 py-8">
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display font-bold text-sm text-slate-900">
              PlanCheck AI
            </span>
            <span aria-hidden="true">·</span>
            <span>BNBC 2012/2020 & Dhaka Imarat Bidhimala 2008 Pre-Scrutiny Workbench</span>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-medium text-slate-600">
            <button
              type="button"
              onClick={onGoToUpload}
              className="hover:text-slate-900 cursor-pointer"
            >
              Upload .DXF
            </button>
            <button
              type="button"
              onClick={() => onOpenSample(SAMPLE_BUILDINGS[0], 'report')}
              className="hover:text-slate-900 cursor-pointer"
            >
              Compliance Audit
            </button>
            <button
              type="button"
              onClick={() => onOpenSample(SAMPLE_BUILDINGS[0], 'simulate')}
              className="hover:text-slate-900 cursor-pointer"
            >
              3D Escape Simulator
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
