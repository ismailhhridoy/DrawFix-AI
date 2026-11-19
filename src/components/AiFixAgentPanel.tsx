import { useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, Loader2, Sparkles, Square, XCircle } from 'lucide-react';
import type { BuildingProject, ComplianceAudit } from '../types/plan';
import { Bi, useLang } from '../i18n';
import { useAiStatus } from './shared';
import { applyApprovedChanges, runFixAgent, type AgentRun, type AgentStep, type StagedChange } from '../engine/fixAgent';
import { proposeAndVerify, type VerifiedCandidate } from '../engine/aiLayoutProposer';
import { isProblem, type LayoutEdit } from '../engine/layoutEdits';

export interface ApprovedAiChanges {
  project: BuildingProject;
  audit: ComplianceAudit;
  edits: LayoutEdit[];
  descriptions: { en: string; bn: string }[];
  skipped: number;
}

interface Props {
  project: BuildingProject;
  baseAudit: ComplianceAudit;
  approved: ApprovedAiChanges | null;
  onApprove: (a: ApprovedAiChanges) => void;
  onClear: () => void;
}

function stepSummary(step: AgentStep): { ok: boolean | null; text: string } {
  if (step.tool === 'try_edits') {
    try {
      const r = JSON.parse(step.result);
      return { ok: Boolean(r.accepted), text: r.reason };
    } catch {
      return { ok: false, text: step.result };
    }
  }
  if (step.tool === 'run_audit') {
    try {
      const r = JSON.parse(step.result);
      return { ok: null, text: `${r.fail} fail / ${r.warn} warn, ${r.problems?.length ?? 0} open finding(s)` };
    } catch {
      return { ok: null, text: step.result };
    }
  }
  if (step.tool === 'get_floor') return { ok: null, text: `Read floor ${String(step.args.floorIndex ?? 0)}` };
  return { ok: step.ok ? null : false, text: step.result };
}

function candidateToStaged(c: VerifiedCandidate, key: string): StagedChange {
  return {
    tryId: key,
    edits: c.edits,
    descriptions: c.descriptions,
    targets: c.verdict.resolved.map((v) => ({ id: v.id, ruleName: v.ruleName, roomName: v.roomName, floorLabel: v.floorLabel })),
    verdictReason: c.verdict.reason,
    before: c.verdict.before,
    after: c.verdict.after!,
  };
}

export function AiFixAgentPanel({ project, baseAudit, approved, onApprove, onClear }: Props) {
  const { t, num } = useLang();
  const ai = useAiStatus();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [staged, setStaged] = useState<StagedChange[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const stopRef = useRef(false);

  const problems = useMemo(() => baseAudit.violations.filter(isProblem), [baseAudit]);
  const [pick, setPick] = useState<string>('');
  const [asking, setAsking] = useState(false);
  const [options, setOptions] = useState<VerifiedCandidate[] | null>(null);

  const startAgent = async () => {
    stopRef.current = false;
    setRunning(true);
    setSteps([]);
    setRun(null);
    const r = await runFixAgent(project, {
      policy: 'auto',
      maxSteps: 30,
      shouldStop: () => stopRef.current,
      onStep: (s) => setSteps((prev) => [...prev, s]),
    });
    setRun(r);
    setStaged((prev) => [...prev.filter((p) => p.tryId.startsWith('opt-')), ...r.staged]);
    setChecked((prev) => ({ ...prev, ...Object.fromEntries(r.staged.map((s) => [s.tryId, true])) }));
    setRunning(false);
  };

  const askOptions = async () => {
    const target = problems.find((v) => v.id === pick);
    if (!target) return;
    setAsking(true);
    setOptions(null);
    const res = await proposeAndVerify(project, baseAudit, [target], { rounds: 2, maxCandidates: 3 });
    setOptions(res.all);
    setAsking(false);
  };

  const keepOption = (c: VerifiedCandidate, i: number) => {
    const key = `opt-${pick}-${c.round}-${c.rank}-${i}`;
    if (staged.some((s) => s.tryId === key)) return;
    setStaged((prev) => [...prev, candidateToStaged(c, key)]);
    setChecked((prev) => ({ ...prev, [key]: true }));
  };

  const approve = () => {
    const ids = staged.filter((s) => checked[s.tryId]).map((s) => s.tryId);
    const res = applyApprovedChanges(project, staged, ids);
    const descriptions = staged.filter((s) => ids.includes(s.tryId) && !res.skipped.some((k) => k.tryId === s.tryId)).flatMap((s) => s.descriptions);
    onApprove({ project: res.project, audit: res.audit, edits: res.appliedEdits, descriptions, skipped: res.skipped.length });
  };

  const nChecked = staged.filter((s) => checked[s.tryId]).length;

  return (
    <section className="bg-white border border-violet-200 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-4 border-b border-violet-100 bg-violet-50/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="w-4 h-4 text-violet-700" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900">{t('agent.title')}</h2>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-violet-200 bg-white text-violet-800">{t('agent.rule')}</span>
          </div>
          <p className="text-xs text-slate-600 max-w-3xl">{t('agent.lead')}</p>
          {ai.checked && !ai.aiConfigured && <p className="text-xs text-amber-800">{t('agent.off')}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {running ? (
            <button type="button" onClick={() => (stopRef.current = true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">
              <Square className="w-3.5 h-3.5" /> {t('agent.stop')}
            </button>
          ) : null}
          <button
            type="button"
            disabled={running}
            onClick={() => void startAgent()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-violet-700 hover:bg-violet-800 disabled:opacity-60 rounded-lg cursor-pointer"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {running ? t('agent.running', { n: steps.length + 1 }) : t('agent.run')}
          </button>
        </div>
      </div>

      {approved && (
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-emerald-900">{t('agent.approvedTitle')}</div>
            <p className="text-xs text-emerald-900/80">{t('agent.approvedLead', { n: approved.descriptions.length })}</p>
            {approved.skipped > 0 && <p className="text-xs text-amber-800">{t('agent.skipped', { n: approved.skipped })}</p>}
          </div>
          <button type="button" onClick={onClear} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-100 cursor-pointer whitespace-nowrap">
            {t('agent.useRules')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-violet-100">
        {/* Trace */}
        <div className="p-5 space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900">{t('agent.trace')}</h3>
            {run && (
              <span className="text-[11px] font-mono text-slate-500">
                {run.policy === 'gemini' ? t('agent.policy.gemini') : t('agent.policy.rules')} · {t('agent.tries', { a: run.acceptedTries, b: run.tries })}
              </span>
            )}
          </div>
          {steps.length === 0 && !running && <p className="text-xs text-slate-500">—</p>}
          <ol className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {steps.map((s) => {
              const sum = stepSummary(s);
              return (
                <li key={s.n} className="text-xs border border-slate-200 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400">{num(s.n)}</span>
                    <span className="font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">{s.tool}</span>
                    {sum.ok === true && <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="w-3.5 h-3.5" />{t('agent.accepted')}</span>}
                    {sum.ok === false && <span className="inline-flex items-center gap-1 text-red-700 font-semibold"><XCircle className="w-3.5 h-3.5" />{t('agent.rejected')}</span>}
                  </div>
                  {s.thought && (
                    <div className="text-slate-600">
                      <span className="text-violet-700 font-semibold">{t('agent.note')}:</span> {s.thought}
                    </div>
                  )}
                  <div className="text-slate-800">
                    <span className="font-semibold">{t('agent.engine')}:</span> {sum.text.slice(0, 260)}
                  </div>
                </li>
              );
            })}
          </ol>
          {run && <p className="text-[11px] text-slate-500">{t('agent.stopped')}: {run.stoppedBecause}</p>}

          {/* Feature 1 on its own: options for one finding */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <h3 className="text-xs font-semibold text-slate-900">{t('agent.options')}</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={pick} onChange={(e) => { setPick(e.target.value); setOptions(null); }} className="flex-1 min-w-0 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                <option value="">{t('agent.pick')}</option>
                {problems.map((v) => (
                  <option key={v.id} value={v.id}>
                    [{v.floorLabel}] {v.ruleName} · {v.roomName}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!pick || asking || !ai.aiConfigured} onClick={() => void askOptions()} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-violet-300 text-violet-800 bg-white hover:bg-violet-50 disabled:opacity-50 cursor-pointer">
                {t('agent.ask')}
              </button>
            </div>
            {asking && <p className="text-xs text-slate-600 inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('agent.asking')}</p>}
            {options && options.length === 0 && <p className="text-xs text-slate-600">{t('agent.noOptions')}</p>}
            {options && options.length > 0 && (
              <ul className="space-y-2">
                {options.map((c, i) => {
                  const key = `opt-${pick}-${c.round}-${c.rank}-${i}`;
                  const kept = staged.some((s) => s.tryId === key);
                  return (
                    <li key={key} className={`text-xs border rounded-lg p-2.5 space-y-1 ${c.verdict.accepted ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50 opacity-80'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {t('agent.optionRank', { n: c.rank + 1 })}
                          {c.round > 1 ? ` · ${t('agent.retry')}` : ''}
                        </span>
                        {c.verdict.accepted ? (
                          <button type="button" disabled={kept} onClick={() => keepOption(c, i)} className="px-2 py-1 rounded border border-emerald-300 bg-white text-emerald-800 font-semibold disabled:opacity-60 cursor-pointer">
                            {kept ? t('agent.kept') : t('agent.keep')}
                          </button>
                        ) : (
                          <span className="text-red-700 font-semibold">{t('agent.rejected')}</span>
                        )}
                      </div>
                      {c.descriptions.map((d, k) => <Bi key={k} as="div" className="text-slate-800" en={d.en} bn={d.bn} />)}
                      {(c.rationaleEn || c.rationaleBn) && <Bi as="div" className="text-slate-500 italic" en={c.rationaleEn} bn={c.rationaleBn} />}
                      <div className="text-slate-700"><span className="font-semibold">{t('agent.engine')}:</span> {c.verdict.reason}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Approval gate */}
        <div className="p-5 space-y-3 min-w-0">
          <h3 className="text-xs font-semibold text-slate-900">{t('agent.staged')}</h3>
          {staged.length === 0 && <p className="text-xs text-slate-500">{t('agent.noneStaged')}</p>}
          <ul className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {staged.map((s) => (
              <li key={s.tryId} className="text-xs border border-slate-200 rounded-lg p-2.5">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={Boolean(checked[s.tryId])} onChange={(e) => setChecked((p) => ({ ...p, [s.tryId]: e.target.checked }))} />
                  <div className="space-y-1 min-w-0">
                    {s.descriptions.map((d, k) => <Bi key={k} as="div" className="font-medium text-slate-900" en={d.en} bn={d.bn} />)}
                    {s.targets.length > 0 && (
                      <div className="text-slate-600">
                        {t('agent.targets')}: {s.targets.map((x) => `[${x.floorLabel ?? ''}] ${x.ruleName} · ${x.roomName}`).join('; ')}
                      </div>
                    )}
                    <div className="font-mono text-slate-500 tabular-nums">
                      {t('agent.counts', { a: s.before.fail, b: s.before.warn })} → {t('agent.counts', { a: s.after.fail, b: s.after.warn })}
                    </div>
                    <div className="text-emerald-800">{s.verdictReason}</div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" disabled={nChecked === 0} onClick={approve} className="w-full inline-flex justify-center items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg cursor-pointer">
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('agent.approve', { n: nChecked })}
          </button>
        </div>
      </div>
    </section>
  );
}
