import { useMemo } from 'react';
import { ArrowRight, ArrowUpRight, Cpu, Eye, FileCode2, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { DEFAULT_CONVENTIONS, parseDxfString } from '../engine/dxfParser';
import { applyBuildingRemediationFixes, runBuildingAudit } from '../engine/ruleEngine';
import { BNBC_P3_SOURCE_URL, RULES } from '../engine/rules';
import { SAMPLE_BUILDINGS, type SampleBuildingMeta } from '../engine/sampleDxf';
import type { AppStep, BuildingProject, ComplianceAudit } from '../types/plan';
import { Blueprint2D } from './Blueprint2D';
import { BasisBadge, useAiStatus } from './shared';

interface LandingPageProps {
  onOpenSample: (sample: SampleBuildingMeta, step: AppStep) => void;
  onGoToUpload: () => void;
}

interface DemoRow {
  sample: SampleBuildingMeta;
  project: BuildingProject;
  before: ComplianceAudit;
  after: ComplianceAudit;
  changeCount: number;
  roomCount: number;
}

const STEPS = [
  {
    Icon: FileCode2,
    title: 'Reads the drawing',
    body: 'Walls, doors, stairs, windows, dimensions and room labels are read from the DXF. If the file has no room outlines, rooms are found from the areas the walls enclose, and door widths are measured from the wall gaps.',
  },
  {
    Icon: Eye,
    title: 'You confirm what it read',
    body: 'Before any rule runs you see every room, its type and every exit, and can correct them. Anything the parser assumed is listed in plain words.',
  },
  {
    Icon: Cpu,
    title: 'Code measures and checks',
    body: 'A path search walks from every room to the nearest open exit or stair. Distances, widths and areas are compared with limits. No language model takes part in this step.',
  },
  {
    Icon: ShieldCheck,
    title: 'See it, fix it, export it',
    body: 'Findings are pinned on the plan, proposed changes are applied to a copy and re-checked, and the escape is animated in 3D before and after.',
  },
];

export function LandingPage({ onOpenSample, onGoToUpload }: LandingPageProps) {
  const ai = useAiStatus();

  const demos: DemoRow[] = useMemo(
    () =>
      SAMPLE_BUILDINGS.map((sample) => {
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
        const { fixedProject, deltas } = applyBuildingRemediationFixes(project, before);
        const after = runBuildingAudit(fixedProject);
        return {
          sample,
          project,
          before,
          after,
          changeCount: deltas.length,
          roomCount: floors.reduce((n, f) => n + f.rooms.length, 0),
        };
      }),
    []
  );

  const hero = demos[0];
  const heroFloor = hero?.project.floors[0];
  const heroFindings = hero ? hero.before.violations.filter((v) => (v.floorIndex ?? 0) === 0) : [];

  const ruleList = Object.entries(RULES).filter(([id]) => id !== 'input_exits_unidentified');
  const verifiedRules = ruleList.filter(([, r]) => r.basis === 'verified').length;
  const screeningRules = ruleList.filter(([, r]) => r.basis === 'screening').length;
  const totalFindings = demos.reduce((n, d) => n + d.before.failCount + d.before.warnCount, 0);

  return (
    <div className="bg-[#F4F6F9] text-slate-900">
      {/* Hero: the product's own output, not a stock photo */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 pb-10 lg:pt-12 lg:pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          <div className="lg:col-span-5 space-y-6 lg:pt-4">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              Prototype · fire-escape plan check for Bangladesh
            </div>

            <h1 className="font-display text-[clamp(2rem,3.6vw,3.1rem)] font-bold tracking-tight leading-[1.08] text-balance">
              Find out who gets trapped before the building exists.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              Upload a DXF floor plan. PlanCheck AI measures every escape route, flags locked
              exits, narrow passages and unsafe stairs, and plays the escape in 3D. Every number
              is measured by code, and every limit says where it comes from.
            </p>

            <p className="text-sm text-slate-600 leading-relaxed">
              একটি DXF নকশা আপলোড করুন। প্রতিটি কক্ষ থেকে বের হওয়ার পথ মেপে তালাবদ্ধ দরজা, সরু পথ ও
              ঝুঁকিপূর্ণ সিঁড়ি চিহ্নিত করা হয়, বাংলা ও ইংরেজিতে ব্যাখ্যাসহ।
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onOpenSample(SAMPLE_BUILDINGS[0], 'report')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                Open the demo report
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onGoToUpload}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4 text-slate-600" />
                Upload a DXF
              </button>
              <button
                type="button"
                onClick={() => onOpenSample(SAMPLE_BUILDINGS[0], 'simulate')}
                className="inline-flex items-center gap-1.5 py-3 text-sm font-medium text-blue-800 hover:text-blue-900 underline underline-offset-4 cursor-pointer"
              >
                Watch the 3D escape
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-4">
              Not an approval and not a RAJUK or Fire Service service. A screening aid for owners,
              designers and reviewers.
            </p>
          </div>

          <div className="lg:col-span-7 space-y-2">
            {heroFloor && hero && (
              <Blueprint2D
                plan={heroFloor}
                violations={heroFindings}
                escapePaths={hero.before.escapePaths}
                title="Demo plan, ground floor"
                mode="before"
                compact
              />
            )}
            {hero && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-600">
                <span>
                  Parsed and checked in your browser just now:{' '}
                  <strong className="text-red-700">{hero.before.failCount} fail</strong>,{' '}
                  <strong className="text-amber-700">{hero.before.warnCount} warn</strong> across{' '}
                  {hero.project.floors.length} floors.
                </span>
                <span className="font-mono text-slate-500">Synthetic demo drawing</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-10 bg-white border border-slate-200/90 rounded-xl shadow-xs grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/90">
          <div className="p-5">
            <div className="text-xs text-slate-500">Checks in the engine</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums">{ruleList.length}</div>
            <div className="mt-1 text-xs text-slate-500">
              {verifiedRules} on verified BNBC limits, {screeningRules} screening
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs text-slate-500">Demo drawings</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums">{demos.length}</div>
            <div className="mt-1 text-xs text-slate-500">
              {totalFindings} findings, all computed live
            </div>
          </div>
          <div className="p-5">
            <div className="text-xs text-slate-500">Measurements made by AI</div>
            <div className="mt-1 font-display text-2xl font-bold tabular-nums">0</div>
            <div className="mt-1 text-xs text-slate-500">Geometry and rules are plain code</div>
          </div>
          <div className="p-5">
            <div className="text-xs text-slate-500">Gemini right now</div>
            <div className="mt-1 font-display text-2xl font-bold">
              {!ai.checked ? '…' : ai.aiConfigured ? 'On' : 'Off'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {ai.aiConfigured
                ? 'Writing explanations and typing room labels'
                : 'Fixed wording and keyword matching are used instead'}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="capabilities"
        className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 border-t border-slate-200/80 space-y-8 scroll-mt-20"
      >
        <div className="max-w-2xl space-y-2">
          <div className="text-xs font-mono text-blue-700 font-semibold">How it works</div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
            Code does the measuring. A person confirms the inputs. AI only does the wording.
          </h2>
        </div>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ Icon, title, body }, i) => (
            <li key={title} className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Icon className="w-5 h-5 text-blue-700" aria-hidden="true" />
                <span className="font-mono text-xs text-slate-400">0{i + 1}</span>
              </div>
              <h3 className="font-display text-base font-semibold">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-700" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold">Where Gemini is used</h3>
            </div>
            <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
              <li>Typing messy room labels (“CBN-14”, “শয়নকক্ষ ২”) into room types. You can overrule every one.</li>
              <li>Rewording each finding in plain English and Bangla, from the engine’s numbers only.</li>
              <li>Answering questions from the tool’s own reference notes, and drafting a review note.</li>
            </ul>
          </div>
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-700" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold">Where it is never used</h3>
            </div>
            <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
              <li>Measuring a distance, width or area.</li>
              <li>Deciding pass or fail, or choosing a limit or clause.</li>
              <li>If Gemini is off or fails, the whole tool still works with fixed wording.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Demo drawings */}
      <section
        id="benchmarks"
        className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 border-t border-slate-200/80 space-y-6 scroll-mt-20"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="max-w-2xl space-y-2">
            <div className="text-xs font-mono text-blue-700 font-semibold">Demo drawings</div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
              Synthetic plans with known faults
            </h2>
            <p className="text-sm text-slate-600">
              These are made-up drawings written as real DXF files, not real buildings. They carry
              deliberate faults so the checks can be seen working. The numbers on each card are
              computed when this page loads.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToUpload}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-800 hover:underline cursor-pointer shrink-0"
          >
            Or upload your own DXF <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {demos.map((d) => (
            <div key={d.sample.id} className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="text-xs font-mono text-slate-500">
                  {d.project.floors.length} floor{d.project.floors.length === 1 ? '' : 's'} · {d.roomCount} rooms ·
                  synthetic
                </div>
                <h3 className="font-display text-base font-semibold">{d.sample.name}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{d.sample.summary}</p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-xs border-t border-slate-100 pt-3">
                <div>
                  <dt className="text-slate-500">As drawn</dt>
                  <dd className="mt-0.5 font-mono font-semibold tabular-nums">
                    <span className="text-red-700">{d.before.failCount} fail</span> ·{' '}
                    <span className="text-amber-700">{d.before.warnCount} warn</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">After {d.changeCount} changes</dt>
                  <dd className="mt-0.5 font-mono font-semibold tabular-nums text-emerald-700">
                    {d.after.failCount} fail · {d.after.warnCount} warn
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Slowest escape</dt>
                  <dd className="mt-0.5 font-mono font-semibold tabular-nums">
                    {d.before.worstEscapeSec.toFixed(1)} s → {d.after.worstEscapeSec.toFixed(1)} s
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenSample(d.sample, 'report')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Open report
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSample(d.sample, 'simulate')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  3D escape
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSample(d.sample, 'review')}
                  className="px-2 py-2 text-xs font-medium text-blue-800 hover:underline cursor-pointer"
                >
                  See what was read
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Rules and limits */}
      <section
        id="scope"
        className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 border-t border-slate-200/80 space-y-6 scroll-mt-20"
      >
        <div className="max-w-2xl space-y-2">
          <div className="text-xs font-mono text-blue-700 font-semibold">Rules and limits</div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            Every check, and how far to trust its limit
          </h2>
          <p className="text-sm text-slate-600">
            “Verified” limits were read in the{' '}
            <a
              href={BNBC_P3_SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-blue-800 underline underline-offset-2"
            >
              BNBC 2012 text, Part 3, Chapter 1
            </a>
            . “Screening” limits are prototype values; the clauses that govern them (BNBC Part 4,
            Chapter 3 and the Dhaka building rules) have not been checked against the gazette, and a
            reviewer must confirm them.
          </p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-600">
                <th className="py-2.5 px-4 font-semibold">Check</th>
                <th className="py-2.5 px-4 font-semibold">Trust level</th>
                <th className="py-2.5 px-4 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {[...ruleList]
                .sort((a, b) => a[1].basis.localeCompare(b[1].basis) * -1)
                .map(([id, r]) => (
                  <tr key={id}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{r.name}</td>
                    <td className="py-2.5 px-4">
                      <BasisBadge basis={r.basis} />
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">{r.citation}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-2">
            <h3 className="font-display text-base font-semibold">What a drawing must have</h3>
            <ul className="text-slate-600 space-y-1.5 list-disc pl-5">
              <li>ASCII DXF from AutoCAD (R12 to R2018). DWG and PDF are not read.</li>
              <li>Walls as single lines or polylines, with a gap wherever there is a door.</li>
              <li>Room names as text inside the rooms. English or Bangla.</li>
            </ul>
          </div>
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-2">
            <h3 className="font-display text-base font-semibold">What it does not do</h3>
            <ul className="text-slate-600 space-y-1.5 list-disc pl-5">
              <li>Walls drawn as two parallel lines, curved walls and furniture are not understood yet.</li>
              <li>Stair headroom, handrails and step sizes are checked only if written in the drawing.</li>
              <li>No structure, fire-rating, services or site survey. It never edits your DXF.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            <strong className="text-slate-900">PlanCheck AI</strong> · prototype built for the
            International AI Builders Congress 2026
          </span>
          <span>Screening aid only. Not an official review.</span>
        </div>
      </footer>
    </div>
  );
}
