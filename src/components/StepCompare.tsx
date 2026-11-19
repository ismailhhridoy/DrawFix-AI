import { ArrowRight, CheckCircle2, FileText } from 'lucide-react';
import { Bi, useLang } from '../i18n';
import type {
  BuildingProject,
  ComplianceAudit,
  FixNarration,
  RemediationDelta,
} from '../types/plan';
import { Blueprint2D } from './Blueprint2D';

interface StepCompareProps {
  originalProject: BuildingProject;
  originalAudit: ComplianceAudit;
  fixedProject: BuildingProject;
  fixedAudit: ComplianceAudit;
  selectedFloorIndex: number;
  onSelectFloor: (floorIdx: number) => void;
  deltas: RemediationDelta[];
  narration: FixNarration;
  narratingAi: boolean;
  onProceedTo3D: () => void;
}

export function StepCompare({
  originalProject,
  originalAudit,
  fixedProject,
  fixedAudit,
  selectedFloorIndex,
  onSelectFloor,
  deltas,
  narration,
  narratingAi,
  onProceedTo3D,
}: StepCompareProps) {
  const { t, num } = useLang();
  const isMultiFloor = originalProject.floors.length > 1;
  const origFloor =
    originalProject.floors[selectedFloorIndex] || originalProject.floors[0];
  const fixedFloor =
    fixedProject.floors[selectedFloorIndex] || fixedProject.floors[0];
  const activeIdx = origFloor.floorIndex ?? selectedFloorIndex;
  const activeLbl = origFloor.floorLabel || (activeIdx === 0 ? 'GF' : `L${activeIdx + 1}`);

  const origFloorViolations = originalAudit.violations.filter(
    (v) => (v.floorIndex ?? 0) === activeIdx
  );
  const fixedFloorViolations = fixedAudit.violations.filter(
    (v) => (v.floorIndex ?? 0) === activeIdx
  );

  const beforeWorst = Number.isFinite(originalAudit.worstEscapeSec)
    ? t('common.seconds', { n: num(originalAudit.worstEscapeSec, 1) })
    : t('compare.blocked');
  const afterWorst = Number.isFinite(fixedAudit.worstEscapeSec)
    ? t('common.seconds', { n: num(fixedAudit.worstEscapeSec, 1) })
    : t('compare.blocked');

  return (
    <main className="max-w-[1380px] mx-auto px-6 py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/90 pb-4">
        <div className="space-y-1">
          <p className="text-xs font-mono text-slate-500">
            {t('compare.kicker', { n: originalProject.floors.length })}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {t('compare.title')}
          </h1>
          <p className="text-sm text-slate-600">
            {t('compare.lead')}
          </p>
        </div>

        <button
          type="button"
          onClick={onProceedTo3D}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
        >
          {t('compare.watch3d')}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Building-Wide Before / After KPI Comparison Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/90 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('compare.failed')}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
            <span className="text-red-700">{t('report.nFail', { n: originalAudit.failCount })}</span>{' '}
            <span className="text-slate-400">→</span>{' '}
            <span className="text-emerald-700">{t('report.nFail', { n: fixedAudit.failCount })}</span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('compare.slowest')}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
            <span className="text-red-700">{beforeWorst}</span>{' '}
            <span className="text-slate-400">→</span>{' '}
            <span className="text-emerald-700">{afterWorst}</span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('compare.noRoute')}</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular-nums">
            <span className="text-red-700">{num(originalAudit.trappedRoomCount)}</span>{' '}
            <span className="text-slate-400">→</span>{' '}
            <span className="text-emerald-700">{num(fixedAudit.trappedRoomCount)}</span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('compare.changes')}</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {num(deltas.length)}
          </div>
        </div>
      </div>

      {/* Floor Switcher for Multi-Floor Side-by-Side Comparison */}
      {isMultiFloor && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-xl shadow-xs px-4 py-3 text-xs">
          <span className="font-mono text-slate-700">
            {t('compare.floor')} <strong>[{activeLbl}] {origFloor.floorName}</strong>
          </span>
          <div className="flex flex-wrap items-center gap-1.5 font-mono">
            {originalProject.floors.map((fl, idx) => {
              const lbl = fl.floorLabel || (idx === 0 ? 'GF' : `L${idx + 1}`);
              const beforeF =
                originalAudit.floorSummaries?.find((s) => s.floorIndex === idx)
                  ?.failCount ?? 0;
              const afterF =
                fixedAudit.floorSummaries?.find((s) => s.floorIndex === idx)
                  ?.failCount ?? 0;
              return (
                <button
                  key={fl.id}
                  type="button"
                  onClick={() => onSelectFloor(idx)}
                  className={`px-3 py-1 rounded-lg border cursor-pointer transition-colors ${
                    idx === selectedFloorIndex
                      ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {lbl} ({num(beforeF)}→{num(afterF)})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Side-by-side 2D Blueprints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Blueprint2D
          plan={origFloor}
          violations={origFloorViolations}
          escapePaths={originalAudit.escapePaths}
          title={
            isMultiFloor
              ? `${t('compare.before')} [${activeLbl}]`
              : t('compare.before')
          }
          mode="before"
          compact
        />
        <Blueprint2D
          plan={fixedFloor}
          violations={fixedFloorViolations}
          escapePaths={fixedAudit.escapePaths}
          title={
            isMultiFloor
              ? `${t('compare.after')} [${activeLbl}]`
              : t('compare.after')
          }
          mode="after"
          compact
        />
      </div>

      {/* AI Fix Narration + Deterministic Change Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900">
              <FileText className="w-3.5 h-3.5 text-blue-700" />
              {t('compare.summary')}
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {narratingAi ? t('common.updating') : t('compare.delta')}
            </span>
          </div>

          <Bi
            as="div"
            className="font-display text-base font-semibold text-slate-900"
            en={narration.headlineEn}
            bn={narration.headlineBn}
          />
          <Bi
            className="text-sm text-slate-700 leading-relaxed"
            en={narration.summaryEn}
            bn={narration.summaryBn}
          />
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-3">
          <div className="text-xs font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
            {t('compare.copyTitle')}
          </div>
          {deltas.length === 0 && (
            <p className="text-sm text-slate-600">
              {t('compare.noFix')}
            </p>
          )}
          <ul className="divide-y divide-slate-200/80 text-sm max-h-[340px] overflow-y-auto">
            {deltas.map((delta) => (
              <li key={delta.id} className="py-2.5 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <Bi as="div" className="text-slate-900 font-medium" en={delta.summary} bn={delta.summaryBn} />
                  {delta.deltaBeforeM !== undefined && delta.deltaAfterM !== undefined && (
                    <div className="text-xs font-mono text-slate-500 tabular-nums">
                      {num(delta.deltaBeforeM, 2)} m → {num(delta.deltaAfterM, 2)} m
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
