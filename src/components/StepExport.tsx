import { useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Copy,
  Check,
  FileDown,
  ExternalLink,
  FileText,
  Sparkles,
} from 'lucide-react';
import { requestDeficiencyMemo } from '../engine/aiFallback';
import type {
  BuildingProject,
  ComplianceAudit,
  DeficiencyMemo,
  RemediationDelta,
} from '../types/plan';

interface StepExportProps {
  project: BuildingProject;
  beforeAudit: ComplianceAudit;
  afterAudit: ComplianceAudit;
  deltas: RemediationDelta[];
  shareUrl: string;
  onOpen3DView: () => void;
}

export function StepExport({
  project,
  beforeAudit,
  afterAudit,
  deltas,
  shareUrl,
  onOpen3DView,
}: StepExportProps) {
  const [copied, setCopied] = useState(false);
  const [memo, setMemo] = useState<DeficiencyMemo | null>(null);
  const [generatingMemo, setGeneratingMemo] = useState(false);
  const [memoLang, setMemoLang] = useState<'both' | 'en' | 'bn'>('both');
  const [copiedMemo, setCopiedMemo] = useState(false);

  const primaryFloor = project.floors[0];
  const totalRooms = project.floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalHeightM = (project.floors.length * project.storyHeightM).toFixed(1);
  const m = beforeAudit.metrics;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleGenerateMemo = async () => {
    setGeneratingMemo(true);
    const res = await requestDeficiencyMemo(project, beforeAudit, afterAudit);
    setMemo(res);
    setGeneratingMemo(false);
  };

  const getMemoPlainText = () => {
    if (!memo) return '';
    return [
      memo.subjectEn,
      memo.subjectBn,
      `Decision Status: ${memo.decisionStatus}`,
      '',
      '--- ENGLISH SCRUTINY MEMO ---',
      memo.memoBodyEn,
      '',
      '--- বাংলা যাচাই স্মারক ---',
      memo.memoBodyBn,
      '',
      'Cited Clauses:',
      ...memo.citedClauses.map((c) => `- ${c}`),
    ].join('\n');
  };

  const handleCopyMemo = async () => {
    try {
      await navigator.clipboard.writeText(getMemoPlainText());
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 2000);
    } catch {
      setCopiedMemo(false);
    }
  };

  const handleDownloadMemoTxt = () => {
    if (!memo) return;
    const blob = new Blob([getMemoPlainText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (primaryFloor?.sourceFileName || project.id).replace(/\.dxf$/i, '');
    a.href = url;
    a.download = `${safeName}_RAJUK_FSCD_Scrutiny_Memo.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let y = 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('PlanCheck AI — BNBC & Imarat Compliance Report', 15, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 90, 105);
    doc.text(
      `Building: ${project.name} (${project.floors.length} ${
        project.floors.length === 1 ? 'Floor' : 'Floors'
      })`,
      15,
      y
    );
    y += 5;
    doc.text(
      `Envelope: ${primaryFloor.bounds.widthM} m x ${primaryFloor.bounds.heightM} m x ${totalHeightM} m | Zones: ${totalRooms} | Date: ${new Date().toISOString().slice(0, 10)}`,
      15,
      y
    );
    y += 6;

    doc.setDrawColor(180, 190, 200);
    doc.line(15, y, 195, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Scope & Disclaimer', 15, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      'Evaluated deterministically against BNBC 2012/2020 (Egress, Habitability, Capacity) & Dhaka Imarat Bidhimala 2008 (FAR, MGC, Setbacks).',
      15,
      y
    );
    y += 4;
    doc.text(
      'Prototype pre-review tool; not an official RAJUK / FSCD regulatory approval. Source DXF files are unmodified.',
      15,
      y
    );
    y += 7;

    if (m) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Zoning & Egress Capacity Summary', 15, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        `Plot: ${m.plotAreaSqM} m2 | Ground Footprint: ${m.groundFootprintSqM} m2 | MGC: ${m.mgcPercent}% (Max ${m.maxAllowedMgcPercent}%) | FAR: ${m.achievedFar} (Max ${m.maxAllowedFar})`,
        15,
        y
      );
      y += 4.5;
      doc.text(
        `Peak Floor Load: ${m.peakFloorLoad} persons (${m.totalOccupantLoad} total) | Ground Exit Cap: ${m.groundExitCapacityPersons} p | Stair Cap: ${m.stairCapacityPersons} p | Travel Limit: ${m.travelLimitM} m`,
        15,
        y
      );
      y += 7;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(
      `Audit Summary: ${beforeAudit.failCount} FAIL, ${beforeAudit.warnCount} WARN, ${beforeAudit.passedCount} PASS  ->  Post-Fix: ${afterAudit.failCount} FAIL`,
      15,
      y
    );
    y += 6;

    if (beforeAudit.floorSummaries && beforeAudit.floorSummaries.length > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      beforeAudit.floorSummaries.forEach((fs) => {
        const afterFs = afterAudit.floorSummaries?.find(
          (a) => a.floorIndex === fs.floorIndex
        );
        doc.text(
          `[${fs.floorLabel}] ${fs.floorName}: ${fs.failCount} FAIL, ${fs.warnCount} WARN (${fs.worstEscapeSec.toFixed(
            1
          )}s)  ->  Post-Fix: ${afterFs?.failCount ?? 0} FAIL (${(
            afterFs?.worstEscapeSec ?? 0
          ).toFixed(1)}s)`,
          18,
          y
        );
        y += 4.5;
      });
      y += 3;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Cited Deterministic Findings', 15, y);
    y += 6;

    beforeAudit.violations.forEach((v, idx) => {
      if (y > 265) {
        doc.addPage();
        y = 18;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const flTag = v.floorLabel ? `[${v.floorLabel}] ` : '';
      doc.text(`${idx + 1}. ${flTag}[${v.status}] ${v.ruleName} — ${v.roomName}`, 15, y);
      y += 4.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        `Citation: ${v.citation} | Measured: ${
          v.measuredValue >= 99 ? 'BLOCKED' : `${v.measuredValue} ${v.unit}`
        } | Limit: ${v.comparator} ${v.limitValue} ${v.unit}`,
        18,
        y
      );
      y += 4.5;
      const lines = doc.splitTextToSize(v.aiExplanation?.en || v.description, 172);
      doc.text(lines, 18, y);
      y += lines.length * 4 + 3;
    });

    if (deltas.length > 0) {
      if (y > 245) {
        doc.addPage();
        y = 18;
      }
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Simulated Geometry Remediations (JSON Transform Only)', 15, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      deltas.forEach((d, idx) => {
        if (y > 275) {
          doc.addPage();
          y = 18;
        }
        doc.text(`${idx + 1}. ${d.summary}`, 18, y);
        y += 5;
      });
    }

    const safeName = (primaryFloor?.sourceFileName || project.id).replace(/\.dxf$/i, '');
    doc.save(`${safeName}_BNBC_PlanCheck_Report.pdf`);
  };

  return (
    <main className="max-w-[1080px] mx-auto px-6 py-10 space-y-8">
      <div className="border-b border-slate-200/90 pb-5 space-y-1.5">
        <p className="text-xs font-mono text-slate-500">
          Step 06 · Deliverable Export · {project.name} ({project.floors.length}{' '}
          {project.floors.length === 1 ? 'Floor' : 'Floors'})
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Export Cited Compliance Report, Deficiency Memo & 3D Link
        </h1>
        <p className="text-sm text-slate-600">
          Generate a formal multi-floor PDF, draft a bilingual RAJUK/FSCD scrutiny memo,
          or share the interactive 3D escape simulation directly.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PDF Export Card */}
        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              BNBC & Zoning Compliance PDF
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Includes building envelope, FAR/MGC/setbacks, occupant capacity, per-floor
              breakdown, exact clause citations, and before/after geometric fixes.
            </p>
            <div className="pt-2 text-xs font-mono text-slate-700 space-y-1 tabular-nums">
              <div>
                Floors audited: {project.floors.length} ({totalHeightM} m total height)
              </div>
              {m && (
                <div>
                  FAR {m.achievedFar}/{m.maxAllowedFar} · MGC {m.mgcPercent}%/{m.maxAllowedMgcPercent}% · Load {m.peakFloorLoad}p
                </div>
              )}
              <div>Violations cited: {beforeAudit.violations.length}</div>
              <div>Post-remediation failures: {afterAudit.failCount}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <FileDown className="w-4 h-4" />
            Download Compliance PDF
          </button>
        </div>

        {/* Shareable 3D Simulation URL */}
        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Shareable 3D Simulation Link
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Deep-links straight to the interactive 3D building stack with the selected
              floor, room, and Before/After escape state encoded in the URL.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-[11px] text-slate-700 break-all">
              {shareUrl}
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Link Copied' : 'Copy 3D Link'}
            </button>
            <button
              type="button"
              onClick={onOpen3DView}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open 3D View
            </button>
          </div>
        </div>
      </div>

      {/* One-Click RAJUK / FSCD Scrutiny Deficiency Memo */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-700 shrink-0" />
              <h2 className="font-display text-lg font-semibold text-slate-900">
                RAJUK / FSCD Plan Scrutiny Deficiency Memo (EN + বাংলা)
              </h2>
            </div>
            <p className="text-xs text-slate-600">
              Synthesizes an official pre-submission objection or clearance memo strictly
              grounded in deterministic measurements and retrieved BNBC / Imarat clauses.
            </p>
          </div>

          <button
            type="button"
            disabled={generatingMemo}
            onClick={() => void handleGenerateMemo()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generatingMemo
              ? 'Drafting Memo...'
              : memo
                ? 'Regenerate Scrutiny Memo'
                : 'Generate Scrutiny Memo'}
          </button>
        </div>

        {memo && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-xs font-mono">
                <span
                  className={`font-bold ${
                    memo.decisionStatus === 'OBJECTION_RAISED'
                      ? 'text-red-700'
                      : memo.decisionStatus === 'CONDITIONAL_REVIEW'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                  }`}
                >
                  Status: {memo.decisionStatus.replace(/_/g, ' ')}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  {memo.source === 'gemini-rag' ? 'Gemini RAG Draft' : 'Deterministic Template'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg bg-slate-200/70 p-0.5 text-xs">
                  {(['both', 'en', 'bn'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMemoLang(mode)}
                      className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                        memoLang === mode
                          ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mode === 'both' ? 'EN + বাংলা' : mode === 'en' ? 'EN' : 'বাংলা'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyMemo()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-800 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedMemo ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMemoTxt}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-800 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  .TXT
                </button>
              </div>
            </div>

            {(memoLang === 'both' || memoLang === 'en') && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="text-xs font-bold text-slate-900">{memo.subjectEn}</div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 leading-relaxed">
                  {memo.memoBodyEn}
                </pre>
              </div>
            )}

            {(memoLang === 'both' || memoLang === 'bn') && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="text-xs font-bold text-slate-900">{memo.subjectBn}</div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 leading-relaxed">
                  {memo.memoBodyBn}
                </pre>
              </div>
            )}

            <div className="text-[11px] font-mono text-slate-600">
              <strong>Cited Clauses:</strong> {memo.citedClauses.join(' · ')}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
