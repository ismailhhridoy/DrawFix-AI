import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  FileCheck2,
  FileWarning,
  ShieldAlert,
  ShieldCheck,
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
    title: 'Upload AutoCAD DXF',
    body: 'Drop a single floor plan or stack multiple floor files (GF, L2, L3). The parser detects drawing units, wall segments, door openings, windows, stairs, and dimension overrides directly in your browser.',
  },
  {
    number: '02',
    title: 'Confirm Rooms & Plot Data',
    body: 'Verify extracted room classifications, mark exterior exit doors, and enter plot area, abutting road width, and declared setbacks for FAR and ground coverage evaluation.',
  },
  {
    number: '03',
    title: 'Audit Rules, Fixes & 3D Flow',
    body: 'Inspect flagged BNBC and zoning violations mapped onto the 2D blueprint, preview geometric adjustments on an isolated copy, and verify floor-to-exit circulation in 3D.',
  },
  {
    number: '04',
    title: 'Respond & Export Package',
    body: 'Generate jurisdiction checklists (RAJUK, CDA, City Corp, FSCD), match authority corrections letters against CAD findings, and download PDF reports or scrutiny sheets.',
  },
];

function getRuleDomain(ruleId: string): string {
  if (
    ruleId.includes('far') ||
    ruleId.includes('mgc') ||
    ruleId.includes('setback') ||
    ruleId.includes('highrise')
  ) {
    return 'Zoning & Height';
  }
  if (ruleId.includes('bedroom') || ruleId.includes('ventilation')) {
    return 'Habitability';
  }
  if (ruleId.includes('stair')) {
    return 'Stair Safety';
  }
  if (ruleId.includes('dimension')) {
    return 'CAD Integrity';
  }
  return 'Fire & Egress';
}

const FAQ_ITEMS = [
  {
    q: 'Can approval authorities run DrawFix Ai on restricted or offline networks?',
    a: 'Yes. DXF parsing, polygon detection, shortest-path routing, FAR/MGC/setback calculations, and scrutiny worksheets run locally in your browser. Drawing files never leave the workstation.',
  },
  {
    q: 'How does it speed up government plan review?',
    a: 'Officers upload a multi-floor DXF stack and immediately get a structured scrutiny summary: mismatched CAD dimension labels, > 20 m high-rise triggers, zoning ratio checks, habitable room sizing, egress bottlenecks, and a downloadable Scrutiny Objection Sheet.',
  },
  {
    q: 'What can architects validate prior to municipal filing?',
    a: 'Architects verify zoning coverage, sleeping room minimums (9.5 m² area, 2.9 m width), 15% daylight openings, stair proportions, and escape distances before paying filing fees—plus prepare point-by-point replies to authority objection letters.',
  },
  {
    q: 'Which code limits are verified vs. advisory screening thresholds?',
    a: 'Nine rules use exact limits verified verbatim in BNBC 2012 Part 3 Chapter 1 (stairs, headroom, handrails, bedroom size/width, daylight openings, cabin passages, and 20 m high-rise limit). Twelve zoning and occupancy egress rules use conservative advisory values confirmed by a licensed reviewer.',
  },
  {
    q: 'Does DrawFix Ai modify the source AutoCAD DXF file?',
    a: 'Never. Uploaded DXF drawings stay strictly read-only. Proposed geometric adjustments are modeled on a separate copy for side-by-side comparison.',
  },
];

export function LandingPage({
  reviewerRole,
  onChangeReviewerRole,
  onOpenSample,
  onGoToUpload,
  onGoToPermits,
}: LandingPageProps) {
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
        <div className="relative overflow-hidden bg-[#0A1324] text-white pt-14 pb-36 sm:pt-20 sm:pb-44 lg:pt-24 lg:pb-52">
          <HeroCadBackdrop />

          <div className="relative z-10 max-w-[1180px] mx-auto px-4 sm:px-8">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <div className="flex flex-wrap items-center justify-center gap-2.5 text-sm font-medium text-blue-200/90">
                <span>Building Plan Scrutiny</span>
                <span aria-hidden="true">·</span>
                <span>Architect Pre-Submission Validation</span>
                <span aria-hidden="true">·</span>
                <span>Permit &amp; Corrections Desk</span>
              </div>

              <h1 className="font-display text-[clamp(2.65rem,5vw,4.5rem)] font-bold tracking-[-0.035em] leading-[1.05] text-white text-balance">
                Faster government scrutiny.{' '}
                <span className="text-[#60A5FA]">Validated before filing.</span>
              </h1>

              <p className="max-w-2xl mx-auto text-lg sm:text-xl text-slate-200/90 leading-relaxed">
                DrawFix Ai checks AutoCAD DXF drawings locally in your browser across zoning,
                habitability, stair geometry, dimension accuracy, and fire egress—built for review
                officers and architectural teams.
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={onGoToUpload}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold text-[#0A1324] bg-white hover:bg-blue-50 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0 shadow-sm"
                >
                  <Upload className="w-4 h-4 text-[#2563EB]" />
                  Upload CAD Drawing
                </button>
                <button
                  type="button"
                  onClick={onGoToPermits}
                  className="inline-flex items-center gap-2 px-5 py-3.5 text-base font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/15 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 backdrop-blur-xs"
                >
                  <FileWarning className="w-4 h-4 text-[#60A5FA]" />
                  Permit &amp; Corrections Desk
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-20 max-w-[1180px] mx-auto px-4 sm:px-8 -mt-24 sm:-mt-32 lg:-mt-36">
          {/* Interactive CAD Inspection Viewport */}
          {primaryBenchmark && heroFloor && displayedHeroAudit && heroTriage && (
            <div className="rounded-[1.75rem] border border-[#12111A]/[0.10] bg-[#F4F5F7] p-3 sm:p-5 shadow-xl shadow-slate-900/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 px-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#12111A]/70">
                  <span className="font-semibold text-[#12111A]">
                    Live CAD Inspector
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {reviewerRole === 'government'
                      ? `${heroTriage.dispositionLabel} · ~${heroTriage.estimatedManualMinutesSaved} min saved`
                      : `${displayedHeroAudit.failCount} critical, ${displayedHeroAudit.warnCount} warnings`}
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
                      Architect view
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
                      Government scrutiny
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
                      As drawn
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
                      After fixes
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
                    ? `${heroFloor.floorName || 'Ground Floor'} — Scrutiny check (${heroTriage.dimensionTamperAlerts} dim overrides · ${heroFindings.length} findings)`
                    : `${heroFloor.floorName || 'Ground Floor'} — ${heroMode === 'before' ? 'Submitted geometry' : 'Validated copy'}`
                }
                mode={heroMode}
                compact
              />
            </div>
          )}

          {/* Quantitative Proof Bar */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 border border-[#12111A]/[0.08] rounded-2xl bg-white/95 backdrop-blur-xs divide-y lg:divide-y-0 lg:divide-x divide-[#12111A]/[0.08]">
            <div className="p-5 sm:p-6">
              <div className="text-sm text-[#12111A]/60">Code &amp; zoning checks</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[#12111A]">
                {ruleList.length} Rules
              </div>
              <div className="mt-1 text-sm text-[#12111A]/60 tabular-nums">
                {verifiedRules} BNBC-verified · {screeningRules} screening
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="text-sm text-[#12111A]/60">Local geometry audit</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[#12111A]">
                &lt; 3 sec
              </div>
              <div className="mt-1 text-sm text-[#12111A]/60">
                Instant measurements directly in browser
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="text-sm text-[#12111A]/60">CAD file security</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[#12111A]">
                100% Local
              </div>
              <div className="mt-1 text-sm text-[#12111A]/60">
                Source DXF drawings never modified
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="text-sm text-[#12111A]/60">AutoCAD DXF support</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-[#12111A]">
                R12–R2018
              </div>
              <div className="mt-1 text-sm text-[#12111A]/60">
                Multi-floor stack · auto $INSUNITS
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Step-by-Step Process Section: How Teams Use DrawFix Ai */}
      <section
        id="process"
        className="scroll-mt-20 bg-[#F4F5F7] py-16 sm:py-20 lg:py-24 px-4 sm:px-8 border-t border-[#12111A]/[0.06]"
      >
        <div className="max-w-[1180px] mx-auto space-y-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-2.5">
              <div className="text-sm font-mono font-semibold text-[#2563EB]">
                How to use DrawFix Ai
              </div>
              <h2 className="font-display text-[clamp(2.1rem,3.8vw,3.25rem)] font-bold tracking-[-0.03em] leading-[1.08] text-[#12111A] text-balance">
                Four steps from DXF file to{' '}
                <span className="text-[#2563EB]">permit-ready package.</span>
              </h2>
            </div>
            <p className="max-w-md text-base leading-relaxed text-[#12111A]/70 lg:text-right">
              No complex setup or CAD plugins required. Open in any desktop browser and run the
              complete workflow in minutes.
            </p>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PROCESS_STEPS.map((step) => (
              <li
                key={step.number}
                className="bg-white border border-[#12111A]/[0.07] rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="font-mono text-sm font-bold text-[#2563EB] tabular-nums">
                    Step {step.number}
                  </div>
                  <h3 className="font-display text-xl font-bold tracking-tight text-[#12111A]">
                    {step.title}
                  </h3>
                  <p className="text-[15px] text-[#12111A]/70 leading-relaxed">{step.body}</p>
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
              Start Step 01 · Upload DXF
            </button>
            <button
              type="button"
              onClick={onGoToPermits}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-[#12111A] bg-white border border-[#12111A]/15 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Go straight to Permit &amp; Corrections Desk
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
              Built for approval desks.{' '}
              <span className="text-[#2563EB]">Trusted by architects.</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-[#12111A]/70 lg:text-right">
              Switch perspective at any point inside the report or export view—both teams share the
              same verified measurements.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-7 bg-[#F4F5F7] border border-[#12111A]/[0.07] rounded-3xl p-7 sm:p-9 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-semibold text-[#2563EB]">
                    Architects &amp; Engineering Consultants
                  </span>
                  <Building2 className="w-5 h-5 text-[#2563EB]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-2xl sm:text-[1.7rem] font-bold tracking-tight text-[#12111A]">
                  Catch zoning, room, and egress issues before filing
                </h3>
                <ul className="space-y-2.5 text-[15px] sm:text-base text-[#12111A]/75 leading-relaxed list-disc pl-5">
                  <li>
                    Verify FAR, ground coverage, perimeter setbacks, sleeping rooms (9.5 m² / 2.9 m),
                    15% daylight windows, stairs, and escape distances before submission.
                  </li>
                  <li>
                    Test automated geometric fixes on an isolated drawing copy and verify floor-to-exit
                    flow in 3D.
                  </li>
                  <li>
                    Generate jurisdiction checklists (RAJUK, CDA, City Corp, FSCD) and answer
                    objection letters point by point.
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
                  Validate an architect plan
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onGoToPermits}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-[#2563EB] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Open Corrections Interpreter
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 bg-[#12111A] text-white rounded-3xl p-7 sm:p-9 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-semibold text-[#60A5FA]">
                    Government Plan Scrutiny Desks
                  </span>
                  <ShieldAlert className="w-5 h-5 text-[#60A5FA]" aria-hidden="true" />
                </div>
                <h3 className="font-display text-2xl sm:text-[1.7rem] font-bold tracking-tight">
                  Triage submitted drawings in seconds
                </h3>
                <ul className="space-y-2.5 text-[15px] sm:text-base text-white/80 leading-relaxed list-disc pl-5">
                  <li>
                    Flag overridden CAD dimension text that disagrees with drawn wall geometry.
                  </li>
                  <li>
                    Detect &gt; 20 m high-rise statutory triggers and egress bottlenecks automatically.
                  </li>
                  <li>
                    Export itemized Scrutiny Objection Sheets (.TXT / PDF) with clause citations.
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
                  Open Scrutiny Workbench
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
                Verified citations &amp; transparent limits
              </h2>
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
                . Limits tagged <strong className="text-[#12111A]">Screening</strong> apply
                conservative advisory rules confirmed by a licensed reviewer against the gazette.
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#12111A]/[0.08] rounded-xl self-start">
              {(
                [
                  ['all', `All (${ruleList.length})`],
                  ['verified', `Verified (${verifiedRules})`],
                  ['screening', `Screening (${screeningRules})`],
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

          <div className="bg-white border border-[#12111A]/[0.08] rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-[15px] border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[#12111A]/[0.08] bg-[#F4F5F7]/70 text-sm text-[#12111A]/65">
                  <th className="py-3.5 px-5 font-semibold">Domain</th>
                  <th className="py-3.5 px-5 font-semibold">Compliance check</th>
                  <th className="py-3.5 px-5 font-semibold">Trust classification</th>
                  <th className="py-3.5 px-5 font-semibold">Governing reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#12111A]/[0.06]">
                {filteredRules.map(([id, r]) => (
                  <tr key={id}>
                    <td className="py-3.5 px-5 text-sm font-mono text-[#12111A]/65 whitespace-nowrap">
                      {getRuleDomain(id)}
                    </td>
                    <td className="py-3.5 px-5 font-medium text-[#12111A]">{r.name}</td>
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
            <div className="bg-white border border-[#12111A]/[0.06] rounded-2xl p-6 sm:p-7 space-y-3">
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="w-5 h-5 text-[#2563EB]" aria-hidden="true" />
                <h3 className="font-display text-lg font-semibold text-[#12111A]">
                  Supported CAD &amp; permit inputs
                </h3>
              </div>
              <ul className="text-[15px] text-[#12111A]/70 space-y-2 list-disc pl-5">
                <li>ASCII DXF exported from AutoCAD (R12 through R2018), single or multi-floor.</li>
                <li>Walls as single lines or polylines, with physical gaps or blocks at doorways.</li>
                <li>Corrections / objection letters pasted directly or uploaded as .TXT files.</li>
              </ul>
            </div>
            <div className="bg-white border border-[#12111A]/[0.06] rounded-2xl p-6 sm:p-7 space-y-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#12111A]" aria-hidden="true" />
                <h3 className="font-display text-lg font-semibold text-[#12111A]">
                  Explicit inspection boundaries
                </h3>
              </div>
              <ul className="text-[15px] text-[#12111A]/70 space-y-2 list-disc pl-5">
                <li>Double-line wall fills, curved walls, and loose furniture blocks are excluded.</li>
                <li>Stair headroom, handrail height, and riser/tread checks require explicit CAD text.</li>
                <li>Advisory pre-submission check; statutory approval rests with RAJUK, CDA, and FSCD.</li>
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
              Questions, <span className="text-[#2563EB]">answered</span>
            </h2>
            <p className="text-base sm:text-lg text-[#12111A]/65 max-w-lg mx-auto">
              Key operational, privacy, and code scope details for approval authorities and design
              teams.
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
                        0{idx + 1}
                      </span>
                      <span className="font-display text-lg sm:text-xl font-semibold text-[#12111A]">
                        {item.q}
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
                      {item.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer with Monumental Bottom Brand Wordmark */}
      <footer className="bg-[#090C14] text-white border-t border-white/10 overflow-hidden">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-14 pb-6 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex items-center gap-4">
              <DrawFixLogo size={56} />
              <div className="space-y-1">
                <div className="font-display font-bold text-xl tracking-tight text-white">
                  DrawFix Ai
                </div>
                <p className="text-sm text-slate-400 max-w-sm">
                  Building plan scrutiny, architect validation, and permit corrections workspace.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-slate-300">
              <a href="#process" className="hover:text-white transition-colors">
                Process
              </a>
              <a href="#workflows" className="hover:text-white transition-colors">
                Workflows
              </a>
              <button
                type="button"
                onClick={onGoToPermits}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Permit desk
              </button>
              <a href="#rules" className="hover:text-white transition-colors">
                Code rules
              </a>
              <button
                type="button"
                onClick={onGoToUpload}
                className="hover:text-white transition-colors cursor-pointer"
              >
                Upload DXF
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 text-xs text-slate-400">
            Advisory pre-submission compliance screening. Statutory clearance rests with RAJUK, CDA,
            City Corporations, and FSCD.
          </div>
        </div>

        <div
          aria-hidden="true"
          className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-4 overflow-hidden select-none"
        >
          <div className="font-display font-bold text-[clamp(4.25rem,17.5vw,15rem)] leading-[0.8] tracking-[-0.045em] text-center whitespace-nowrap bg-gradient-to-b from-white/[0.17] via-white/[0.09] to-transparent bg-clip-text text-transparent translate-y-[8%]">
            DrawFix Ai
          </div>
        </div>
      </footer>
    </div>
  );
}
