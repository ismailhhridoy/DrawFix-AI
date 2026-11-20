import { useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileCheck2,
  FileDown,
  FileText,
  FileWarning,
  Layers,
  Upload,
} from 'lucide-react';
import {
  generatePermitChecklist,
  JURISDICTION_LABELS,
  requestCorrectionInterpretation,
  SAMPLE_CORRECTION_LETTERS,
  type PermitJurisdiction,
} from '../engine/permitEngine';
import { BasisBadge } from './shared';
import type {
  BuildingProject,
  ComplianceAudit,
  CorrectionPackage,
  OccupancyClass,
  RemediationDelta,
} from '../types/plan';

interface StepPermitsProps {
  project: BuildingProject | null;
  beforeAudit: ComplianceAudit | null;
  afterAudit: ComplianceAudit | null;
  deltas: RemediationDelta[];
  onGoToUpload: () => void;
  onGoToReport: () => void;
  onGoToExport?: () => void;
}

const STATUS_BADGE = {
  resolved_in_copy: {
    label: 'Resolved in CAD copy',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  linked_to_cad_finding: {
    label: 'Matched to CAD audit',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  needs_designer_action: {
    label: 'Designer update needed',
    cls: 'bg-red-50 text-red-800 border-red-200',
  },
  procedural_document: {
    label: 'Filing document',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
  },
} as const;

export function StepPermits({
  project,
  beforeAudit,
  afterAudit,
  deltas,
  onGoToUpload,
  onGoToReport,
  onGoToExport,
}: StepPermitsProps) {
  const { t } = useLang();
  const [tab, setTab] = useState<'corrections' | 'checklist'>('checklist');

  // Flow 1: Corrections Letter Interpreter state
  const [authorityName, setAuthorityName] = useState('Building Approval & Plan Scrutiny Cell');
  const [letterText, setLetterText] = useState(SAMPLE_CORRECTION_LETTERS[0].text);
  const [interpreting, setInterpreting] = useState(false);
  const [pkg, setPkg] = useState<CorrectionPackage | null>(null);
  const [copiedLetter, setCopiedLetter] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Flow 2: Pre-Submission Permit Checklist state
  const [jurisdiction, setJurisdiction] = useState<PermitJurisdiction>('rajuk');
  const [occupancy, setOccupancy] = useState<OccupancyClass>(
    project?.occupancyClass || 'residential'
  );
  const [floorsCount, setFloorsCount] = useState<number>(project?.floors.length || 6);
  const [storyHeightM, setStoryHeightM] = useState<number>(project?.storyHeightM || 3.2);
  const [plotAreaSqM, setPlotAreaSqM] = useState<number>(
    project?.siteContext?.plotAreaSqM || 335
  );
  const [roadWidthM, setRoadWidthM] = useState<number>(
    project?.siteContext?.abuttingRoadWidthM || 9.0
  );
  const [sprinklered, setSprinklered] = useState<boolean>(
    Boolean(project?.siteContext?.sprinklered)
  );
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});

  const checklist = useMemo(
    () =>
      generatePermitChecklist(
        {
          jurisdiction,
          occupancyClass: occupancy,
          floorsCount,
          storyHeightM,
          plotAreaSqM,
          abuttingRoadWidthM: roadWidthM,
          sprinklered,
        },
        project,
        beforeAudit
      ),
    [jurisdiction, occupancy, floorsCount, storyHeightM, plotAreaSqM, roadWidthM, sprinklered, project, beforeAudit]
  );

  const readyCount = checklist.filter(
    (item) => checkedIds[item.id] ?? item.status === 'pass'
  ).length;

  const handleUploadLetterFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setLetterText(text);
    setPkg(null);
  };

  const handleAnalyzeCorrections = async () => {
    if (!letterText.trim() || interpreting) return;
    setInterpreting(true);
    const res = await requestCorrectionInterpretation({
      letterText,
      authorityName,
      project,
      beforeAudit,
      afterAudit,
      deltas,
    });
    setPkg(res);
    setInterpreting(false);
  };

  const handleCopyLetter = async () => {
    if (!pkg) return;
    try {
      await navigator.clipboard.writeText(pkg.responseLetter);
      setCopiedLetter(true);
      setTimeout(() => setCopiedLetter(false), 2000);
    } catch {
      setCopiedLetter(false);
    }
  };

  const handleDownloadLetter = () => {
    if (!pkg) return;
    const blob = new Blob([pkg.responseLetter], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project?.id || 'project')}_resubmission_response.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadChecklist = () => {
    const lines = [
      `DRAWFIX AI — PRE-SUBMISSION PERMIT CHECKLIST`,
      `Jurisdiction: ${JURISDICTION_LABELS[jurisdiction]}`,
      `Occupancy: ${occupancy} | Floors: ${floorsCount} (${(floorsCount * storyHeightM).toFixed(1)} m) | Plot: ${plotAreaSqM} m2 | Road: ${roadWidthM} m`,
      `Readiness: ${readyCount} / ${checklist.length} items ready`,
      '',
      ...checklist.map((c, idx) => {
        const done = checkedIds[c.id] ?? c.status === 'pass';
        return `${idx + 1}. [${done ? 'READY' : c.status.toUpperCase()}] (${c.category}) ${c.title}\n   Requirement: ${c.requirement}\n   Trust: ${c.basis} | Reference: ${c.citation}${c.measuredNote ? `\n   Measured: ${c.measuredNote}` : ''}`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jurisdiction}_permit_checklist.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-slate-500">
            {t('landing.hero.tag3')} · {project ? t('permits.linked', { p: project.name }) : t('permits.standalone')}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {t('permits.title')}
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            {t('permits.lead')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {project ? (
            <>
              <button
                type="button"
                onClick={onGoToReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                {t('permits.backReport')}
              </button>
              {onGoToExport && (
                <button
                  type="button"
                  onClick={onGoToExport}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer shadow-xs"
                >
                  {t('permits.toExport')}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onGoToUpload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#12111A] hover:bg-[#2563EB] rounded-lg cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {t('permits.uploadLink')}
            </button>
          )}
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
        <button
          type="button"
          onClick={() => setTab('corrections')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            tab === 'corrections'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileWarning className="w-3.5 h-3.5 text-slate-600" />
          {t('permits.tab.corr')}
        </button>
        <button
          type="button"
          onClick={() => setTab('checklist')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
            tab === 'checklist'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5 text-slate-600" />
          {t('permits.tab.check')}
        </button>
      </div>

      {tab === 'corrections' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Corrections Input */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {t('permits.letter')}
                </h2>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.csv"
                className="hidden"
                onChange={(e) => void handleUploadLetterFile(e)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {t('permits.loadTxt')}
              </button>
            </div>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700">{t('permits.office')}</span>
              <input
                type="text"
                value={authorityName}
                onChange={(e) => setAuthorityName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700"
              />
            </label>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-slate-500">
                {t('permits.samples')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_CORRECTION_LETTERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setAuthorityName(s.authority);
                      setLetterText(s.text);
                      setPkg(null);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 cursor-pointer transition-colors"
                  >
                    {s.id === 'rajuk-scrutiny' ? t('permits.sample.res') : t('permits.sample.ind')}
                  </button>
                ))}
              </div>
            </div>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700">{t('permits.paste')}</span>
              <textarea
                rows={11}
                value={letterText}
                onChange={(e) => setLetterText(e.target.value)}
                placeholder="Paste numbered corrections items from your building department scrutiny letter..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-mono text-slate-900 leading-relaxed focus-visible:outline-2 focus-visible:outline-blue-700"
              />
            </label>

            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-xs text-slate-600">
              {project && beforeAudit ? (
                <>
                  Cross-referencing automatically against <strong className="text-slate-900">{project.name}</strong> ({beforeAudit.failCount} critical, {beforeAudit.warnCount} warnings, {deltas.length} modeled fixes).
                </>
              ) : (
                <>No DXF file loaded yet. Items will be mapped to BNBC &amp; filing rules; load a DXF to bind exact geometric measurements.</>
              )}
            </div>

            <button
              type="button"
              disabled={interpreting || !letterText.trim()}
              onClick={() => void handleAnalyzeCorrections()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#12111A] hover:bg-[#2563EB] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <FileCheck2 className="w-4 h-4" />
              {interpreting ? t('permits.analyzing') : t('permits.analyze')}
            </button>
          </div>

          {/* Right: Interpreted Package */}
          <div className="lg:col-span-7 space-y-5">
            {!pkg ? (
              <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-8 text-center space-y-3">
                <FileWarning className="w-8 h-8 text-slate-400 mx-auto" />
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {t('permits.ready')}
                </h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  {t('permits.readyLead')}
                </p>
              </div>
            ) : (
              <>
                <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      Itemized objection breakdown ({pkg.items.length})
                    </h2>
                    <span className="text-[11px] font-mono text-slate-500">
                      Cross-referenced with CAD rules
                    </span>
                  </div>

                  <div className="space-y-3">
                    {pkg.items.map((item) => {
                      const badge = STATUS_BADGE[item.resolutionStatus] || STATUS_BADGE.procedural_document;
                      return (
                        <div
                          key={item.itemNumber}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-bold text-slate-900">
                                Item {item.itemNumber}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="font-medium text-slate-700">{item.category}</span>
                            </div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </div>

                          <p className="text-xs sm:text-sm font-medium text-slate-900">
                            {item.objectionSummary}
                          </p>

                          <div className="text-xs text-slate-600 space-y-1 pt-1 border-t border-slate-200/70">
                            <div>
                              <strong className="text-slate-800">{t('permits.reference')}</strong>{' '}
                              <span className="font-mono">{item.citedClause}</span>
                            </div>
                            <div>
                              <strong className="text-slate-800">{t('permits.evidence')}</strong>{' '}
                              {item.cadEvidence}
                            </div>
                            <div className="text-blue-800 font-medium">
                              <strong>{t('permits.action')}</strong> {item.recommendedResponse}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Resubmission Cover Letter */}
                <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      {t('permits.coverLetter')}
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyLetter()}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-800 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        {copiedLetter ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedLetter ? t('common.copied') : t('common.copy')}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadLetter}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-800 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        {t('common.downloadTxt')}
                      </button>
                    </div>
                  </div>

                  <pre className="whitespace-pre-wrap font-mono text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-4 leading-relaxed max-h-[380px] overflow-y-auto">
                    {pkg.responseLetter}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Flow 2: Pre-Submission Permit Checklist */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Parameters Panel */}
          <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900 border-b border-slate-200 pb-3">
              {t('permits.profile')}
            </h2>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700">{t('permits.authority')}</span>
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value as PermitJurisdiction)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {Object.entries(JURISDICTION_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700">{t('permits.occupancy')}</span>
              <select
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value as OccupancyClass)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="residential">Residential / Multi-Unit</option>
                <option value="mixed">Commercial / Mixed-Use</option>
                <option value="industrial_rmg">Industrial / RMG Factory</option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-medium text-slate-700">{t('permits.floors')}</span>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={floorsCount}
                  onChange={(e) => setFloorsCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700">{t('permits.storey')}</span>
                <input
                  type="number"
                  step={0.1}
                  min={2.4}
                  max={6}
                  value={storyHeightM}
                  onChange={(e) => setStoryHeightM(Math.max(2.4, Number(e.target.value) || 3.2))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700">{t('review.site.plotArea')}</span>
                <input
                  type="number"
                  min={0}
                  value={plotAreaSqM}
                  onChange={(e) => setPlotAreaSqM(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="font-medium text-slate-700">{t('review.site.road')}</span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={roadWidthM}
                  onChange={(e) => setRoadWidthM(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs tabular-nums"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={sprinklered}
                onChange={(e) => setSprinklered(e.target.checked)}
                className="rounded border-slate-300"
              />
              {t('permits.sprinkler')}
            </label>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600">
                {t('permits.totalHeight')}{' '}
                <strong className="font-mono text-slate-900 tabular-nums">
                  {(floorsCount * storyHeightM).toFixed(1)} m
                </strong>
              </span>
              <span className="font-mono text-slate-700">
                {floorsCount * storyHeightM > 20 ? t('permits.highRise') : t('permits.standard')}
              </span>
            </div>
          </div>

          {/* Generated Checklist */}
          <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Submittal checklist ({readyCount} / {checklist.length} ready)
                </h2>
                <p className="text-xs text-slate-500">
                  {JURISDICTION_LABELS[jurisdiction]} · interactive pre-filing verification
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadChecklist}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <FileDown className="w-3.5 h-3.5" />
                Export checklist .TXT
              </button>
            </div>

            <div className="divide-y divide-slate-200/80">
              {checklist.map((item) => {
                const isChecked = checkedIds[item.id] ?? item.status === 'pass';
                return (
                  <label
                    key={item.id}
                    className="py-3.5 flex items-start gap-3 cursor-pointer hover:bg-slate-50/70 px-2 rounded-lg transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setCheckedIds((prev) => ({ ...prev, [item.id]: e.target.checked }))
                      }
                      className="mt-1 rounded border-slate-300"
                    />
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isChecked ? 'text-slate-500 line-through' : 'text-slate-900'
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{item.requirement}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <BasisBadge basis={item.basis} />
                        <span className="font-mono">{item.citation}</span>
                        {item.measuredNote && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-blue-800">{item.measuredNote}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {isChecked && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
