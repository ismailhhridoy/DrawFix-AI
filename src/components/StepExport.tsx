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
  shareUrl: string | null;
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
      if (!shareUrl) return;
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
      '',
      '--- ENGLISH ---',
      memo.memoBodyEn,
      '',
      '--- বাংলা ---',
      memo.memoBodyBn,
      '',
      'References:',
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
    a.download = `${safeName}_draft_review_note.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 15;
    const W = 180;
    let y = 18;
    // The built-in PDF font has no Bangla glyphs, so Bangla labels are replaced, not garbled.
    const safe = (text: string) =>
      text
        .replace(/[ঀ-৿][ঀ-৿\s]*/g, '[Bangla label] ')
        .replace(/[–—]/g, '-')
        .replace(/[“”]/g, '"')
        .replace(/²/g, '2')
        .replace(/→/g, '->')
        .replace(/≥/g, '>=')
        .replace(/≤/g, '<=')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    const ensure = (need: number) => {
      if (y + need > 282) {
        doc.addPage();
        y = 18;
      }
    };
    const para = (text: string, size = 8.5, indent = 0, bold = false, gap = 1.5) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(safe(text), W - indent) as string[];
      const lh = size * 0.45;
      ensure(lines.length * lh + gap);
      doc.text(lines, L + indent, y);
      y += lines.length * lh + gap;
    };
    const heading = (text: string) => {
      ensure(12);
      y += 3;
      doc.setTextColor(15, 23, 42);
      para(text, 11, 0, true, 2.5);
    };

    doc.setTextColor(15, 23, 42);
    para('PlanCheck AI: plan check report', 16, 0, true, 2);
    doc.setTextColor(80, 90, 105);
    para(
      `${project.name} | ${project.floors.length} floor${project.floors.length === 1 ? '' : 's'}, ${totalHeightM} m | plan ${primaryFloor.bounds.widthM} m x ${primaryFloor.bounds.heightM} m | ${totalRooms} rooms | ${new Date().toISOString().slice(0, 10)}`
    );
    doc.setDrawColor(180, 190, 200);
    doc.line(L, y + 1, L + W, y + 1);
    y += 5;
    doc.setTextColor(15, 23, 42);

    para('What this report is', 10, 0, true);
    para(
      'A prototype pre-submission screening. It is not an approval and not a RAJUK or Fire Service document. Every measurement was computed by code from the DXF geometry. Limits marked VERIFIED were read in the BNBC 2012 text (Part 3, Chapter 1). Limits marked SCREENING are prototype values that a qualified reviewer must confirm against the gazette. The DXF file was not modified.'
    );

    heading(
      `Result: ${beforeAudit.failCount} fail, ${beforeAudit.warnCount} warn, ${beforeAudit.passedCount} checks passed`
    );
    if (m) {
      para(
        m.plotAreaSqM > 0
          ? `Zoning screening: plot ${m.plotAreaSqM} m2, ground floor ${m.groundFootprintSqM} m2, coverage ${m.mgcPercent}% (screening limit ${m.maxAllowedMgcPercent}%), FAR ${m.achievedFar} (screening limit ${m.maxAllowedFar}).`
          : 'Zoning not screened: plot data was not entered.'
      );
      para(
        `Estimates on assumed factors: peak floor load ${m.peakFloorLoad} persons (${m.totalOccupantLoad} in building), ground exit capacity ${m.groundExitCapacityPersons} persons, stair capacity ${m.stairCapacityPersons} persons.`
      );
    }
    if (beforeAudit.floorSummaries && beforeAudit.floorSummaries.length > 1) {
      beforeAudit.floorSummaries.forEach((fs) => {
        para(
          `[${fs.floorLabel}] ${fs.floorName}: ${fs.failCount} fail, ${fs.warnCount} warn, slowest escape ${fs.worstEscapeSec > 0 ? `${fs.worstEscapeSec.toFixed(1)} s` : 'not measured'}${fs.trappedRoomCount > 0 ? `, ${fs.trappedRoomCount} rooms with no route` : ''}`,
          8.5,
          3
        );
      });
    }

    heading('Findings');
    if (beforeAudit.violations.length === 0) para('Nothing was flagged.');
    beforeAudit.violations.forEach((v, idx) => {
      ensure(16);
      const flTag = v.floorLabel ? `[${v.floorLabel}] ` : '';
      para(`${idx + 1}. ${flTag}${v.status}: ${v.ruleName} (${v.roomName})`, 9.5, 0, true, 1);
      para(
        `${v.blocked ? 'No route found' : `Measured ${v.measuredValue} ${v.unit}, limit ${v.comparator} ${v.limitValue} ${v.unit}`} | ${(v.basis || 'screening').toUpperCase()} | ${v.citation}`,
        8,
        3,
        false,
        1
      );
      para(v.aiExplanation?.source === 'gemini' ? v.aiExplanation.en : v.description, 8.5, 3, false, 3);
    });

    heading('Not checked');
    const skipped = beforeAudit.notChecked || [];
    if (skipped.length === 0) {
      para('No check was skipped for missing data.');
    } else {
      skipped.forEach((n) => para(`- ${n.floorLabel ? `[${n.floorLabel}] ` : ''}${n.item}: ${n.reason}`, 8.5, 3));
    }
    para(
      'Outside this tool entirely: structural design, fire resistance of construction, detection and suppression systems, building services, accessibility, and anything not visible in a floor plan.',
      8.5,
      3
    );

    if (deltas.length > 0) {
      heading(
        `Proposed changes (applied to a copy of the geometry): ${afterAudit.failCount} fail, ${afterAudit.warnCount} warn afterwards`
      );
      deltas.forEach((d, idx) => para(`${idx + 1}. ${d.summary}`, 8.5, 3));
    }

    const safeName = (primaryFloor?.sourceFileName || project.id).replace(/\.dxf$/i, '');
    doc.save(`${safeName}_plancheck_report.pdf`);
  };

  return (
    <main className="max-w-[1080px] mx-auto px-6 py-10 space-y-8">
      <div className="border-b border-slate-200/90 pb-5 space-y-1.5">
        <p className="text-xs font-mono text-slate-500">
          Step 06 · Export · {project.name} ({project.floors.length}{' '}
          {project.floors.length === 1 ? 'Floor' : 'Floors'})
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Take the results with you
        </h1>
        <p className="text-sm text-slate-600">
          Download the report as a PDF, draft a review note in English and Bangla, or share
          the 3D escape view of a demo plan.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PDF Export Card */}
        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Report PDF
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every finding with its measurement, limit, source and trust level, the list of
              what was not checked, and the proposed changes. Bangla room labels are shown as
              “[Bangla label]” in the PDF.
            </p>
            <div className="pt-2 text-xs font-mono text-slate-700 space-y-1 tabular-nums">
              <div>
                Floors audited: {project.floors.length} ({totalHeightM} m total height)
              </div>
              <div>
                Findings: {beforeAudit.failCount} fail, {beforeAudit.warnCount} warn
              </div>
              <div>Not checked: {(beforeAudit.notChecked || []).length} items</div>
              <div>With proposed changes: {afterAudit.failCount} fail</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <FileDown className="w-4 h-4" />
            Download report PDF
          </button>
        </div>

        {/* Shareable 3D Simulation URL */}
        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Link to the 3D escape view
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {shareUrl
                ? 'Opens this demo plan in 3D on the floor, room and before/after state you last viewed.'
                : 'Uploaded drawings stay in this browser and are not stored on a server, so there is no link to share. Use the PDF instead.'}
            </p>
            {shareUrl && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-[11px] text-slate-700 break-all">
                {shareUrl}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={!shareUrl}
              className="disabled:opacity-40 disabled:cursor-not-allowed flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy link'}
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
                Draft review note (English + বাংলা)
              </h2>
            </div>
            <p className="text-xs text-slate-600">
              A plain summary of the findings for the owner or design team. It is a draft from a
              prototype, not a RAJUK or Fire Service document, and says so at the top.
            </p>
          </div>

          <button
            type="button"
            disabled={generatingMemo}
            onClick={() => void handleGenerateMemo()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generatingMemo ? 'Drafting…' : memo ? 'Draft again' : 'Draft review note'}
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
                  {memo.decisionStatus === 'OBJECTION_RAISED'
                    ? 'Issues found'
                    : memo.decisionStatus === 'CONDITIONAL_REVIEW'
                      ? 'Warnings only'
                      : 'Nothing flagged'}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">
                  {memo.source === 'gemini-rag' ? 'Written by Gemini from the findings' : 'Fixed wording (Gemini not running)'}
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
              <strong>References:</strong> {memo.citedClauses.join(' · ')}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
