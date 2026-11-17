import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Send,
  Sparkles,
} from 'lucide-react';
import { requestRagQuery } from '../engine/aiFallback';
import type {
  BuildingProject,
  ComplianceAudit,
  RagQueryResponse,
  Violation,
} from '../types/plan';
import { Blueprint2D } from './Blueprint2D';

interface StepReportProps {
  project: BuildingProject;
  selectedFloorIndex: number;
  onSelectFloor: (floorIdx: number) => void;
  audit: ComplianceAudit;
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
    v.category === 'dimension_integrity'
  );
}

const PRESET_QUESTIONS = [
  'What is the maximum FAR & MGC for this road width?',
  'How do automatic sprinklers change BNBC travel distance?',
  'What triggers mandatory FSCD High-Rise NOC (> 20 m)?',
  'Minimum bedroom area & daylight window rules under BNBC?',
];

export function StepReport({
  project,
  selectedFloorIndex,
  onSelectFloor,
  audit,
  explainingAi,
  onRefreshExplanations,
  onProceedToCompare,
}: StepReportProps) {
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(
    audit.violations[0]?.id || null
  );
  const [clickedRoomId, setClickedRoomId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'FAIL' | 'WARN'>('all');
  const [filterCategory, setFilterCategory] = useState<CategoryFilter>('all');
  const [filterFloor, setFilterFloor] = useState<number | 'all'>('all');
  const [lang, setLang] = useState<'both' | 'en' | 'bn'>('both');

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

  return (
    <main className="max-w-[1380px] mx-auto px-6 py-6 space-y-5">
      {/* Header Strip */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200/90 pb-4">
        <div className="space-y-1">
          <div className="text-xs font-mono text-slate-500">
            Step 03 · Deterministic BNBC & Imarat Audit · {project.name}
            {isMultiFloor
              ? ` · ${project.floors.length} Floors (${(project.floors.length * project.storyHeightM).toFixed(1)} m)`
              : ''}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            BNBC & Imarat Compliance Report
          </h1>
          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3 pt-0.5 tabular-nums">
            <span className="font-semibold text-red-700">{audit.failCount} Fail</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-amber-700">{audit.warnCount} Warn</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-emerald-700">{audit.passedCount} Pass</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-700">
              Max escape time:{' '}
              {Number.isFinite(audit.worstEscapeSec)
                ? `${audit.worstEscapeSec.toFixed(1)} s`
                : 'Blocked'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center rounded-lg bg-slate-200/70 p-0.5 text-xs">
            {(['both', 'en', 'bn'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setLang(mode)}
                className={`px-2.5 py-1.5 rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                  lang === mode
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === 'both' ? 'EN + বাংলা' : mode === 'en' ? 'English' : 'বাংলা'}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={explainingAi}
            onClick={onRefreshExplanations}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-700" />
            {explainingAi ? 'Translating...' : 'Refresh AI Explainer'}
          </button>

          <button
            type="button"
            onClick={onProceedToCompare}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap shadow-xs"
          >
            Before / After Fixes
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Zoning & Egress Capacity Scorecard */}
      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 sm:divide-x divide-slate-200/90 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">Achieved FAR</div>
            <div
              className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                m.achievedFar > m.maxAllowedFar ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {m.achievedFar.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-500">
                / {m.maxAllowedFar.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">Ground Coverage (MGC)</div>
            <div
              className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                m.mgcPercent > m.maxAllowedMgcPercent ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {m.mgcPercent.toFixed(1)}%{' '}
              <span className="text-xs font-normal text-slate-500">
                / {m.maxAllowedMgcPercent}%
              </span>
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">Peak Floor Load</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {m.peakFloorLoad}{' '}
              <span className="text-xs font-normal text-slate-500">
                persons ({m.totalOccupantLoad} total)
              </span>
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">Ground Exit Capacity</div>
            <div
              className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                m.groundExitCapacityPersons < m.peakFloorLoad
                  ? 'text-red-700'
                  : 'text-emerald-700'
              }`}
            >
              {m.groundExitCapacityPersons}{' '}
              <span className="text-xs font-normal text-slate-500">persons</span>
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">Stair Width Capacity</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {m.stairCapacityPersons}{' '}
              <span className="text-xs font-normal text-slate-500">persons</span>
            </div>
          </div>
          <div className="px-4 py-3.5">
            <div className="text-[11px] font-mono text-slate-500">Travel Threshold</div>
            <div className="mt-0.5 font-mono text-base font-bold text-slate-900 tabular-nums">
              {m.travelLimitM.toFixed(1)} m{' '}
              <span className="text-xs font-normal text-slate-500">
                {m.sprinklered ? '(Sprinklered)' : '(No Sprinklers)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Per-Floor Summary Strip for Multi-Floor Buildings */}
      {isMultiFloor && audit.floorSummaries && (
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/90 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
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
                    {fs.occupantLoad ? `${fs.occupantLoad}p · ` : ''}
                    {fs.worstEscapeSec > 0 ? `${fs.worstEscapeSec.toFixed(1)}s` : '—'}
                  </span>
                </div>
                <div className="mt-1 text-xs font-mono tabular-nums flex items-center gap-2.5">
                  <span className="text-red-700 font-semibold">{fs.failCount} Fail</span>
                  <span className="text-amber-700 font-semibold">{fs.warnCount} Warn</span>
                  <span className="text-emerald-700 font-semibold">{fs.passedCount} Pass</span>
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
                Cited Findings ({filtered.length})
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
                    {f === 'all' ? 'All' : f}
                  </button>
                ))}
              </div>
            </div>

            {/* Domain / Category Filter Row */}
            <div className="flex flex-wrap items-center gap-1 text-[11px] font-mono">
              {(
                [
                  ['all', 'All Domains'],
                  ['egress', 'Egress'],
                  ['zoning', 'Zoning'],
                  ['habitability', 'Habitability'],
                  ['capacity', 'Capacity'],
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
                  All Floors
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
                No findings in current filter
              </div>
              <p className="text-xs text-slate-500">
                All evaluated BNBC & Imarat Bidhimala rules passed for this selection.
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
                          #{idx + 1} · {v.status}
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
                      {v.ruleName}
                    </div>

                    <div className="mt-1.5 font-mono text-xs text-slate-700 tabular-nums flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        Measured:{' '}
                        <strong className={isWarn ? 'text-amber-700' : 'text-red-700'}>
                          {v.measuredValue >= 99 ? 'Blocked' : `${v.measuredValue} ${v.unit}`}
                        </strong>
                      </span>
                      <span className="text-slate-400">|</span>
                      <span>
                        Code Limit: <strong>{v.comparator} {v.limitValue} {v.unit}</strong>
                      </span>
                    </div>

                    <div className="mt-1 text-[11px] font-mono text-slate-500">
                      {v.citation}
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
                2D Blueprint View: <strong>{activeFloor.floorName || activeFloor.floorLabel}</strong>
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
                  Selected Finding · <strong>{selectedViolation.citation}</strong>
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {selectedViolation.aiExplanation?.source === 'gemini'
                    ? 'Gemini 4 Hydrogen (Numbers locked to rule engine)'
                    : 'Deterministic Template (Numbers locked to rule engine)'}
                </div>
              </div>

              {(lang === 'both' || lang === 'en') && (
                <div className="space-y-1">
                  <p className="text-sm text-slate-900 leading-relaxed">
                    {selectedViolation.aiExplanation?.en || selectedViolation.description}
                  </p>
                  {selectedViolation.aiExplanation?.actionEn && (
                    <p className="text-xs font-medium text-blue-800">
                      Recommended fix: {selectedViolation.aiExplanation.actionEn}
                    </p>
                  )}
                </div>
              )}

              {(lang === 'both' || lang === 'bn') && (
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <p className="text-sm text-slate-800 leading-relaxed">
                    {selectedViolation.aiExplanation?.bn || selectedViolation.description}
                  </p>
                  {selectedViolation.aiExplanation?.actionBn && (
                    <p className="text-xs font-medium text-blue-800">
                      সংশোধন: {selectedViolation.aiExplanation.actionBn}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Grounded Hybrid RAG BNBC / Imarat Code Copilot */}
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
                <div>
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    Grounded BNBC & RAJUK Imarat Code Copilot (RAG)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Retrieves verified BNBC 2012/2020 & Imarat Bidhimala 2008 clauses and answers
                    using only retrieved code text + your active plan metrics.
                  </p>
                </div>
              </div>
              {ragResponse && (
                <span className="text-[11px] font-mono text-slate-500">
                  {ragResponse.source === 'gemini-rag' ? 'Gemini + ' : 'Lexical + '}
                  {ragResponse.retrievalMode === 'hybrid-embedding'
                    ? 'Hybrid Embedding'
                    : 'BM25 Retrieval'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={ragLoading}
                  onClick={() => void handleAskRag(q)}
                  className="text-left text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 cursor-pointer transition-colors disabled:opacity-50"
                >
                  {q}
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
                placeholder="Ask about FAR, MGC %, setbacks, sprinklers, travel distance, or Bangla query..."
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
              />
              <button
                type="submit"
                disabled={ragLoading || !ragQuestion.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                {ragLoading ? 'Retrieving...' : 'Ask Copilot'}
              </button>
            </form>

            {ragResponse && (
              <div className="space-y-3 pt-1">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5">
                  {(lang === 'both' || lang === 'en') && (
                    <p className="text-xs sm:text-sm text-slate-900 leading-relaxed">
                      {ragResponse.answerEn}
                    </p>
                  )}
                  {(lang === 'both' || lang === 'bn') && (
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed pt-2 border-t border-slate-200">
                      {ragResponse.answerBn}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono font-semibold text-slate-600">
                    Retrieved Grounding Clauses ({ragResponse.citations.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {ragResponse.citations.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-slate-200 bg-white p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="font-bold text-blue-800 truncate">{c.clause}</span>
                          <span className="text-slate-500 tabular-nums shrink-0">
                            rel {Math.round(c.score * 100)}%
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-slate-900">{c.title}</div>
                        <p className="text-[11px] text-slate-600 leading-snug line-clamp-3">
                          {c.excerpt}
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
