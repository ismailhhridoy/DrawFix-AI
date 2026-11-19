/**
 * Feature 1: Gemini proposes layout fixes; the rule engine re-measures each one.
 *
 * Gemini returns candidate edit lists. Each edit is validated (`normalizeEdit`), applied to a copy
 * and the full audit is re-run (`verifyCandidate`). Only candidates that pass the re-check are
 * offered to the person, and nothing is applied to the plan until the person approves it.
 */
import type { BuildingProject, ComplianceAudit, Violation } from '../types/plan';
import {
  describeEdit,
  normalizeEdit,
  planSummaryForAi,
  verifyCandidate,
  type CandidateVerdict,
  type LayoutEdit,
} from './layoutEdits';
import { postJson } from './aiApi';
import { checkNumbers } from './numberGuard';

export interface ProposedCandidate {
  /** Order Gemini gave it in (0 = Gemini's first choice). */
  rank: number;
  round: number;
  source: 'gemini' | 'rule';
  targetIds: string[];
  edits: LayoutEdit[];
  /** Edits Gemini sent that were refused before anything was applied, with the reason. */
  refused: { raw: unknown; error: string }[];
  rationaleEn: string;
  rationaleBn: string;
}

export interface VerifiedCandidate extends ProposedCandidate {
  verdict: CandidateVerdict;
  descriptions: { en: string; bn: string }[];
}

interface RawCandidate {
  targetIds?: unknown;
  edits?: unknown;
  rationaleEn?: unknown;
  rationaleBn?: unknown;
}

export interface RejectedAttempt {
  edits: LayoutEdit[];
  reason: string;
}

/** Asks Gemini for candidates. Returns [] when Gemini is off or fails (the app then offers the fixed fixes only). */
export async function requestAiLayoutCandidates(
  project: BuildingProject,
  audit: ComplianceAudit,
  targets: Violation[],
  opts: { previousAttempts?: RejectedAttempt[]; round?: number; maxCandidates?: number } = {}
): Promise<{ source: 'gemini' | 'none' | 'error'; candidates: ProposedCandidate[] }> {
  const res = await postJson<{ source: string; candidates?: RawCandidate[] }>('/api/ai/propose-layout-fixes', {
    summary: planSummaryForAi(project, audit, targets),
    previousAttempts: opts.previousAttempts || [],
    maxCandidates: opts.maxCandidates ?? 3,
  });
  if (!res) return { source: 'error', candidates: [] };
  if (res.source !== 'gemini') return { source: res.source === 'none' ? 'none' : 'error', candidates: [] };
  const known = new Set(targets.map((t) => t.id));
  const candidates = (res.candidates || []).map((c, i): ProposedCandidate => {
    const edits: LayoutEdit[] = [];
    const refused: { raw: unknown; error: string }[] = [];
    for (const raw of Array.isArray(c.edits) ? c.edits : []) {
      const n = normalizeEdit(raw, project);
      if (n.edit) edits.push(n.edit);
      else refused.push({ raw, error: n.error || 'invalid' });
    }
    const ids = (Array.isArray(c.targetIds) ? c.targetIds : []).filter((x): x is string => typeof x === 'string' && known.has(x));
    // The rationale is shown as Gemini's reason, never as a result; a number in it is not allowed.
    const clean = (t: unknown) => {
      const s = typeof t === 'string' ? t.trim().slice(0, 400) : '';
      return s && checkNumbers(s, []).ok ? s : '';
    };
    return {
      rank: i,
      round: opts.round ?? 1,
      source: 'gemini',
      targetIds: ids.length ? ids : targets.map((t) => t.id),
      edits,
      refused,
      rationaleEn: clean(c.rationaleEn),
      rationaleBn: clean(c.rationaleBn),
    };
  });
  return { source: 'gemini', candidates };
}

/** Re-measures each candidate with the full audit. */
export function verifyCandidates(
  project: BuildingProject,
  audit: ComplianceAudit,
  candidates: ProposedCandidate[]
): VerifiedCandidate[] {
  return candidates.map((c) => {
    const targets = audit.violations.filter((v) => c.targetIds.includes(v.id));
    const verdict =
      c.refused.length > 0 && c.edits.length === 0
        ? verifyCandidate(project, audit, [], targets)
        : verifyCandidate(project, audit, c.edits, targets, c.source === 'rule' ? 'rule' : 'ai');
    if (c.refused.length > 0 && verdict.accepted) {
      // Some edits were refused up front; the rest passed. Say so instead of hiding it.
      verdict.reason += ` (${c.refused.length} proposed edit(s) were refused before the check: ${c.refused[0].error}.)`;
    } else if (c.refused.length > 0 && c.edits.length === 0) {
      verdict.reason = `Refused before the check: ${c.refused[0].error}.`;
    }
    return { ...c, verdict, descriptions: c.edits.map((e) => describeEdit(e, project)) };
  });
}

/**
 * Full loop for a set of findings: ask, verify, and if nothing passed, ask once more with the
 * engine's reasons. Returns every candidate with its verdict (passing ones first).
 */
export async function proposeAndVerify(
  project: BuildingProject,
  audit: ComplianceAudit,
  targets: Violation[],
  opts: { rounds?: number; maxCandidates?: number } = {}
): Promise<{ source: 'gemini' | 'none' | 'error'; all: VerifiedCandidate[] }> {
  const all: VerifiedCandidate[] = [];
  const rejected: RejectedAttempt[] = [];
  let source: 'gemini' | 'none' | 'error' = 'none';
  for (let round = 1; round <= (opts.rounds ?? 2); round++) {
    const res = await requestAiLayoutCandidates(project, audit, targets, { previousAttempts: rejected, round, maxCandidates: opts.maxCandidates });
    source = res.source;
    if (res.source !== 'gemini') break;
    const verified = verifyCandidates(project, audit, res.candidates);
    all.push(...verified);
    if (verified.some((v) => v.verdict.accepted)) break;
    rejected.push(...verified.map((v) => ({ edits: v.edits, reason: v.verdict.reason })));
  }
  all.sort((a, b) => Number(b.verdict.accepted) - Number(a.verdict.accepted) || a.round - b.round || a.rank - b.rank);
  return { source, all };
}
