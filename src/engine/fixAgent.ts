/**
 * Feature 3: the fix agent.
 *
 * Gemini drives a loop of tool calls: run_audit, get_floor, try_edits, stage, finish.
 * Every tool is plain code: try_edits applies edits to a copy and re-runs the full audit.
 * Only an accepted try can be staged. Staged changes do not count until a person approves
 * them (`applyApprovedChanges`), which re-applies the approved ones to the original plan and
 * re-runs the audit again.
 *
 * Without Gemini the same loop runs with a fixed policy (the hand-written fixes), so the
 * screen still works and the trace says which policy ran.
 */
import type { BuildingProject, ComplianceAudit, Violation } from '../types/plan';
import { runBuildingAudit } from './ruleEngine';
import {
  applyLayoutEdits,
  describeEdit,
  fixSpecToEdits,
  isProblem,
  normalizeEdit,
  planSummaryForAi,
  verifyCandidate,
  type CandidateVerdict,
  type LayoutEdit,
} from './layoutEdits';
import { postJson } from './aiApi';
import { checkNumbers } from './numberGuard';

export type AgentTool = 'run_audit' | 'get_floor' | 'try_edits' | 'stage' | 'finish';

export interface AgentStep {
  n: number;
  /** Gemini's stated reason for the call (numbers removed). Shown as the agent's note, never as a result. */
  thought: string;
  tool: AgentTool | 'invalid';
  args: Record<string, unknown>;
  /** What the code returned. */
  result: string;
  ok: boolean;
  tryId?: string;
}

export interface StagedChange {
  tryId: string;
  edits: LayoutEdit[];
  descriptions: { en: string; bn: string }[];
  targets: { id: string; ruleName: string; roomName: string; floorLabel?: string }[];
  verdictReason: string;
  before: CandidateVerdict['before'];
  after: NonNullable<CandidateVerdict['after']>;
}

export interface AgentRun {
  policy: 'gemini' | 'rules';
  steps: AgentStep[];
  staged: StagedChange[];
  stoppedBecause: string;
  baseAudit: ComplianceAudit;
  /** Audit with every staged change applied (what approval of all would give). */
  stagedAudit: ComplianceAudit;
  tries: number;
  acceptedTries: number;
}

const compactProblems = (audit: ComplianceAudit, project: BuildingProject) =>
  audit.violations.filter(isProblem).map((v) => ({
    id: v.id,
    rule: v.ruleId,
    floorIndex: v.floorIndex ?? 0,
    where: v.roomName,
    status: v.status,
    measured: v.blocked ? 'no route' : Number(v.measuredValue.toFixed(2)),
    limit: v.limitValue,
    unit: v.unit,
    hasFixedRuleFix: Boolean(fixSpecToEdits(v, project)),
  }));

/** Agent notes may only repeat numbers that the tools returned (or ids); otherwise the note is withheld. */
const guardNote = (t: unknown, sources: string[]) => {
  const s = typeof t === 'string' ? t.trim().slice(0, 300) : '';
  if (!s) return '';
  return checkNumbers(s, sources).ok ? s : '(note withheld: it contained a number the tools did not report)';
};

interface Ctx {
  base: BuildingProject;
  working: BuildingProject;
  audit: ComplianceAudit;
  staged: StagedChange[];
  stagedEdits: LayoutEdit[];
  tries: Map<string, { edits: LayoutEdit[]; targets: Violation[]; verdict: CandidateVerdict }>;
  tryCount: number;
  accepted: number;
  rejectStreak: number;
  /** Everything the tools returned so far: the only numbers the agent's notes may use. */
  toolOutputs: string[];
}

/** Executes one tool call. Pure code; this is where every number comes from. */
function execTool(ctx: Ctx, tool: string, args: Record<string, unknown>): { result: string; ok: boolean; tryId?: string; done?: string } {
  switch (tool) {
    case 'run_audit': {
      const problems = compactProblems(ctx.audit, ctx.working);
      return {
        ok: true,
        result: JSON.stringify({ fail: ctx.audit.failCount, warn: ctx.audit.warnCount, worstEscapeSec: Number(ctx.audit.worstEscapeSec.toFixed(1)), staged: ctx.staged.length, problems }),
      };
    }
    case 'get_floor': {
      const fi = Number(args.floorIndex ?? 0);
      const s = planSummaryForAi(ctx.working, ctx.audit, []);
      const floor = s.floors[fi];
      if (!floor) return { ok: false, result: `No floor ${fi}. Floors are 0..${s.floors.length - 1}.` };
      return { ok: true, result: JSON.stringify({ building: s.building, floor }) };
    }
    case 'try_edits': {
      const ids = Array.isArray(args.targetIds) ? args.targetIds.filter((x): x is string => typeof x === 'string') : [];
      const targets = ctx.audit.violations.filter((v) => isProblem(v) && ids.includes(v.id));
      if (targets.length === 0) return { ok: false, result: 'None of targetIds is a current finding. Call run_audit for the current ids.' };
      const edits: LayoutEdit[] = [];
      const refused: string[] = [];
      for (const raw of Array.isArray(args.edits) ? args.edits : []) {
        const n = normalizeEdit(raw, ctx.working);
        if (n.edit) edits.push(n.edit);
        else refused.push(n.error || 'invalid edit');
      }
      ctx.tryCount++;
      const tryId = `try-${ctx.tryCount}`;
      if (refused.length > 0) {
        ctx.rejectStreak++;
        return { ok: false, tryId, result: JSON.stringify({ tryId, accepted: false, reason: `Edit refused before the check: ${refused.join('; ')}` }) };
      }
      const verdict = verifyCandidate(ctx.working, ctx.audit, edits, targets, 'ai');
      ctx.tries.set(tryId, { edits, targets, verdict });
      if (verdict.accepted) {
        ctx.accepted++;
        ctx.rejectStreak = 0;
      } else ctx.rejectStreak++;
      return {
        ok: verdict.accepted,
        tryId,
        result: JSON.stringify({
          tryId,
          accepted: verdict.accepted,
          reason: verdict.reason,
          before: verdict.before,
          after: verdict.after,
          resolved: verdict.resolved.map((v) => v.id),
          alsoResolved: verdict.alsoResolved.map((v) => v.id),
          stillFailing: verdict.stillFailing.map((v) => v.id),
          introduced: verdict.introduced.map((v) => ({ rule: v.ruleId, where: v.roomName })),
        }),
      };
    }
    case 'stage': {
      const id = String(args.tryId || '');
      const t = ctx.tries.get(id);
      if (!t) return { ok: false, result: `Unknown tryId "${id}".` };
      if (!t.verdict.accepted || !t.verdict.project || !t.verdict.audit || !t.verdict.after)
        return { ok: false, result: `${id} was rejected by the re-check and cannot be staged.` };
      if (ctx.staged.some((s) => s.tryId === id)) return { ok: false, result: `${id} is already staged.` };
      ctx.staged.push({
        tryId: id,
        edits: t.edits,
        descriptions: t.edits.map((e) => describeEdit(e, ctx.working)),
        targets: t.targets.map((v) => ({ id: v.id, ruleName: v.ruleName, roomName: v.roomName, floorLabel: v.floorLabel })),
        verdictReason: t.verdict.reason,
        before: t.verdict.before,
        after: t.verdict.after,
      });
      ctx.stagedEdits.push(...t.edits);
      ctx.working = t.verdict.project;
      ctx.audit = t.verdict.audit;
      ctx.tries.clear(); // older tries were measured against the previous plan
      return { ok: true, result: `Staged ${id} for human approval. Working plan now has ${ctx.audit.failCount} fail / ${ctx.audit.warnCount} warn.` };
    }
    case 'finish':
      return { ok: true, result: 'Stopped. Staged changes go to the person for approval.', done: guardNote(args.summary, ctx.toolOutputs) || 'Agent finished.' };
  }
  return { ok: false, result: `Unknown tool "${tool}". Use run_audit, get_floor, try_edits, stage or finish.` };
}

export interface AgentOptions {
  maxSteps?: number;
  policy?: 'auto' | 'gemini' | 'rules';
  onStep?: (step: AgentStep, run: { staged: StagedChange[] }) => void;
  shouldStop?: () => boolean;
}

/** Runs the agent to completion (or step limit). Never changes `project`. */
export async function runFixAgent(project: BuildingProject, opts: AgentOptions = {}): Promise<AgentRun> {
  const maxSteps = opts.maxSteps ?? 30;
  const baseAudit = runBuildingAudit(project);
  const ctx: Ctx = {
    base: project,
    working: project,
    audit: baseAudit,
    staged: [],
    stagedEdits: [],
    tries: new Map(),
    tryCount: 0,
    accepted: 0,
    rejectStreak: 0,
    toolOutputs: [],
  };
  const steps: AgentStep[] = [];
  const push = (s: Omit<AgentStep, 'n'>) => {
    const step = { ...s, n: steps.length + 1 };
    steps.push(step);
    opts.onStep?.(step, { staged: ctx.staged });
    return step;
  };
  let stoppedBecause = '';

  const goal = `Building "${project.name}" (${project.occupancyClass}, ${project.floors.length} floor(s)). Work through the failing findings: propose edits with try_edits, stage the ones the engine accepts, then finish.`;

  let policy: 'gemini' | 'rules' = opts.policy === 'rules' ? 'rules' : 'gemini';
  if (policy === 'gemini') {
    const transcript: { role: 'agent' | 'tool'; content: string }[] = [];
    for (let i = 0; i < maxSteps; i++) {
      if (opts.shouldStop?.()) {
        stoppedBecause = 'Stopped by the person.';
        break;
      }
      const res = await postJson<{ source: string; step?: Record<string, unknown> }>('/api/ai/agent-step', { goal, transcript });
      if (!res || res.source !== 'gemini' || !res.step) {
        if (i === 0 && opts.policy !== 'gemini') {
          policy = 'rules'; // Gemini is off: fall back to the fixed policy below.
          break;
        }
        stoppedBecause = 'Layout search stopped; staged changes so far are kept.';
        break;
      }
      const step = res.step;
      const tool = String(step.tool || '');
      const args: Record<string, unknown> = { ...step };
      delete args.thought;
      delete args.tool;
      const out = execTool(ctx, tool, args);
      ctx.toolOutputs.push(out.result, JSON.stringify(args));
      push({ thought: guardNote(step.thought, ctx.toolOutputs), tool: (['run_audit', 'get_floor', 'try_edits', 'stage', 'finish'].includes(tool) ? tool : 'invalid') as AgentTool, args, result: out.result, ok: out.ok, tryId: out.tryId });
      transcript.push({ role: 'agent', content: JSON.stringify({ tool, ...args }) });
      transcript.push({ role: 'tool', content: out.result.slice(0, 12000) });
      if (out.done) {
        stoppedBecause = out.done;
        break;
      }
      if (ctx.rejectStreak >= 6) {
        stoppedBecause = 'Six proposals in a row were rejected by the re-check; stopped.';
        break;
      }
    }
    if (!stoppedBecause) stoppedBecause = `Step limit (${maxSteps}) reached.`;
  }

  if (policy === 'rules') {
    let out = execTool(ctx, 'run_audit', {});
    push({ thought: '', tool: 'run_audit', args: {}, result: out.result, ok: true });
    const seen = new Set<string>();
    for (let guard = 0; guard < maxSteps; guard++) {
      const next = ctx.audit.violations.find((v) => isProblem(v) && !seen.has(v.id) && fixSpecToEdits(v, ctx.working));
      if (!next) break;
      seen.add(next.id);
      const edits = fixSpecToEdits(next, ctx.working)!;
      out = execTool(ctx, 'try_edits', { targetIds: [next.id], edits });
      push({ thought: `Trying fix for: ${next.ruleName}.`, tool: 'try_edits', args: { targetIds: [next.id], edits }, result: out.result, ok: out.ok, tryId: out.tryId });
      if (out.ok && out.tryId) {
        const st = execTool(ctx, 'stage', { tryId: out.tryId });
        push({ thought: '', tool: 'stage', args: { tryId: out.tryId }, result: st.result, ok: st.ok });
      }
    }
    const fin = execTool(ctx, 'finish', { summary: 'Fixed-rule pass complete.' });
    push({ thought: '', tool: 'finish', args: {}, result: fin.result, ok: true });
    stoppedBecause = 'Standard fix pass complete.';
  }

  return {
    policy,
    steps,
    staged: ctx.staged,
    stoppedBecause,
    baseAudit,
    stagedAudit: ctx.audit,
    tries: ctx.tryCount,
    acceptedTries: ctx.accepted,
  };
}

/**
 * The approval gate. Applies only the approved staged changes, in their original order, to the
 * ORIGINAL plan and re-runs the audit. If an approved change depended on one that was not
 * approved and no longer applies, it is reported and skipped.
 */
export function applyApprovedChanges(
  project: BuildingProject,
  staged: StagedChange[],
  approvedTryIds: string[]
): { project: BuildingProject; audit: ComplianceAudit; skipped: { tryId: string; error: string }[]; appliedEdits: LayoutEdit[] } {
  let current = project;
  const skipped: { tryId: string; error: string }[] = [];
  const appliedEdits: LayoutEdit[] = [];
  for (const s of staged) {
    if (!approvedTryIds.includes(s.tryId)) continue;
    const r = applyLayoutEdits(current, s.edits, 'ai');
    if (r.error) {
      skipped.push({ tryId: s.tryId, error: r.error });
      continue;
    }
    current = r.project;
    appliedEdits.push(...s.edits);
  }
  return { project: current, audit: runBuildingAudit(current), skipped, appliedEdits };
}
