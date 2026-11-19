import type { ComplianceAudit, Violation } from '../types/plan';

/**
 * Compare two audits of the same building: an earlier version and a revised drawing.
 * This is plain matching on data the engine already produced. No AI, no new numbers.
 *
 * A finding is identified by rule + floor + room name. If an architect renames a room between
 * versions, the old finding shows as cleared and a new one appears. The panel says so.
 */

export interface FindingChange {
  before: Violation;
  after: Violation;
  /** 'better' = status improved or the measured value moved toward the limit; 'worse' = the reverse. */
  direction: 'better' | 'worse' | 'same';
}

export interface VersionComparison {
  cleared: Violation[];
  newlyFound: Violation[];
  stillOpen: FindingChange[];
  failBefore: number;
  failAfter: number;
  warnBefore: number;
  warnAfter: number;
  escapeSecBefore: number;
  escapeSecAfter: number;
}

const isOpen = (v: Violation) => v.status !== 'PASS';
const keyOf = (v: Violation) => `${v.ruleId}|${v.floorLabel ?? v.floorIndex ?? 0}|${v.roomName}`;
const statusRank = (v: Violation) => (v.status === 'FAIL' ? 2 : v.status === 'WARN' ? 1 : 0);

/** Distance past the limit (0 when inside it), so a smaller number is better. */
function overshoot(v: Violation): number {
  if (v.blocked) return Number.POSITIVE_INFINITY;
  if (v.comparator === '<=') return Math.max(0, v.measuredValue - v.limitValue);
  if (v.comparator === '>=') return Math.max(0, v.limitValue - v.measuredValue);
  return Math.abs(v.measuredValue - v.limitValue);
}

function direction(before: Violation, after: Violation): FindingChange['direction'] {
  const rankDiff = statusRank(after) - statusRank(before);
  if (rankDiff < 0) return 'better';
  if (rankDiff > 0) return 'worse';
  const o1 = overshoot(before);
  const o2 = overshoot(after);
  if (o2 < o1) return 'better';
  if (o2 > o1) return 'worse';
  return 'same';
}

export function compareVersions(previous: ComplianceAudit, revised: ComplianceAudit): VersionComparison {
  const prevOpen = previous.violations.filter(isOpen);
  const nextOpen = revised.violations.filter(isOpen);

  const nextByKey = new Map<string, Violation[]>();
  for (const v of nextOpen) {
    const k = keyOf(v);
    nextByKey.set(k, [...(nextByKey.get(k) ?? []), v]);
  }

  const cleared: Violation[] = [];
  const stillOpen: FindingChange[] = [];
  for (const before of prevOpen) {
    const pool = nextByKey.get(keyOf(before));
    const after = pool?.shift();
    if (after) stillOpen.push({ before, after, direction: direction(before, after) });
    else cleared.push(before);
  }
  const newlyFound = [...nextByKey.values()].flat();

  return {
    cleared,
    newlyFound,
    stillOpen,
    failBefore: previous.failCount,
    failAfter: revised.failCount,
    warnBefore: previous.warnCount,
    warnAfter: revised.warnCount,
    escapeSecBefore: previous.worstEscapeSec,
    escapeSecAfter: revised.worstEscapeSec,
  };
}
