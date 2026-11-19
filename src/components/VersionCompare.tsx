import { useMemo } from 'react';
import { compareVersions } from '../engine/resubmission';
import type { ComplianceAudit, Violation } from '../types/plan';

export interface SavedVersion {
  name: string;
  savedAt: number;
  audit: ComplianceAudit;
}

interface VersionCompareProps {
  projectName: string;
  audit: ComplianceAudit;
  saved: SavedVersion | null;
  onSave: () => void;
  onClear: () => void;
}

function line(v: Violation): string {
  const where = [v.roomName, v.floorLabel].filter(Boolean).join(' · ');
  const val = v.blocked ? 'no route' : `${v.measuredValue} ${v.unit} (limit ${v.limitValue} ${v.unit})`;
  return `${v.ruleName} — ${where} — ${val}`;
}

/** Revised drawing vs an earlier version: what was cleared, what is new, what is still open. */
export function VersionCompare({ projectName, audit, saved, onSave, onClear }: VersionCompareProps) {
  const diff = useMemo(() => (saved ? compareVersions(saved.audit, audit) : null), [saved, audit]);

  if (!saved || !diff) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-slate-900">Track corrections between versions</h2>
          <p className="text-xs text-slate-600 max-w-2xl">
            Save this result as version 1. Fix the drawing in AutoCAD, upload the new DXF, and this page will show
            which findings are cleared, which are new and which are still open.
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-700 rounded-lg cursor-pointer whitespace-nowrap"
        >
          Save as version 1
        </button>
      </section>
    );
  }

  const sameDrawing = diff.cleared.length === 0 && diff.newlyFound.length === 0 && saved.name === projectName;
  const bad = diff.newlyFound.length + diff.stillOpen.filter((c) => c.direction === 'worse').length;

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-slate-900">Compared with version 1 ({saved.name})</h2>
          <p className="text-xs text-slate-700 tabular-nums">
            Failures {diff.failBefore} → {diff.failAfter} · Warnings {diff.warnBefore} → {diff.warnAfter}
            {diff.escapeSecBefore > 0 && diff.escapeSecAfter > 0
              ? ` · Slowest escape ${diff.escapeSecBefore.toFixed(0)} s → ${diff.escapeSecAfter.toFixed(0)} s`
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
        >
          Stop comparing
        </button>
      </div>

      {sameDrawing && (
        <p className="text-xs text-slate-700">
          Nothing has changed yet. Upload the revised DXF from the Upload step to see the differences.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg bg-white border border-emerald-200 p-3 space-y-1.5">
          <div className="font-semibold text-emerald-700">Cleared ({diff.cleared.length})</div>
          {diff.cleared.slice(0, 6).map((v) => (
            <div key={v.id} className="text-slate-700">{line(v)}</div>
          ))}
          {diff.cleared.length > 6 && <div className="text-slate-500">+{diff.cleared.length - 6} more</div>}
        </div>
        <div className="rounded-lg bg-white border border-red-200 p-3 space-y-1.5">
          <div className="font-semibold text-red-700">New in this version ({diff.newlyFound.length})</div>
          {diff.newlyFound.slice(0, 6).map((v) => (
            <div key={v.id} className="text-slate-700">{line(v)}</div>
          ))}
          {diff.newlyFound.length > 6 && <div className="text-slate-500">+{diff.newlyFound.length - 6} more</div>}
        </div>
        <div className="rounded-lg bg-white border border-amber-200 p-3 space-y-1.5">
          <div className="font-semibold text-amber-700">Still open ({diff.stillOpen.length})</div>
          {diff.stillOpen.slice(0, 6).map((c) => (
            <div key={c.after.id} className="text-slate-700">
              {line(c.after)}
              {c.direction === 'better' ? ' — improved' : c.direction === 'worse' ? ' — worse' : ''}
            </div>
          ))}
          {diff.stillOpen.length > 6 && <div className="text-slate-500">+{diff.stillOpen.length - 6} more</div>}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Findings are matched by rule, floor and room name. If a room was renamed, its finding shows as cleared and a
        new one appears.{bad > 0 ? ` ${bad} finding(s) got worse or are new: check these before refiling.` : ''}
      </p>
    </section>
  );
}
