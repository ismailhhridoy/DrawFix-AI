import { useState } from 'react';
import { Bi, useLang } from '../i18n';
import type { MsgKey } from '../i18n/en';
import { ruleName } from '../engine/rules';
import { REGULATORY_CORPUS } from '../engine/bnbcCorpus';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  FileDown,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { requestRagQuery } from '../engine/aiFallback';
import {
  buildScrutinyObjectionSheetText,
  buildScrutinyTriage,
  type ReviewerRole,
} from '../engine/localIntelligence';
import type {
  BuildingProject,
  ComplianceAudit,
  RagQueryResponse,
  Violation,
} from '../types/plan';
import { Blueprint2D } from './Blueprint2D';
import { BasisBadge, measuredText } from './shared';

interface StepReportProps {
  project: BuildingProject;
  selectedFloorIndex: number;
  onSelectFloor: (floorIdx: number) => void;
  audit: ComplianceAudit;
  reviewerRole: ReviewerRole;
  onChangeReviewerRole: (role: ReviewerRole) => void;
  explainingAi: boolean;
  onRefreshExplanations: () => void;
  onProceedToCompare: () => void;
}

type CategoryFilter = 'all' | 'egress' | 'zoning' | 'habitability' | 'capacity';

function matchesCategoryFilter(v: Violation, filter: CategoryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'zoning') return v.category === 'zoning_far' || v.category === 'fire_access';
  if (filter === 'habitability') return v.category === 'habitability_ventilation';
  if (filter === 'capacity') return v.category === 'egress_capacity';
  return (
    v.category === 'egress_travel' ||
    v.category === 'passage_width' ||
    v.category === 'exit_obstruction' ||
    v.category === 'stair_safety' ||
    v.category === 'dimension_integrity' ||
    v.category === 'input_required'
  );
}

const PRESET_QUESTIONS: MsgKey[] = [
  'report.q1',
  'report.q2',
  'report.q3',
  'report.q4',
];

export function StepReport({
  project,
  selectedFloorIndex,
  onSelectFloor,
  audit,
  reviewerRole,
  onChangeReviewerRole,
  explainingAi,
  onRefreshExplanations,
  onProceedToCompare,
}: StepReportProps) {
  const { t, num, uiLang } = useLang();
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(
    audit.violations[0]?.id || null
  );
  const [clickedRoomId, setClickedRoomId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'FAIL' | 'WARN'>('all');
  const [filterCategory, setFilterCategory] = useState<CategoryFilter>('all');
  const [filterFloor, setFilterFloor] = useState<number | 'all'>('all');

  const [ragQuestion, setRagQuestion] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragResponse, setRagResponse] = useState<RagQueryResponse | null>(null);

  const isMultiFloor = project.floors.length > 1;
  const activeFloor = project.floors[selectedFloorIndex] || project.floors[0];
  const activeFloorIdx = activeFloor.floorIndex ?? selectedFloorIndex;

  const filtered = audit.violations.filter((v) => {
    if (filterSeverity !== 'all' && v.status !== filterSeverity) return false;
    if (!matchesCategoryFilter(v, filterCategory)) return false;
    if (filterFloor !== 'all' && (v.floorIndex ?? 0) !== filterFloor) return false;
    return true;
  });

  const selectedViolation: Violation | null =
    audit.violations.find((v) => v.id === selectedViolationId) || filtered[0] || null;

  const floorViolations = audit.violations.filter(
    (v) => (v.floorIndex ?? 0) === activeFloorIdx
  );

  const selectedRoomOnFloor =
    clickedRoomId && activeFloor.rooms.some((r) => r.id === clickedRoomId)
      ? clickedRoomId
      : selectedViolation && (selectedViolation.floorIndex ?? 0) === activeFloorIdx
        ? selectedViolation.roomId
        : null;

  const handleSelectViolation = (v: Violation) => {
    setSelectedViolationId(v.id);
    setClickedRoomId(v.roomId);
    const vf = v.floorIndex ?? 0;
    if (vf !== selectedFloorIndex) {
      onSelectFloor(vf);
    }
  };

  const handleAskRag = async (qText?: string) => {
    const q = (qText ?? ragQuestion).trim();
    if (!q || ragLoading) return;
    if (qText) setRagQuestion(qText);
    setRagLoading(true);
    const res = await requestRagQuery(q, project, audit);
    setRagResponse(res);
    setRagLoading(false);
  };

  const m = audit.metrics;
  const triage = buildScrutinyTriage(project, audit);
  const verifiedCount = audit.violations.filter((v) => v.basis === 'verified').length;
  const screeningCount = audit.violations.filter((v) => v.basis === 'screening').length;
  const notChecked = audit.notChecked || [];

  const handleDownloadWorksheet = () => {
    const text = buildScrutinyObjectionSheetText(project, audit, reviewerRole);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      reviewerRole === 'government'
        ? `${project.id}_scrutiny_objection_sheet.txt`
        : `${project.id}_architect_validation_brief.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="max-w-[1380px] mx-auto px-6 py-6 space-y-5">
      {/* Header Strip */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200/90 pb-4">
        <div className="space-y-1">
          <div className="text-xs font-mono text-slate-500">
            {t('report.kicker')} · {project.name}
            {isMultiFloor
              ? ` · ${t('report.floorsHeight', { n: project.floors.length, h: num(project.floors.length * project.storyHeightM, 1) })}`
              : ''}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {reviewerRole === 'government'
              ? t('report.title.gov')
              : t('report.title.arch')}
          </h1>
          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3 pt-0.5 tabular-nums">
            <span className="font-semibold text-red-700">{t('report.nFail', { n: audit.failCount })}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-amber-700">{t('report.nWarn', { n: audit.warnCount })}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-emerald-700">{t('report.nPass', { n: audit.passedCount })}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-700">
              {t('report.slowest')}{' '}
              {audit.worstEscapeSec > 0 ? t('common.seconds', { n: num(audit.worstEscapeSec, 1) }) : t('review.notMeasured')}
              {audit.trappedRoomCount > 0 ? ` · ${t('report.trapped', { n: audit.trappedRoomCount })}` : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => onChangeReviewerRole('architect')}
              className={`px-2.5 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                reviewerRole === 'architect'
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('report.role.arch')}
            </button>
            <button
              type="button"
              onClick={() => onChangeReviewerRole('government')}
              className={`px-2.5 py-1.5 font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                reviewerRole === 'government'
                  ? 'bg-slate-900 text-white shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('report.role.gov')}
            </button>
          </div>

          <button
            type="button"
            disabled={explainingAi}
            onClick={onRefreshExplanations}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-700 ${explainingAi ? 'animate-spin' : ''}`} />
            {explainingAi ? t('common.updating') : t('report.refresh')}
          </button>

          <button
            type="button"
            onClick={onProceedToCompare}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
          >
            {t('report.seeFixes')}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Fast Scrutiny / Architect Validation Triage Strip */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-4 sm:p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {reviewerRole === 'government' ? (
              <ShieldAlert className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            ) : (
              <Building2 className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                <span
                  className={`font-bold ${
                    triage.disposition === 'RETURN_FOR_CORRECTIONS'
                      ? 'text-red-700'
                      : triage.disposition === 'CONDITIONAL_REVIEW'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {t(`triage.${triage.disposition}` as MsgKey)}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 tabular-nums">
                  {t('report.triageLine', { c: triage.checksEvaluated, r: triage.totalRoomsAudited, m: triage.estimatedManualMinutesSaved })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-1">
                <span>
                  {t('report.height')} <strong className="font-mono text-slate-900">{num(triage.totalHeightM)} m</strong>{' '}
                  {triage.isHighRise ? t('report.highRise') : t('report.standard')}
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  {t('report.dimOverrides')}{' '}
                  <strong
                    className={`font-mono ${
                      triage.dimensionTamperAlerts > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {triage.dimensionTamperAlerts > 0
                      ? t('report.nMismatchFlagged', { n: triage.dimensionTamperAlerts })
                      : t('report.zeroMismatch')}
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  {t('report.zoningFlags')}{' '}
                  <strong className="font-mono text-slate-900">{num(triage.zoningFlagCount)}</strong>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadWorksheet}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileDown className="w-3.5 h-3.5 text-blue-700" />
            {reviewerRole === 'government'
              ? t('report.export.gov')
              : t('report.export.arch')}
          </button>
        </div>
      </div>

      {/* Zoning & Egress Capacity Scorecard */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 sm:divide-x divide-slate-200/90 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">{t('report.far')}</div>
            {m.plotAreaSqM > 0 ? (
              <div
                className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                  m.achievedFar > m.maxAllowedFar ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {num(m.achievedFar, 2)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {num(m.maxAllowedFar, 2)}
                </span>
              </div>
            ) : (
              <div className="mt-0.5 text-xs text-slate-500">{t('report.plotMissing')}</div>
            )}
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">{t('report.mgc')}</div>
            {m.plotAreaSqM > 0 ? (
              <div
                className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                  m.mgcPercent > m.maxAllowedMgcPercent ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {num(m.mgcPercent, 1)}%{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {num(m.maxAllowedMgcPercent)}%
                </span>
              </div>
            ) : (
              <div className="mt-0.5 text-xs text-slate-500">{t('report.plotMissing')}</div>
            )}
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">{t('report.peak')}</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {num(m.peakFloorLoad)}{' '}
              <span className="text-xs font-normal text-slate-500">
                {t('report.personsTotal', { n: m.totalOccupantLoad })}
              </span>
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">{t('report.exitCap')}</div>
            <div
              className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                m.groundExitCapacityPersons < m.peakFloorLoad
                  ? 'text-amber-700'
                  : 'text-slate-900'
              }`}
            >
              {num(m.groundExitCapacityPersons)}{' '}
              <span className="text-xs font-normal text-slate-500">{t('report.persons')}</span>
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">{t('report.stairCap')}</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {num(m.stairCapacityPersons)}{' '}
              <span className="text-xs font-normal text-slate-500">{t('report.persons')}</span>
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">{t('report.travelRef')}</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {num(m.travelLimitM, 1)} m{' '}
              <span className="text-xs font-normal text-slate-500">
                {m.sprinklered ? t('report.sprinklersDeclared') : t('report.cabins16')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Per-Floor Summary Strip for Multi-Floor Buildings */}
      {isMultiFloor && audit.floorSummaries && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/90 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
          {audit.floorSummaries.map((fs) => {
            const isActive = fs.floorIndex === activeFloorIdx;
            return (
              <button
                key={fs.floorIndex}
                type="button"
                onClick={() => {
                  onSelectFloor(fs.floorIndex);
                  setFilterFloor(fs.floorIndex);
                }}
                className={`text-left px-4 py-3 transition-colors cursor-pointer ${
                  isActive ? 'bg-blue-50/70' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-slate-900">
                    [{fs.floorLabel}] {fs.floorName}
                  </span>
                  <span className="text-slate-600 tabular-nums">
                    {fs.occupantLoad ? `${t('review.people', { n: fs.occupantLoad })} · ` : ''}
                    {fs.worstEscapeSec > 0 ? t('common.seconds', { n: num(fs.worstEscapeSec, 1) }) : '—'}
                  </span>
                </div>
                <div className="mt-1 text-xs font-mono tabular-nums flex items-center gap-2.5">
                  <span className="text-red-700 font-semibold">{t('report.nFail', { n: fs.failCount })}</span>
                  <span className="text-amber-700 font-semibold">{t('report.nWarn', { n: fs.warnCount })}</span>
                  <span className="text-emerald-700 font-semibold">{t('report.nPass', { n: fs.passedCount })}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Split Workbench: Left Violation List + Right 2D Blueprint & RAG Copilot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900">
                {t('report.findings', { n: filtered.length })}
              </span>
              <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-0.5 text-xs">
                {(['all', 'FAIL', 'WARN'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilterSeverity(f)}
                    className={`px-2.5 py-0.5 rounded-md cursor-pointer transition-colors ${
                      filterSeverity === f
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f === 'all' ? t('common.all') : f === 'FAIL' ? t('common.fail') : t('common.warn')}
                  </button>
                ))}
              </div>
            </div>

            {/* Domain / Category Filter Row */}
            <div className="flex flex-wrap items-center gap-1 text-[11px] font-mono">
              {(
                [
                  ['all', t('report.topic.all')],
                  ['egress', t('report.topic.egress')],
                  ['zoning', t('report.topic.zoning')],
                  ['habitability', t('report.topic.rooms')],
                  ['capacity', t('report.topic.capacity')],
                ] as const
              ).map(([catId, label]) => (
                <button
                  key={catId}
                  type="button"
                  onClick={() => setFilterCategory(catId)}
                  className={`px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                    filterCategory === catId
                      ? 'border-blue-300 bg-blue-50 text-blue-800 font-semibold'
                      : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {isMultiFloor && (
              <div className="flex flex-wrap items-center gap-1 text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setFilterFloor('all')}
                  className={`px-2.5 py-1 rounded-md border cursor-pointer ${
                    filterFloor === 'all'
                      ? 'border-blue-700 bg-blue-700 text-white font-semibold'
                      : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('report.allFloors')}
                </button>
                {project.floors.map((fl, idx) => {
                  const lbl = fl.floorLabel || (idx === 0 ? 'GF' : `L${idx + 1}`);
                  return (
                    <button
                      key={fl.id}
                      type="button"
                      onClick={() => {
                        setFilterFloor(idx);
                        onSelectFloor(idx);
                      }}
                      className={`px-2.5 py-1 rounded-md border cursor-pointer ${
                        filterFloor === idx
                          ? 'border-blue-700 bg-blue-700 text-white font-semibold'
                          : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-900">
                {t('report.noFindings')}
              </div>
              <p className="text-xs text-slate-500">
                {t('report.noFindingsNote')}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/80 max-h-[680px] overflow-y-auto">
              {filtered.map((v, idx) => {
                const isSelected = selectedViolation?.id === v.id;
                const isWarn = v.status === 'WARN';
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSelectViolation(v)}
                    className={`w-full text-left p-4 transition-colors cursor-pointer block ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                        {isMultiFloor && v.floorLabel && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold">
                            {v.floorLabel}
                          </span>
                        )}
                        <span
                          className={`font-bold ${
                            isWarn ? 'text-amber-700' : 'text-red-700'
                          }`}
                        >
                          #{num(idx + 1)} · {v.status === 'FAIL' ? t('common.fail') : v.status === 'WARN' ? t('common.warn') : v.status}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-800 font-semibold">
                          {v.roomName}
                        </span>
                      </div>
                      {isWarn ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : (
                        <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                      )}
                    </div>

                    <div className="mt-1 font-display text-sm font-semibold text-slate-900">
                      {ruleName(v.ruleId, v.ruleName, uiLang)}
                    </div>

                    <div className="mt-1.5 font-mono text-xs text-slate-700 tabular-nums flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        {t('report.measured')}{' '}
                        <strong className={isWarn ? 'text-amber-700' : 'text-red-700'}>
                          {measuredText(v, uiLang)}
                        </strong>
                      </span>
                      {!v.blocked && v.category !== 'input_required' && (
                        <>
                          <span className="text-slate-400">|</span>
                          <span>
                            {t('report.limit')} <strong>{v.comparator} {num(v.limitValue)} {v.unit}</strong>
                          </span>
                        </>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500">
                      <BasisBadge basis={v.basis} />
                      <span>{v.citation}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Interactive 2D Blueprint + Floor Switcher + Bilingual Explainer + RAG Copilot */}
        <div className="lg:col-span-7 space-y-4">
          {isMultiFloor && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-xl shadow-xs px-4 py-2.5 text-xs">
              <span className="font-mono text-slate-600">
                {t('report.bpView')} <strong>{activeFloor.floorName || activeFloor.floorLabel}</strong>
              </span>
              <div className="flex items-center gap-1 font-mono">
                {project.floors.map((fl, idx) => {
                  const lbl = fl.floorLabel || (idx === 0 ? 'GF' : `L${idx + 1}`);
                  return (
                    <button
                      key={fl.id}
                      type="button"
                      onClick={() => onSelectFloor(idx)}
                      className={`px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                        idx === selectedFloorIndex
                          ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Blueprint2D
            plan={activeFloor}
            violations={floorViolations}
            escapePaths={audit.escapePaths}
            selectedViolationId={selectedViolation?.id || null}
            selectedRoomId={selectedRoomOnFloor}
            onSelectViolation={(id) => {
              const found = floorViolations.find((v) => v.id === id);
              if (found) handleSelectViolation(found);
            }}
            onSelectRoom={(rid) => setClickedRoomId(rid)}
            title={
              isMultiFloor
                ? `[${activeFloor.floorLabel || 'GF'}] ${activeFloor.floorName || project.name}`
                : project.name
            }
            mode="before"
          />

          {selectedViolation && (
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="text-xs font-mono text-slate-700">
                  {selectedViolation.floorLabel ? `[${selectedViolation.floorLabel}] ` : ''}
                  <strong>{ruleName(selectedViolation.ruleId, selectedViolation.ruleName, uiLang)}</strong>
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {t('report.citationNote')}
                </div>
              </div>

              <div className="space-y-1">
                <Bi
                  className="text-sm text-slate-900 leading-relaxed"
                  en={selectedViolation.aiExplanation?.en || selectedViolation.description}
                  bn={selectedViolation.aiExplanation?.bn}
                />
                {selectedViolation.aiExplanation?.actionEn && (
                  <Bi
                    className="text-xs font-medium text-blue-800"
                    en={`${t('report.whatToDo')} ${selectedViolation.aiExplanation.actionEn}`}
                    bn={selectedViolation.aiExplanation.actionBn ? `করণীয়: ${selectedViolation.aiExplanation.actionBn}` : undefined}
                  />
                )}
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-600">
                <BasisBadge basis={selectedViolation.basis} />
                <span>
                  <span className="font-mono text-slate-800">{selectedViolation.citation}.</span>{' '}
                  {selectedViolation.basisNote}
                </span>
              </div>
            </div>
          )}

          {/* What the tool did and did not check */}
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-slate-900">{t('report.trust.title')}</h2>
              <span className="text-[11px] font-mono text-slate-500">
                {t('report.trust.counts', { v: verifiedCount, s: screeningCount })}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t('report.trust.body')}
            </p>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-3">
              <div className="text-xs font-semibold text-slate-900">
                {t('report.notChecked', { n: notChecked.length })}
              </div>
              {notChecked.length === 0 ? (
                <p className="mt-1 text-xs text-slate-600">
                  {t('report.nothingSkipped')}
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1 text-xs text-slate-700">
                  {notChecked.slice(0, 8).map((n, i) => (
                    <li key={i}>
                      {n.floorLabel ? <span className="font-mono text-slate-500">[{n.floorLabel}] </span> : null}
                      <span className="font-medium">{n.item}.</span> {n.reason}
                    </li>
                  ))}
                  {notChecked.length > 8 && (
                    <li className="text-slate-500">{t('report.moreInPdf', { n: notChecked.length - 8 })}</li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Question box over the reference notes */}
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
                <div>
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    {t('report.lookup.title')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t('report.lookup.lead')}
                  </p>
                </div>
              </div>
              {ragResponse && (
                <span className="text-[11px] font-mono text-slate-500">
                  {t('report.lookup.matched')}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={ragLoading}
                  onClick={() => void handleAskRag(t(q))}
                  className="text-left text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {t(q)}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleAskRag();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={ragQuestion}
                onChange={(e) => setRagQuestion(e.target.value)}
                placeholder={t('report.lookup.placeholder')}
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
              />
              <button
                type="submit"
                disabled={ragLoading || !ragQuestion.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                {ragLoading ? t('report.lookup.loading') : t('report.lookup.ask')}
              </button>
            </form>

            {ragResponse && (
              <div className="space-y-3 pt-1">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <Bi
                    className="text-xs sm:text-sm text-slate-900 leading-relaxed"
                    en={ragResponse.answerEn}
                    bn={ragResponse.answerBn}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono font-semibold text-slate-600">
                    {t('report.notesUsed', { n: ragResponse.citations.length })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {ragResponse.citations.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-slate-200 bg-white p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="font-bold text-blue-800 truncate">{c.clause}</span>
                          <BasisBadge basis={c.basis} />
                        </div>
                        <div className="text-xs font-semibold text-slate-900">
                          {uiLang === 'bn' ? REGULATORY_CORPUS.find((x) => x.id === c.id)?.titleBn || c.title : c.title}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-snug line-clamp-3">
                          {uiLang === 'bn' ? REGULATORY_CORPUS.find((x) => x.id === c.id)?.textBn || c.excerpt : c.excerpt}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
