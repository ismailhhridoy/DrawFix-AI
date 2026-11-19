/**
 * Layout changes as data: the shared language between whoever proposes a fix
 * (Gemini, the fixed rules, or a person) and the code that checks it.
 *
 * Design rule: AI proposes, code verifies, a person approves.
 * - A proposal is a list of `LayoutEdit`s. Nothing else from the proposer is trusted.
 * - `normalizeEdit` rejects edits that name unknown walls/doors/stairs or use values
 *   outside physical bounds, before anything is applied.
 * - `applyLayoutEdits` changes a copy of the parsed geometry. The DXF is never edited.
 * - `verifyCandidate` re-runs the full audit and accepts the proposal only if the
 *   targeted findings are gone and nothing new failed. Every number shown comes from that audit.
 */
import type {
  BuildingProject,
  ComplianceAudit,
  ParsedFloorPlan,
  Point2D,
  Violation,
  WallSegment,
} from '../types/plan';
import { runBuildingAudit, shiftWallChain } from './ruleEngine';
import { pointInPolygon, pointToSegmentDist } from './geometry';
import { toBnDigits } from '../i18n/digits';

export type LayoutEdit =
  | { kind: 'unlock_door'; floorIndex: number; doorId: string }
  | { kind: 'widen_door'; floorIndex: number; doorId: string; widthM: number }
  | { kind: 'move_wall'; floorIndex: number; wallId: string; dx: number; dy: number }
  | { kind: 'add_exit_door'; floorIndex: number; wallId: string; along: number; widthM: number }
  | { kind: 'move_door'; floorIndex: number; doorId: string; wallId: string; along: number }
  | { kind: 'add_stair'; x: number; y: number; widthM: number; depthM: number; label: string }
  | {
      kind: 'set_stair';
      floorIndex: number;
      stairId: string;
      headroomM?: number;
      handrailHeightM?: number;
      treadMm?: number;
      riserMm?: number;
    }
  | { kind: 'sync_dimension'; floorIndex: number; dimensionId: string };

export type EditKind = LayoutEdit['kind'];

export const EDIT_KINDS: EditKind[] = [
  'unlock_door',
  'widen_door',
  'move_wall',
  'add_exit_door',
  'move_door',
  'add_stair',
  'set_stair',
  'sync_dimension',
];

/** Physical bounds for proposed values. Outside these an edit is refused before it is applied. */
export const EDIT_BOUNDS = {
  doorWidthM: [0.8, 2.4] as const,
  wallShiftM: 3.0,
  stairSideM: [2.4, 6.0] as const,
  headroomM: [2.0, 3.0] as const,
  handrailM: [0.85, 1.1] as const,
  treadMm: [220, 350] as const,
  riserMm: [120, 200] as const,
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const inRange = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

function wallLen(w: WallSegment): number {
  return Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
}
function pointOnWall(w: WallSegment, along: number): Point2D {
  return { x: w.start.x + (w.end.x - w.start.x) * along, y: w.start.y + (w.end.y - w.start.y) * along };
}
function isHorizontal(w: WallSegment) {
  return Math.abs(w.start.y - w.end.y) < 0.05;
}
function isVertical(w: WallSegment) {
  return Math.abs(w.start.x - w.end.x) < 0.05;
}

function segIntersectsRect(a: Point2D, b: Point2D, minX: number, minY: number, maxX: number, maxY: number): boolean {
  // Liang–Barsky clip.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Turns an untrusted object (for example a Gemini reply) into a LayoutEdit, or explains why not.
 * Checks ids against the plan and values against EDIT_BOUNDS. Does not apply anything.
 */
export function normalizeEdit(raw: unknown, project: BuildingProject): { edit?: LayoutEdit; error?: string } {
  if (!raw || typeof raw !== 'object') return { error: 'not an object' };
  const r = raw as Record<string, unknown>;
  const kind = str(r.kind) as EditKind | null;
  if (!kind || !EDIT_KINDS.includes(kind)) return { error: `unknown kind "${String(r.kind)}"` };

  if (kind === 'add_stair') {
    const x = num(r.x);
    const y = num(r.y);
    const widthM = num(r.widthM);
    const depthM = num(r.depthM);
    if (x === null || y === null || widthM === null || depthM === null) return { error: 'add_stair needs x, y, widthM, depthM' };
    if (!inRange(widthM, EDIT_BOUNDS.stairSideM) || !inRange(depthM, EDIT_BOUNDS.stairSideM))
      return { error: `stair sides must be ${EDIT_BOUNDS.stairSideM[0]}–${EDIT_BOUNDS.stairSideM[1]} m` };
    const label = (str(r.label) || 'NEW-STAIR').replace(/[^\w\- ]/g, '').slice(0, 24) || 'NEW-STAIR';
    return { edit: { kind, x: round2(x), y: round2(y), widthM: round2(widthM), depthM: round2(depthM), label } };
  }

  const floorIndex = num(r.floorIndex);
  if (floorIndex === null || !Number.isInteger(floorIndex) || floorIndex < 0 || floorIndex >= project.floors.length)
    return { error: `floorIndex ${String(r.floorIndex)} is not a floor of this building` };
  const floor = project.floors[floorIndex];

  const needDoor = () => {
    const id = str(r.doorId);
    const door = id ? floor.doors.find((d) => d.id === id) : undefined;
    return door ? door.id : null;
  };
  const needWall = () => {
    const id = str(r.wallId);
    const wall = id ? floor.walls.find((w) => w.id === id) : undefined;
    return wall || null;
  };

  switch (kind) {
    case 'unlock_door': {
      const doorId = needDoor();
      if (!doorId) return { error: `door "${String(r.doorId)}" not on floor ${floorIndex}` };
      return { edit: { kind, floorIndex, doorId } };
    }
    case 'widen_door': {
      const doorId = needDoor();
      const widthM = num(r.widthM);
      if (!doorId) return { error: `door "${String(r.doorId)}" not on floor ${floorIndex}` };
      if (widthM === null || !inRange(widthM, EDIT_BOUNDS.doorWidthM)) return { error: 'door width out of range' };
      return { edit: { kind, floorIndex, doorId, widthM: round2(widthM) } };
    }
    case 'move_wall': {
      const wall = needWall();
      if (!wall) return { error: `wall "${String(r.wallId)}" not on floor ${floorIndex}` };
      if (wall.isExterior) return { error: 'outer walls are not moved' };
      const dx = num(r.dx) ?? 0;
      const dy = num(r.dy) ?? 0;
      if (isHorizontal(wall) && (Math.abs(dx) > 1e-9 || dy === 0)) return { error: 'a horizontal wall moves by dy only' };
      if (isVertical(wall) && (Math.abs(dy) > 1e-9 || dx === 0)) return { error: 'a vertical wall moves by dx only' };
      if (!isHorizontal(wall) && !isVertical(wall)) return { error: 'only straight horizontal or vertical walls can be moved' };
      if (Math.abs(dx) + Math.abs(dy) > EDIT_BOUNDS.wallShiftM) return { error: `wall moves are limited to ${EDIT_BOUNDS.wallShiftM} m` };
      return { edit: { kind, floorIndex, wallId: wall.id, dx: round2(dx), dy: round2(dy) } };
    }
    case 'add_exit_door':
    case 'move_door': {
      const wall = needWall();
      if (!wall) return { error: `wall "${String(r.wallId)}" not on floor ${floorIndex}` };
      const along = num(r.along);
      if (along === null || along < 0 || along > 1) return { error: 'along must be between 0 and 1' };
      if (kind === 'add_exit_door') {
        if (floorIndex !== 0) return { error: 'exit doors to the street are added on the ground floor only; add a stair for upper floors' };
        if (!wall.isExterior) return { error: 'an exit door must be in an outer wall' };
        const widthM = num(r.widthM) ?? 1.1;
        if (!inRange(widthM, EDIT_BOUNDS.doorWidthM)) return { error: 'door width out of range' };
        return { edit: { kind, floorIndex, wallId: wall.id, along: Math.round(along * 1000) / 1000, widthM: round2(widthM) } };
      }
      const doorId = needDoor();
      if (!doorId) return { error: `door "${String(r.doorId)}" not on floor ${floorIndex}` };
      return { edit: { kind, floorIndex, doorId, wallId: wall.id, along: Math.round(along * 1000) / 1000 } };
    }
    case 'set_stair': {
      const id = str(r.stairId);
      const stair = id ? floor.stairs.find((s) => s.id === id) : undefined;
      if (!stair) return { error: `stair "${String(r.stairId)}" not on floor ${floorIndex}` };
      const out: LayoutEdit = { kind, floorIndex, stairId: stair.id };
      const h = num(r.headroomM);
      const hr = num(r.handrailHeightM);
      const t = num(r.treadMm);
      const rs = num(r.riserMm);
      if (h !== null) { if (!inRange(h, EDIT_BOUNDS.headroomM)) return { error: 'headroom out of range' }; out.headroomM = round2(h); }
      if (hr !== null) { if (!inRange(hr, EDIT_BOUNDS.handrailM)) return { error: 'handrail out of range' }; out.handrailHeightM = round2(hr); }
      if (t !== null) { if (!inRange(t, EDIT_BOUNDS.treadMm)) return { error: 'tread out of range' }; out.treadMm = Math.round(t); }
      if (rs !== null) { if (!inRange(rs, EDIT_BOUNDS.riserMm)) return { error: 'riser out of range' }; out.riserMm = Math.round(rs); }
      if (h === null && hr === null && t === null && rs === null) return { error: 'set_stair changes nothing' };
      return { edit: out };
    }
    case 'sync_dimension': {
      const id = str(r.dimensionId);
      const dim = id ? floor.dimensions.find((d) => d.id === id) : undefined;
      if (!dim) return { error: `dimension "${String(r.dimensionId)}" not on floor ${floorIndex}` };
      return { edit: { kind, floorIndex, dimensionId: dim.id } };
    }
  }
  return { error: 'unhandled kind' };
}

/** Splits `wall` to leave a gap of `widthM` centred at `along`. Returns the door centre, or an error. */
function cutGap(floor: ParsedFloorPlan, wall: WallSegment, along: number, widthM: number): { center?: Point2D; error?: string } {
  const len = wallLen(wall);
  const half = widthM / 2 / len;
  if (along - half < 0.3 / len || along + half > 1 - 0.3 / len)
    return { error: `the ${widthM.toFixed(2)} m opening does not fit on wall ${wall.id} at that position` };
  const center = pointOnWall(wall, along);
  const nearDoor = floor.doors.find((d) => Math.hypot(d.position.x - center.x, d.position.y - center.y) < widthM / 2 + 0.6);
  if (nearDoor) return { error: `too close to existing door ${nearDoor.id}` };
  const a = pointOnWall(wall, along - half);
  const b = pointOnWall(wall, along + half);
  const tail: WallSegment = { ...wall, id: `${wall.id}-b`, start: b, end: { ...wall.end } };
  wall.end = a;
  floor.walls.push(tail);
  floor.openings = [...(floor.openings || []), { id: `${wall.id}-gap`, a, b, center, widthM }];
  return { center };
}

/** Closes the wall gap a door sat in (used when the door is moved elsewhere). */
export function closeGapAt(floor: ParsedFloorPlan, pos: Point2D): boolean {
  const ops = floor.openings || [];
  const idx = ops.findIndex((o) => Math.hypot(o.center.x - pos.x, o.center.y - pos.y) < 0.6);
  if (idx < 0) return false;
  const o = ops[idx];
  const host = floor.walls.reduce<WallSegment | null>((best, w) => {
    const d = Math.min(pointToSegmentDist(o.a, w.start, w.end), pointToSegmentDist(o.b, w.start, w.end));
    return !best || d < Math.min(pointToSegmentDist(o.a, best.start, best.end), pointToSegmentDist(o.b, best.start, best.end)) ? w : best;
  }, null);
  floor.walls.push({
    id: `${o.id}-closed`,
    start: { ...o.a },
    end: { ...o.b },
    thickness: host?.thickness ?? 0.15,
    layer: host?.layer ?? 'A-WALL',
    isExterior: host?.isExterior,
  });
  floor.openings = ops.filter((_, i) => i !== idx);
  return true;
}

function recomputeRooms(floor: ParsedFloorPlan) {
  for (const room of floor.rooms) {
    const poly = room.polygon;
    if (poly.length < 3) continue;
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const cross = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
      a += cross;
      cx += (poly[j].x + poly[i].x) * cross;
      cy += (poly[j].y + poly[i].y) * cross;
    }
    if (Math.abs(a) < 1e-9) continue;
    const area = Math.abs(a / 2);
    const c = { x: cx / (3 * a), y: cy / (3 * a) };
    // Keep the original start point if the new centroid falls outside an L-shaped room.
    if (pointInPolygon(c, poly)) room.centroid = { x: round2(c.x), y: round2(c.y) };
    room.areaSqM = round2(area);
  }
}

/**
 * Applies edits to a deep copy of the project. Each edit is applied in order; the first one
 * that cannot be applied stops the run and is reported. The input project is not changed.
 */
export function applyLayoutEdits(
  project: BuildingProject,
  edits: LayoutEdit[],
  proposedBy: 'ai' | 'rule' = 'ai'
): { project: BuildingProject; error?: string; failedIndex?: number } {
  const out: BuildingProject = JSON.parse(JSON.stringify(project));
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i];
    const fail = (error: string) => ({ project: out, error, failedIndex: i });
    if (e.kind === 'add_stair') {
      const minX = e.x - e.widthM / 2;
      const maxX = e.x + e.widthM / 2;
      const minY = e.y - e.depthM / 2;
      const maxY = e.y + e.depthM / 2;
      for (const fl of out.floors) {
        const b = fl.bounds;
        if (minX < b.minX + 0.3 || maxX > b.maxX - 0.3 || minY < b.minY + 0.3 || maxY > b.maxY - 0.3)
          return fail(`the stair falls outside ${fl.floorLabel || 'a floor'}`);
        const hit = fl.walls.find((w) => segIntersectsRect(w.start, w.end, minX + 0.05, minY + 0.05, maxX - 0.05, maxY - 0.05));
        if (hit) return fail(`the stair would cut wall ${hit.id} on ${fl.floorLabel || 'a floor'}`);
        const clash = fl.stairs.find((s) => Math.hypot(s.centroid.x - e.x, s.centroid.y - e.y) < 3);
        if (clash) return fail(`too close to existing stair ${clash.label}`);
      }
      out.floors.forEach((fl, fi) => {
        fl.stairs.push({
          id: `${fl.id || `f${fi}`}-new-stair-${fl.stairs.length + 1}`,
          polygon: [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ],
          centroid: { x: e.x, y: e.y },
          label: e.label,
          clearWidthM: round2(Math.min(e.widthM, e.depthM) / 2),
          headroomM: 2.2,
          handrailHeightM: 0.92,
          riserMm: 170,
          treadMm: 260,
          stated: { width: false, headroom: false, handrail: false, step: false },
          proposedBy,
        });
      });
      continue;
    }

    const floor = out.floors[e.floorIndex];
    if (!floor) return fail(`no floor ${e.floorIndex}`);
    switch (e.kind) {
      case 'unlock_door':
      case 'widen_door': {
        const door = floor.doors.find((d) => d.id === e.doorId);
        if (!door) return fail(`door ${e.doorId} not found`);
        if (e.kind === 'unlock_door') {
          if (!door.isLocked) return fail(`door ${door.blockName} is not locked`);
          door.isLocked = false;
          door.blockName = door.blockName.replace(/LOCKED|BLOCKED/gi, 'OPEN');
        } else {
          if (e.widthM <= door.widthM) return fail(`door ${door.blockName} is already ${door.widthM.toFixed(2)} m`);
          door.widthM = e.widthM;
        }
        door.proposedBy = proposedBy;
        break;
      }
      case 'move_wall': {
        if (!shiftWallChain(floor, e.wallId, e.dx, e.dy)) return fail(`wall ${e.wallId} not found`);
        recomputeRooms(floor);
        break;
      }
      case 'add_exit_door': {
        const wall = floor.walls.find((w) => w.id === e.wallId);
        if (!wall) return fail(`wall ${e.wallId} not found`);
        const cut = cutGap(floor, wall, e.along, e.widthM);
        if (!cut.center) return fail(cut.error || 'cannot cut the opening');
        floor.doors.push({
          id: `${floor.id || 'f'}-new-exit-${floor.doors.length + 1}`,
          position: { x: round2(cut.center.x), y: round2(cut.center.y) },
          widthM: e.widthM,
          rotationDeg: isHorizontal(wall) ? 0 : 90,
          layer: 'A-DOOR',
          blockName: `NEW_EXIT_${Math.round(e.widthM * 1000)}`,
          isExit: true,
          isLocked: false,
          exitSource: 'manual',
          widthSource: 'wall-gap',
          onExterior: true,
          proposedBy,
        });
        break;
      }
      case 'move_door': {
        const door = floor.doors.find((d) => d.id === e.doorId);
        const wall = floor.walls.find((w) => w.id === e.wallId);
        if (!door || !wall) return fail('door or wall not found');
        if (door.isExit && !wall.isExterior) return fail('an exit door must stay in an outer wall');
        const old = { ...door.position };
        if (!closeGapAt(floor, old)) return fail(`cannot find the wall opening of ${door.blockName} to close it`);
        const cut = cutGap(floor, wall, e.along, door.widthM);
        if (!cut.center) return fail(cut.error || 'cannot cut the opening');
        door.position = { x: round2(cut.center.x), y: round2(cut.center.y) };
        door.rotationDeg = isHorizontal(wall) ? 0 : 90;
        door.proposedBy = proposedBy;
        break;
      }
      case 'set_stair': {
        const stair = floor.stairs.find((s) => s.id === e.stairId);
        if (!stair) return fail(`stair ${e.stairId} not found`);
        if (e.headroomM !== undefined) stair.headroomM = e.headroomM;
        if (e.handrailHeightM !== undefined) stair.handrailHeightM = e.handrailHeightM;
        if (e.treadMm !== undefined) stair.treadMm = e.treadMm;
        if (e.riserMm !== undefined) stair.riserMm = e.riserMm;
        break;
      }
      case 'sync_dimension': {
        const dim = floor.dimensions.find((d) => d.id === e.dimensionId);
        if (!dim) return fail(`dimension ${e.dimensionId} not found`);
        dim.overrideText = `${dim.measuredValueM.toFixed(2)}m`;
        dim.parsedOverrideM = dim.measuredValueM;
        dim.isStaleOverride = false;
        break;
      }
    }
  }
  return { project: out };
}

/** Plain-language summary of an edit, built by code from the edit's own values. */
export function describeEdit(e: LayoutEdit, project: BuildingProject): { en: string; bn: string } {
  const label = (fi: number) => project.floors[fi]?.floorLabel || (fi === 0 ? 'GF' : `L${fi + 1}`);
  const doorName = (fi: number, id: string) => project.floors[fi]?.doors.find((d) => d.id === id)?.blockName || id;
  const n = (v: number, d = 2) => toBnDigits(v.toFixed(d));
  switch (e.kind) {
    case 'unlock_door':
      return { en: `[${label(e.floorIndex)}] Unlock "${doorName(e.floorIndex, e.doorId)}"`, bn: `[${label(e.floorIndex)}] "${doorName(e.floorIndex, e.doorId)}" তালামুক্ত করুন` };
    case 'widen_door':
      return {
        en: `[${label(e.floorIndex)}] Widen "${doorName(e.floorIndex, e.doorId)}" to ${e.widthM.toFixed(2)} m`,
        bn: `[${label(e.floorIndex)}] "${doorName(e.floorIndex, e.doorId)}" ${n(e.widthM)} মিটার চওড়া করুন`,
      };
    case 'move_wall': {
      const d = Math.abs(e.dx) + Math.abs(e.dy);
      return { en: `[${label(e.floorIndex)}] Move wall ${e.wallId} by ${d.toFixed(2)} m`, bn: `[${label(e.floorIndex)}] দেয়াল ${e.wallId} ${n(d)} মিটার সরান` };
    }
    case 'add_exit_door':
      return {
        en: `[${label(e.floorIndex)}] Add a ${e.widthM.toFixed(2)} m exit door in outer wall ${e.wallId}`,
        bn: `[${label(e.floorIndex)}] বাইরের দেয়াল ${e.wallId}-এ ${n(e.widthM)} মিটার বহির্গমন দরজা যোগ করুন`,
      };
    case 'move_door':
      return {
        en: `[${label(e.floorIndex)}] Move "${doorName(e.floorIndex, e.doorId)}" to wall ${e.wallId}`,
        bn: `[${label(e.floorIndex)}] "${doorName(e.floorIndex, e.doorId)}" দেয়াল ${e.wallId}-এ সরান`,
      };
    case 'add_stair': {
      const host = project.floors[0]?.rooms.find((r) => pointInPolygon({ x: e.x, y: e.y }, r.polygon));
      const where = host ? ` in "${host.originalLabel}"` : '';
      const whereBn = host ? ` "${host.originalLabel}"-এ` : '';
      return {
        en: `[All floors] Add stair core "${e.label}" (${e.widthM.toFixed(1)} x ${e.depthM.toFixed(1)} m)${where}, taking about ${(e.widthM * e.depthM).toFixed(1)} m² per floor`,
        bn: `[সব তলা]${whereBn} নতুন সিঁড়ি "${e.label}" (${n(e.widthM, 1)} x ${n(e.depthM, 1)} মিটার) যোগ করুন, প্রতি তলায় প্রায় ${n(e.widthM * e.depthM, 1)} বর্গমিটার লাগবে`,
      };
    }
    case 'set_stair': {
      const parts: string[] = [];
      const partsBn: string[] = [];
      if (e.headroomM !== undefined) { parts.push(`headroom ${e.headroomM.toFixed(2)} m`); partsBn.push(`মাথার উপরের ফাঁকা ${n(e.headroomM)} মিটার`); }
      if (e.handrailHeightM !== undefined) { parts.push(`handrail ${e.handrailHeightM.toFixed(2)} m`); partsBn.push(`হাতল ${n(e.handrailHeightM)} মিটার`); }
      if (e.treadMm !== undefined) { parts.push(`tread ${e.treadMm} mm`); partsBn.push(`ধাপের গভীরতা ${toBnDigits(String(e.treadMm))} মিমি`); }
      if (e.riserMm !== undefined) { parts.push(`riser ${e.riserMm} mm`); partsBn.push(`ধাপের উচ্চতা ${toBnDigits(String(e.riserMm))} মিমি`); }
      return { en: `[${label(e.floorIndex)}] Stair ${e.stairId}: ${parts.join(', ')}`, bn: `[${label(e.floorIndex)}] সিঁড়ি ${e.stairId}: ${partsBn.join(', ')}` };
    }
    case 'sync_dimension':
      return { en: `[${label(e.floorIndex)}] Correct dimension text ${e.dimensionId} to the drawn length`, bn: `[${label(e.floorIndex)}] মাপের লেখা ${e.dimensionId} আঁকা দৈর্ঘ্যের সাথে মিলান` };
  }
}

/** The existing hand-written fix for a finding, expressed as edits (null when there is none). */
export function fixSpecToEdits(v: Violation, project: BuildingProject): LayoutEdit[] | null {
  const fx = v.fixSpec;
  if (!fx) return null;
  const fi = fx.floorIndex ?? v.floorIndex ?? 0;
  switch (fx.action) {
    case 'unlock_exit': {
      const door = project.floors[fi]?.doors.find((d) => d.id === fx.targetId);
      const out: LayoutEdit[] = [{ kind: 'unlock_door', floorIndex: fi, doorId: fx.targetId }];
      if (door && door.widthM < (fx.deltaAfterM ?? 1.1)) out.push({ kind: 'widen_door', floorIndex: fi, doorId: fx.targetId, widthM: fx.deltaAfterM ?? 1.1 });
      return out;
    }
    case 'widen_door':
      return [{ kind: 'widen_door', floorIndex: fi, doorId: fx.targetId, widthM: fx.deltaAfterM ?? 1.1 }];
    case 'widen_passage':
      return fx.wallShift ? [{ kind: 'move_wall', floorIndex: fi, wallId: fx.wallShift.wallId, dx: fx.wallShift.dx, dy: fx.wallShift.dy }] : null;
    case 'adjust_stair': {
      const e: LayoutEdit = { kind: 'set_stair', floorIndex: fi, stairId: fx.targetId };
      if (v.ruleId === 'bnbc_1.13.5_stair_headroom') e.headroomM = 2.25;
      if (v.ruleId === 'bnbc_1.13.5_stair_handrail') e.handrailHeightM = 0.95;
      if (v.ruleId === 'bnbc_1.13.5_stair_proportion' && fx.deltaAfterM) e.treadMm = Math.round(fx.deltaAfterM * 1000);
      return [e];
    }
    case 'sync_dimension':
      return [{ kind: 'sync_dimension', floorIndex: fi, dimensionId: fx.targetId }];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function isProblem(v: Violation) {
  return v.status === 'FAIL' || v.status === 'WARN';
}

/** Same finding before and after a change: same rule, floor and room/element, within 2.5 m. */
export function sameFinding(a: Violation, b: Violation): boolean {
  if (a.ruleId !== b.ruleId || (a.floorIndex ?? 0) !== (b.floorIndex ?? 0)) return false;
  if (a.roomId || b.roomId) return a.roomId === b.roomId;
  if (a.roomName !== b.roomName && !a.ruleId.includes('passage') && !a.ruleId.includes('dimension')) return false;
  return Math.hypot(a.location.x - b.location.x, a.location.y - b.location.y) < 2.5;
}

export interface CandidateVerdict {
  accepted: boolean;
  /** Plain reason, always from code. */
  reason: string;
  applyError?: string;
  /** Target findings that are gone after the change. */
  resolved: Violation[];
  /** Target findings still present after the change. */
  stillFailing: Violation[];
  /** Other findings that also went away. */
  alsoResolved: Violation[];
  /** Findings that appear only after the change (regressions). */
  introduced: Violation[];
  before: { fail: number; warn: number; worstEscapeSec: number; trapped: number };
  after?: { fail: number; warn: number; worstEscapeSec: number; trapped: number };
  project?: BuildingProject;
  audit?: ComplianceAudit;
}

const stats = (a: ComplianceAudit) => ({
  fail: a.failCount,
  warn: a.warnCount,
  worstEscapeSec: Number(a.worstEscapeSec.toFixed(1)),
  trapped: a.trappedRoomCount,
});

/**
 * Applies a candidate to a copy, re-runs the whole audit and decides.
 * Accepted only if: it applies cleanly, every target finding is gone, nothing new fails or warns,
 * and no room becomes trapped.
 */
export function verifyCandidate(
  project: BuildingProject,
  baseAudit: ComplianceAudit,
  edits: LayoutEdit[],
  targets: Violation[],
  proposedBy: 'ai' | 'rule' = 'ai'
): CandidateVerdict {
  const before = stats(baseAudit);
  const empty = { resolved: [], stillFailing: targets, alsoResolved: [], introduced: [], before };
  if (edits.length === 0) return { accepted: false, reason: 'No usable change was proposed.', ...empty };
  const applied = applyLayoutEdits(project, edits, proposedBy);
  if (applied.error) {
    return { accepted: false, reason: `Could not apply change ${(applied.failedIndex ?? 0) + 1}: ${applied.error}.`, applyError: applied.error, ...empty };
  }
  const audit = runBuildingAudit(applied.project);
  const afterProblems = audit.violations.filter(isProblem);
  const beforeProblems = baseAudit.violations.filter(isProblem);
  const stillFailing = targets.filter((t) => afterProblems.some((v) => sameFinding(t, v)));
  const resolved = targets.filter((t) => !stillFailing.includes(t));
  const alsoResolved = beforeProblems.filter((b) => !targets.includes(b) && !afterProblems.some((v) => sameFinding(b, v)));
  const introduced = afterProblems.filter((v) => !beforeProblems.some((b) => sameFinding(b, v)));
  const after = stats(audit);

  let reason: string;
  let accepted = false;
  if (introduced.length > 0) {
    reason = `Re-check found ${introduced.length} new problem(s): ${introduced.slice(0, 3).map((v) => `${v.ruleName} (${v.roomName})`).join('; ')}.`;
  } else if (stillFailing.length > 0) {
    reason = `Re-check: ${stillFailing.length} of ${targets.length} target finding(s) still fail.`;
  } else if (after.trapped > before.trapped) {
    reason = 'Re-check: more rooms have no way out than before.';
  } else {
    accepted = true;
    reason = `Re-check passed: ${resolved.length} target finding(s) resolved${alsoResolved.length ? `, ${alsoResolved.length} other(s) also cleared` : ''}, nothing new failed.`;
  }
  return { accepted, reason, resolved, stillFailing, alsoResolved, introduced, before, after, project: applied.project, audit };
}

// ---------------------------------------------------------------------------
// What the proposer sees
// ---------------------------------------------------------------------------

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = round2;

/** Compact, id-bearing description of the plan and the findings to fix (sent to Gemini). */
export function planSummaryForAi(project: BuildingProject, audit: ComplianceAudit, targets: Violation[]) {
  return {
    building: { name: project.name, occupancy: project.occupancyClass, floors: project.floors.length, sprinklered: Boolean(project.siteContext?.sprinklered) },
    floors: project.floors.map((f, fi) => ({
      floorIndex: fi,
      label: f.floorLabel || (fi === 0 ? 'GF' : `L${fi + 1}`),
      bounds: { minX: r2(f.bounds.minX), minY: r2(f.bounds.minY), maxX: r2(f.bounds.maxX), maxY: r2(f.bounds.maxY) },
      walls: f.walls.map((w) => [w.id, r2(w.start.x), r2(w.start.y), r2(w.end.x), r2(w.end.y), w.isExterior ? 'outer' : 'inner']),
      doors: f.doors.map((d) => ({ id: d.id, name: d.blockName, x: r2(d.position.x), y: r2(d.position.y), widthM: r2(d.widthM), exit: d.isExit, locked: d.isLocked })),
      stairs: f.stairs.map((s) => ({ id: s.id, label: s.label, x: r2(s.centroid.x), y: r2(s.centroid.y), headroomM: s.stated?.headroom ? s.headroomM : null, handrailM: s.stated?.handrail ? s.handrailHeightM : null })),
      rooms: f.rooms.map((rm) => {
        const p = audit.escapePaths[rm.id];
        return { id: rm.id, label: rm.originalLabel, type: rm.taxonomy, x: r1(rm.centroid.x), y: r1(rm.centroid.y), areaM2: r1(rm.areaSqM), escapeM: p && !p.blocked ? r1(p.floorDistanceM ?? p.distanceM) : null, via: p?.viaStairLabel || p?.targetExitName || null };
      }),
      dimensions: f.dimensions.filter((d) => d.isStaleOverride).map((d) => ({ id: d.id, text: d.overrideText, drawnM: r2(d.measuredValueM) })),
    })),
    findingsToFix: targets.map((v) => ({
      id: v.id,
      rule: v.ruleId,
      name: v.ruleName,
      floorIndex: v.floorIndex ?? 0,
      where: v.roomName,
      x: r2(v.location.x),
      y: r2(v.location.y),
      measured: v.blocked ? 'no route' : r2(v.measuredValue),
      limit: v.limitValue,
      unit: v.unit,
      text: v.description,
    })),
  };
}
