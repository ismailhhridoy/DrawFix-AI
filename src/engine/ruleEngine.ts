import type {
  BuildingProject,
  ComplianceAudit,
  EscapePathResult,
  FloorAuditSummary,
  ParsedFloorPlan,
  Point2D,
  RemediationDelta,
  RoomEntity,
  Violation,
  ZoningAndCapacityMetrics,
} from '../types/plan';
import {
  buildNavGrid,
  computeMultiFloorRoomEscapePath,
  computePathBetweenPoints,
  detectNarrowPassages,
  findMatchingLowerStair,
  type NavGrid,
} from './pathfinding';
import { pointToSegmentDist } from './geometry';
import { ruleDef } from './rules';
import { toBnDigits as bn } from '../i18n/digits';

/** Reference distance for cabins, read in BNBC 2012 Part 3 Sec 1.13.8.2. */
export const CABIN_TRAVEL_LIMIT_M = 16.0;
/** Screening values for other rooms. Not verified against BNBC Part 4. */
export const SCREEN_TRAVEL_LIMIT_M = 16.0;
export const SCREEN_TRAVEL_LIMIT_SPRINKLERED_M = 22.5;
export const MIN_PASSAGE_WIDTH_M = 0.75;
export const SCREEN_EXIT_DOOR_WIDTH_M = 0.9;

/** Assumed occupant-load factors (m² per person). Screening values only. */
export function computeRoomOccupantLoad(room: RoomEntity): number {
  if (room.areaSqM <= 0) return 0;
  switch (room.taxonomy) {
    case 'workfloor':
      return Math.max(1, Math.round(room.areaSqM / 2.8));
    case 'lobby':
      return Math.max(1, Math.round(room.areaSqM / 1.4));
    case 'cabin':
      return Math.max(1, Math.round(room.areaSqM / 9.3));
    case 'bedroom':
    case 'habitable':
      return Math.max(1, Math.round(room.areaSqM / 18.6));
    case 'utility':
      return Math.max(1, Math.round(room.areaSqM / 28.0));
    default:
      return 0;
  }
}

function countWindowsNearRoom(room: RoomEntity, floor: ParsedFloorPlan): number {
  if (room.polygon.length < 3 || floor.windows.length === 0) return 0;
  let count = 0;
  for (const win of floor.windows) {
    let minEdgeDist = Infinity;
    for (let i = 0; i < room.polygon.length; i++) {
      const a = room.polygon[i];
      const b = room.polygon[(i + 1) % room.polygon.length];
      minEdgeDist = Math.min(minEdgeDist, pointToSegmentDist(win.position, a, b));
    }
    if (minEdgeDist <= 0.6) count++;
  }
  return count;
}

function lookupMaxAllowedFar(roadWidthM: number, occupancyClass: BuildingProject['occupancyClass']): number {
  const base =
    roadWidthM < 6.0 ? 2.5 : roadWidthM < 9.0 ? 3.0 : roadWidthM < 12.0 ? 3.25 : roadWidthM < 18.0 ? 3.5 : 4.25;
  return occupancyClass === 'industrial_rmg' ? Math.min(base, 3.5) : base;
}

function lookupMaxAllowedMgc(plotAreaSqM: number, occupancyClass: BuildingProject['occupancyClass']): number {
  if (occupancyClass === 'industrial_rmg') return 60;
  return plotAreaSqM <= 335 ? 62.5 : 60;
}

type NotChecked = NonNullable<ComplianceAudit['notChecked']>;

function floorAreaSqM(fl: ParsedFloorPlan): number {
  const sum = fl.rooms.filter((r) => r.taxonomy !== 'exit').reduce((s, r) => s + r.areaSqM, 0);
  return sum > 10 ? sum : fl.bounds.widthM * fl.bounds.heightM;
}

function isEgressDoor(d: ParsedFloorPlan['doors'][number]): boolean {
  return d.isExit || (d.isLocked && /STAIR|EXIT|FIRE|EGRESS/.test(d.blockName.toUpperCase()));
}

/** Fills citation, rule name and trust level from the registry so every finding states its basis. */
function stamp(v: Violation): Violation {
  const def = ruleDef(v.ruleId);
  v.ruleName = def.name;
  v.citation = def.citation;
  v.basis = def.basis;
  v.basisNote = def.note;
  return v;
}

/**
 * Runs every check on every floor.
 *
 * Ground floor: walking route to an unlocked exit. Upper floors: route to a
 * stair, stair continuity down to ground, then the ground-floor route to the
 * street. A single uploaded floor with stairs but no exits is measured to its
 * stairs. Nothing is reported for data the drawing does not contain; those
 * items are listed in `notChecked`.
 */
export function runBuildingAudit(project: BuildingProject): ComplianceAudit {
  const sprinklered = Boolean(project.siteContext?.sprinklered);
  const screenLimitM = sprinklered ? SCREEN_TRAVEL_LIMIT_SPRINKLERED_M : SCREEN_TRAVEL_LIMIT_M;
  const notChecked: NotChecked = [];
  const violations: Violation[] = [];
  const escapePaths: Record<string, EscapePathResult> = {};
  const floorSummaries: FloorAuditSummary[] = [];

  if (project.floors.length === 0) {
    return {
      violations,
      passedCount: 0,
      failCount: 0,
      warnCount: 0,
      escapePaths,
      worstEscapeSec: 0,
      trappedRoomCount: 0,
      floorSummaries,
      notChecked,
    };
  }

  const grids: NavGrid[] = project.floors.map((f) => buildNavGrid(f));
  const groundFloor = project.floors[0];
  const groundUnlockedExits = groundFloor.doors
    .filter((d) => d.isExit && !d.isLocked)
    .map((d) => ({ id: d.id, name: d.blockName, position: d.position }));

  let totalPassed = 0;
  let buildingWorstSec = 0;
  let totalTrapped = 0;

  for (let f = 0; f < project.floors.length; f++) {
    const floor = project.floors[f];
    const floorLabel = floor.floorLabel || (f === 0 ? 'GF' : `L${f + 1}`);
    const floorName = floor.floorName || (f === 0 ? 'Ground Floor' : `Level ${f + 1}`);
    const fv: Violation[] = [];
    let floorPassed = 0;
    let floorWorstSec = 0;
    let floorTrapped = 0;
    const base = { floorIndex: f, floorLabel, citation: '', ruleName: '' };

    // ---- 1. Exit and stair doors ------------------------------------------
    const egressDoors = floor.doors.filter((d) => isEgressDoor(d));
    const unlockedFloorExits = floor.doors.filter((d) => d.isExit && !d.isLocked);

    for (const door of egressDoors) {
      if (door.isLocked) {
        fv.push({
          ...base,
          id: `viol-f${f}-locked-${door.id}`,
          ruleId: 'bnbc_p4_exit_unobstructed',
          category: 'exit_obstruction',
          roomId: null,
          roomName: door.blockName,
          measuredValue: 0,
          limitValue: 1,
          unit: 'open exit',
          comparator: '>=',
          status: 'FAIL',
          severity: 'critical',
          location: door.position,
          description: `On ${floorLabel}, exit door "${door.blockName}" is marked locked or blocked in the drawing, so it gives no escape width.`,
          fixSpec: {
            id: `fix-f${f}-unlock-${door.id}`,
            targetType: 'door',
            targetId: door.id,
            floorIndex: f,
            floorLabel,
            action: 'unlock_exit',
            summary: `[${floorLabel}] Unlock "${door.blockName}" and make the clear opening 1.10 m`,
            summaryBn: `[${floorLabel}] "${door.blockName}" তালামুক্ত করুন এবং খোলা অংশ ${bn(1.1, 2)} মিটার করুন`,
            deltaBeforeM: 0,
            deltaAfterM: 1.1,
          },
        });
      } else if (door.widthM < SCREEN_EXIT_DOOR_WIDTH_M) {
        fv.push({
          ...base,
          id: `viol-f${f}-exitwidth-${door.id}`,
          ruleId: 'bnbc_p4_exit_door_width',
          category: 'passage_width',
          roomId: null,
          roomName: door.blockName,
          measuredValue: door.widthM,
          limitValue: SCREEN_EXIT_DOOR_WIDTH_M,
          unit: 'm',
          comparator: '>=',
          status: 'FAIL',
          severity: 'high',
          location: door.position,
          description: `On ${floorLabel}, exit door "${door.blockName}" has a ${door.widthM.toFixed(2)} m clear opening (${door.widthSource === 'wall-gap' ? 'measured from the wall gap' : 'taken from the block name'}), below the 0.90 m screening minimum.`,
          fixSpec: {
            id: `fix-f${f}-widen-door-${door.id}`,
            targetType: 'door',
            targetId: door.id,
            floorIndex: f,
            floorLabel,
            action: 'widen_door',
            summary: `[${floorLabel}] Widen "${door.blockName}" from ${door.widthM.toFixed(2)} m to 1.10 m`,
            summaryBn: `[${floorLabel}] "${door.blockName}" দরজা ${bn(door.widthM, 2)} মিটার থেকে ${bn(1.1, 2)} মিটার চওড়া করুন`,
            deltaBeforeM: door.widthM,
            deltaAfterM: 1.1,
          },
        });
      } else {
        floorPassed++;
      }
    }

    // ---- 2. Can exits be identified at all? ---------------------------------
    const hasAnyExit = floor.doors.some((d) => d.isExit);
    const usesStairsAsTargets = f > 0 || (!hasAnyExit && floor.stairs.length > 0);
    const canMeasureTravel = hasAnyExit || usesStairsAsTargets;

    if (!canMeasureTravel) {
      fv.push({
        ...base,
        id: `viol-f${f}-exits-unidentified`,
        ruleId: 'input_exits_unidentified',
        category: 'input_required',
        roomId: null,
        roomName: `${floorLabel} exits`,
        measuredValue: 0,
        limitValue: 1,
        unit: 'identified exit',
        comparator: '>=',
        status: 'WARN',
        severity: 'high',
        location: { x: floor.bounds.minX + floor.bounds.widthM / 2, y: floor.bounds.minY + floor.bounds.heightM / 2 },
        description: `No exit door or stair could be identified on ${floorLabel}. Mark the exit doors in Review; travel distances are not reported until then.`,
        fixSpec: null,
      });
      notChecked.push({
        item: 'Travel distance to exits',
        reason: 'No exit door or stair identified on this floor.',
        floorLabel,
      });
    } else if (f === 0 && hasAnyExit) {
      if (unlockedFloorExits.length < 2) {
        const anchor = floor.doors.find((d) => d.isExit)!.position;
        fv.push({
          ...base,
          id: `viol-f${f}-dual-egress`,
          ruleId: 'bnbc_p4_dual_exit_count',
          category: 'exit_obstruction',
          roomId: null,
          roomName: `${floorLabel} exits`,
          measuredValue: unlockedFloorExits.length,
          limitValue: 2,
          unit: 'exits',
          comparator: '>=',
          status: project.occupancyClass === 'industrial_rmg' ? 'FAIL' : 'WARN',
          severity: project.occupancyClass === 'industrial_rmg' ? 'critical' : 'medium',
          location: anchor,
          description: `Only ${unlockedFloorExits.length} unlocked exit serves ${floorLabel}. Two separate exits is the screening expectation for a floor of this kind; small single dwellings may be exempt.`,
          fixSpec: null,
        });
      } else {
        floorPassed++;
      }
    } else if (f > 0) {
      const corridorAnchor =
        floor.rooms.find((r) => r.taxonomy === 'corridor' || r.taxonomy === 'lobby')?.centroid ||
        floor.rooms[0]?.centroid;
      let usableStairs = 0;

      for (const stair of floor.stairs) {
        let current = stair;
        let aligned = true;
        for (let k = f - 1; k >= 0; k--) {
          const lower = findMatchingLowerStair(current, project.floors[k]);
          if (!lower) {
            aligned = false;
            break;
          }
          current = lower;
        }
        if (!aligned) {
          fv.push({
            ...base,
            id: `viol-f${f}-continuity-${stair.id}`,
            ruleId: 'bnbc_p4_stair_continuity',
            category: 'stair_safety',
            roomId: null,
            roomName: stair.label,
            measuredValue: 0,
            limitValue: 1,
            unit: 'continuous stair',
            comparator: '>=',
            status: 'FAIL',
            severity: 'critical',
            location: stair.centroid,
            description: `"${stair.label}" on ${floorLabel} has no stair directly below it, so it does not lead down to the ground floor.`,
            fixSpec: null,
          });
          continue;
        }

        const reachableOnFloor = corridorAnchor
          ? !computePathBetweenPoints(grids[f], corridorAnchor, [
              { id: stair.id, name: stair.label, position: stair.centroid },
            ]).blocked
          : true;
        const dischargeRes = computePathBetweenPoints(grids[0], current.centroid, groundUnlockedExits);

        if (dischargeRes.blocked) {
          fv.push({
            ...base,
            floorIndex: 0,
            floorLabel: groundFloor.floorLabel || 'GF',
            id: `viol-f${f}-discharge-${stair.id}`,
            ruleId: 'bnbc_p4_stair_discharge',
            category: 'exit_obstruction',
            roomId: null,
            roomName: `${stair.label} at ground`,
            measuredValue: 0,
            limitValue: 1,
            unit: 'open route',
            comparator: '>=',
            status: 'FAIL',
            severity: 'critical',
            location: current.centroid,
            description: `From the foot of "${stair.label}" (serving ${floorLabel}) no unlocked ground-floor exit can be reached.`,
            fixSpec: null,
          });
        } else if (reachableOnFloor) {
          usableStairs++;
          floorPassed++;
        }
      }

      if (usableStairs < 2) {
        fv.push({
          ...base,
          id: `viol-f${f}-dual-stairs`,
          ruleId: 'bnbc_p4_dual_exit_count',
          category: 'exit_obstruction',
          roomId: null,
          roomName: `${floorLabel} stairs`,
          measuredValue: usableStairs,
          limitValue: 2,
          unit: 'usable stairs',
          comparator: '>=',
          status: project.occupancyClass === 'industrial_rmg' ? 'FAIL' : 'WARN',
          severity: project.occupancyClass === 'industrial_rmg' ? 'critical' : 'medium',
          location: floor.stairs[0]?.centroid || {
            x: floor.bounds.minX + floor.bounds.widthM / 2,
            y: floor.bounds.minY + floor.bounds.heightM / 2,
          },
          description: `Only ${usableStairs} stair on ${floorLabel} can be entered from the floor and leads to an open ground-floor exit. Two is the screening expectation.`,
          fixSpec: null,
        });
      }
    }

    // ---- 3. Travel distance per room ---------------------------------------
    if (canMeasureTravel) {
      for (const room of floor.rooms) {
        const res = computeMultiFloorRoomEscapePath(project.floors, f, room, grids, project.storyHeightM);
        escapePaths[room.id] = res;

        if (res.blocked) floorTrapped++;
        else if (res.estimatedTimeSec > floorWorstSec) floorWorstSec = res.estimatedTimeSec;

        if (room.taxonomy === 'corridor' || room.taxonomy === 'exit' || room.taxonomy === 'stair') continue;

        const horizDist = res.floorDistanceM ?? res.distanceM;
        const target = usesStairsAsTargets ? 'stair' : 'exit';

        if (res.blocked) {
          fv.push({
            ...base,
            id: `viol-f${f}-noroute-${room.id}`,
            ruleId: 'egress_no_route',
            category: 'egress_travel',
            roomId: room.id,
            roomName: room.originalLabel,
            measuredValue: 0,
            limitValue: 1,
            unit: 'route',
            comparator: '>=',
            status: 'FAIL',
            severity: 'critical',
            blocked: true,
            location: room.centroid,
            description: `No walking route was found from "${room.originalLabel}" (${floorLabel}) to an open ${target}${res.blockedReason ? `: ${res.blockedReason}` : '.'}`,
            fixSpec: null,
          });
        } else if (room.taxonomy === 'cabin' && horizDist > CABIN_TRAVEL_LIMIT_M) {
          fv.push({
            ...base,
            id: `viol-f${f}-travel-${room.id}`,
            ruleId: 'bnbc_1.13.8.2_travel_distance',
            category: 'egress_travel',
            roomId: room.id,
            roomName: room.originalLabel,
            measuredValue: horizDist,
            limitValue: CABIN_TRAVEL_LIMIT_M,
            unit: 'm',
            comparator: '<=',
            status: 'FAIL',
            severity: horizDist > CABIN_TRAVEL_LIMIT_M + 4 ? 'critical' : 'high',
            location: room.centroid,
            description: `The walking route from cabin "${room.originalLabel}" to the nearest open ${target} (${res.viaStairLabel || res.targetExitName}) on ${floorLabel} is ${horizDist.toFixed(2)} m, ${(horizDist - CABIN_TRAVEL_LIMIT_M).toFixed(2)} m over the 16 m limit.`,
            fixSpec: null,
          });
        } else if (room.taxonomy !== 'cabin' && horizDist > screenLimitM) {
          fv.push({
            ...base,
            id: `viol-f${f}-travel-${room.id}`,
            ruleId: 'screen_travel_distance',
            category: 'egress_travel',
            roomId: room.id,
            roomName: room.originalLabel,
            measuredValue: horizDist,
            limitValue: screenLimitM,
            unit: 'm',
            comparator: '<=',
            status: 'WARN',
            severity: 'high',
            location: room.centroid,
            description: `The walking route from "${room.originalLabel}" to the nearest open ${target} (${res.viaStairLabel || res.targetExitName}) on ${floorLabel} is ${horizDist.toFixed(2)} m, over the ${screenLimitM.toFixed(1)} m screening reference.`,
            fixSpec: null,
          });
        } else {
          floorPassed++;
        }
      }
    }

    // ---- 4. Narrow passages ---------------------------------------------------
    const narrowPassages = detectNarrowPassages(floor);
    if (narrowPassages.length === 0) {
      floorPassed++;
    } else {
      for (const pinch of narrowPassages) {
        const shift = Math.abs(pinch.shiftDx) + Math.abs(pinch.shiftDy);
        fv.push({
          ...base,
          id: `viol-f${f}-passage-${pinch.id}`,
          ruleId: 'bnbc_1.13.8.2_passage_width',
          category: 'passage_width',
          roomId: null,
          roomName: 'Narrow passage',
          measuredValue: pinch.widthM,
          limitValue: MIN_PASSAGE_WIDTH_M,
          unit: 'm',
          comparator: '>=',
          status: 'FAIL',
          severity: 'high',
          location: pinch.center,
          description: `On ${floorLabel}, two walls leave a passage only ${pinch.widthM.toFixed(2)} m wide, below the 0.75 m minimum.`,
          fixSpec: {
            id: `fix-f${f}-widen-passage-${pinch.id}`,
            targetType: 'wall',
            targetId: pinch.shiftWallId,
            floorIndex: f,
            floorLabel,
            action: 'widen_passage',
            summary: `[${floorLabel}] Move the partition wall ${shift.toFixed(2)} m to widen the passage from ${pinch.widthM.toFixed(2)} m to 1.20 m`,
            summaryBn: `[${floorLabel}] পার্টিশন দেয়াল ${bn(shift, 2)} মিটার সরিয়ে চলাচলের পথ ${bn(pinch.widthM, 2)} মিটার থেকে ${bn(1.2, 2)} মিটার চওড়া করুন`,
            deltaBeforeM: pinch.widthM,
            deltaAfterM: 1.2,
            wallShift: { wallId: pinch.shiftWallId, dx: pinch.shiftDx, dy: pinch.shiftDy },
          },
        });
      }
    }

    // ---- 5. Stairs: only values written in the drawing are checked -------------
    for (const stair of floor.stairs) {
      const stated = stair.stated || { width: true, headroom: true, handrail: true, step: true };
      const missing: string[] = [];

      if (!stated.headroom) missing.push('headroom');
      else if (stair.headroomM < 2.15) {
        fv.push({
          ...base,
          id: `viol-f${f}-stair-headroom-${stair.id}`,
          ruleId: 'bnbc_1.13.5_stair_headroom',
          category: 'stair_safety',
          roomId: null,
          roomName: stair.label,
          measuredValue: stair.headroomM,
          limitValue: 2.15,
          unit: 'm',
          comparator: '>=',
          status: 'FAIL',
          severity: 'high',
          location: stair.centroid,
          description: `On ${floorLabel}, the drawing states ${stair.headroomM.toFixed(2)} m headroom for "${stair.label}", below the 2.15 m minimum.`,
          fixSpec: {
            id: `fix-f${f}-stair-headroom-${stair.id}`,
            targetType: 'stair',
            targetId: stair.id,
            floorIndex: f,
            floorLabel,
            action: 'adjust_stair',
            summary: `[${floorLabel}] Raise "${stair.label}" headroom from ${stair.headroomM.toFixed(2)} m to 2.25 m`,
            summaryBn: `[${floorLabel}] "${stair.label}" সিঁড়ির মাথার উপরের ফাঁকা উচ্চতা ${bn(stair.headroomM, 2)} মিটার থেকে ${bn(2.25, 2)} মিটার করুন`,
            deltaBeforeM: stair.headroomM,
            deltaAfterM: 2.25,
          },
        });
      } else floorPassed++;

      if (!stated.handrail) missing.push('handrail height');
      else if (stair.handrailHeightM < 0.9) {
        fv.push({
          ...base,
          id: `viol-f${f}-stair-handrail-${stair.id}`,
          ruleId: 'bnbc_1.13.5_stair_handrail',
          category: 'stair_safety',
          roomId: null,
          roomName: stair.label,
          measuredValue: stair.handrailHeightM,
          limitValue: 0.9,
          unit: 'm',
          comparator: '>=',
          status: 'FAIL',
          severity: 'medium',
          location: stair.centroid,
          description: `On ${floorLabel}, the drawing states a ${stair.handrailHeightM.toFixed(2)} m handrail for "${stair.label}", below the 0.90 m minimum.`,
          fixSpec: {
            id: `fix-f${f}-stair-handrail-${stair.id}`,
            targetType: 'stair',
            targetId: stair.id,
            floorIndex: f,
            floorLabel,
            action: 'adjust_stair',
            summary: `[${floorLabel}] Raise "${stair.label}" handrail from ${stair.handrailHeightM.toFixed(2)} m to 0.95 m`,
            summaryBn: `[${floorLabel}] "${stair.label}" সিঁড়ির হাতলের উচ্চতা ${bn(stair.handrailHeightM, 2)} মিটার থেকে ${bn(0.95, 2)} মিটার করুন`,
            deltaBeforeM: stair.handrailHeightM,
            deltaAfterM: 0.95,
          },
        });
      } else floorPassed++;

      if (!stated.step) missing.push('riser and tread');
      else {
        const sum = Math.round(2 * stair.riserMm + stair.treadMm);
        if (sum < 610 || sum > 648) {
          fv.push({
            ...base,
            id: `viol-f${f}-stair-step-${stair.id}`,
            ruleId: 'bnbc_1.13.5_stair_proportion',
            category: 'stair_safety',
            roomId: null,
            roomName: stair.label,
            measuredValue: sum,
            limitValue: sum < 610 ? 610 : 648,
            unit: 'mm (2R+T)',
            comparator: sum < 610 ? '>=' : '<=',
            status: 'FAIL',
            severity: 'medium',
            location: stair.centroid,
            description: `On ${floorLabel}, "${stair.label}" has a ${stair.riserMm} mm riser and ${stair.treadMm} mm tread: two risers plus one tread is ${sum} mm, outside the 610–648 mm range.`,
            fixSpec: null,
          });
        } else floorPassed++;
      }

      if (missing.length > 0) {
        notChecked.push({
          item: `${stair.label}: ${missing.join(', ')}`,
          reason: 'Not written in the drawing. A plan view cannot show these values.',
          floorLabel,
        });
      }
    }

    // ---- 6. Dimension text against geometry -------------------------------------
    for (const dim of floor.dimensions) {
      if (dim.isStaleOverride && dim.parsedOverrideM !== null) {
        const mid = { x: (dim.start.x + dim.end.x) / 2, y: (dim.start.y + dim.end.y) / 2 };
        const acrossPinch = narrowPassages.some(
          (p) => Math.hypot(p.center.x - mid.x, p.center.y - mid.y) < 3 && Math.abs(p.widthM - dim.measuredValueM) < 0.06
        );
        const after = acrossPinch ? 1.2 : dim.measuredValueM;
        fv.push({
          ...base,
          id: `viol-f${f}-dim-${dim.id}`,
          ruleId: 'cad_dimension_override_mismatch',
          category: 'dimension_integrity',
          roomId: null,
          roomName: `Dimension "${dim.overrideText}"`,
          measuredValue: Number(dim.measuredValueM.toFixed(2)),
          limitValue: Number(dim.parsedOverrideM.toFixed(2)),
          unit: 'm',
          comparator: '==',
          status: 'WARN',
          severity: 'medium',
          location: mid,
          description: `On ${floorLabel}, a dimension is typed as "${dim.overrideText}" but its two points are ${dim.measuredValueM.toFixed(2)} m apart.`,
          fixSpec: {
            id: `fix-f${f}-dim-${dim.id}`,
            targetType: 'dimension',
            targetId: dim.id,
            floorIndex: f,
            floorLabel,
            action: 'sync_dimension',
            summary: `[${floorLabel}] Make the dimension text show the real distance (${after.toFixed(2)} m)`,
            summaryBn: `[${floorLabel}] মাপের লেখায় প্রকৃত দূরত্ব (${bn(after, 2)} মিটার) দেখান`,
            deltaBeforeM: dim.measuredValueM,
            deltaAfterM: after,
          },
        });
      } else {
        floorPassed++;
      }
    }

    // ---- 7. Sleeping rooms and windows ---------------------------------------------
    for (const room of floor.rooms) {
      if (room.taxonomy !== 'bedroom' && room.taxonomy !== 'habitable') continue;
      if (room.boundarySource === 'text-only') {
        notChecked.push({
          item: `${room.originalLabel}: area, width and windows`,
          reason: 'The walls around this room are not closed, so it could not be measured.',
          floorLabel,
        });
        continue;
      }
      if (room.taxonomy === 'bedroom') {
        if (room.areaSqM < 9.5) {
          fv.push({
            ...base,
            id: `viol-hab-area-${room.id}`,
            ruleId: 'bnbc_3.12_habitable_area',
            category: 'habitability_ventilation',
            roomId: room.id,
            roomName: room.originalLabel,
            measuredValue: room.areaSqM,
            limitValue: 9.5,
            unit: 'm²',
            comparator: '>=',
            status: 'FAIL',
            severity: 'high',
            location: room.centroid,
            description: `On ${floorLabel}, sleeping room "${room.originalLabel}" measures ${room.areaSqM.toFixed(1)} m², below the 9.5 m² minimum.`,
            fixSpec: null,
          });
        } else floorPassed++;
        if (room.minWidthM !== undefined && room.polygon.length === 4) {
          if (room.minWidthM < 2.9) {
            fv.push({
              ...base,
              id: `viol-hab-width-${room.id}`,
              ruleId: 'bnbc_bedroom_width',
              category: 'habitability_ventilation',
              roomId: room.id,
              roomName: room.originalLabel,
              measuredValue: room.minWidthM,
              limitValue: 2.9,
              unit: 'm',
              comparator: '>=',
              status: 'FAIL',
              severity: 'medium',
              location: room.centroid,
              description: `On ${floorLabel}, sleeping room "${room.originalLabel}" is ${room.minWidthM.toFixed(2)} m wide, below the 2.9 m minimum width.`,
              fixSpec: null,
            });
          } else floorPassed++;
        }
      }
      if (countWindowsNearRoom(room, floor) === 0) {
        fv.push({
          ...base,
          id: `viol-hab-daylight-${room.id}`,
          ruleId: 'bnbc_3.16_daylight_ventilation',
          category: 'habitability_ventilation',
          roomId: room.id,
          roomName: room.originalLabel,
          measuredValue: 0,
          limitValue: 1,
          unit: 'window',
          comparator: '>=',
          status: 'WARN',
          severity: 'medium',
          location: room.centroid,
          description: `On ${floorLabel}, no window was found on the walls of "${room.originalLabel}". Habitable rooms need openings equal to 15% of their floor area.`,
          fixSpec: null,
        });
      } else floorPassed++;
    }

    floorSummaries.push({
      floorIndex: f,
      floorLabel,
      floorName,
      failCount: fv.filter((v) => v.status === 'FAIL').length,
      warnCount: fv.filter((v) => v.status === 'WARN').length,
      passedCount: floorPassed,
      worstEscapeSec: floorWorstSec,
      trappedRoomCount: floorTrapped,
      occupantLoad: floor.rooms.reduce((s, r) => s + computeRoomOccupantLoad(r), 0),
    });
    violations.push(...fv);
    totalPassed += floorPassed;
    totalTrapped += floorTrapped;
    if (floorWorstSec > buildingWorstSec) buildingWorstSec = floorWorstSec;
  }

  // ---- Building-level checks ---------------------------------------------------
  const gf = groundFloor;
  const gfLabel = gf.floorLabel || 'GF';
  const centre: Point2D = { x: gf.bounds.minX + gf.bounds.widthM / 2, y: gf.bounds.minY + gf.bounds.heightM / 2 };
  const groundFootprintSqM = Number(floorAreaSqM(gf).toFixed(1));
  const totalBuildingAreaSqM = Number(project.floors.reduce((a, fl) => a + floorAreaSqM(fl), 0).toFixed(1));
  const totalHeightM = project.floors.length * project.storyHeightM;
  const site = project.siteContext;
  const siteDeclared = Boolean(site && site.declared !== false && site.plotAreaSqM > 0);
  const whole = { floorIndex: 0, floorLabel: gfLabel, citation: '', ruleName: '', roomId: null, fixSpec: null };

  let mgcPercent = 0;
  let maxAllowedMgcPercent = 0;
  let achievedFar = 0;
  let maxAllowedFar = 0;

  if (site && siteDeclared) {
    maxAllowedMgcPercent = lookupMaxAllowedMgc(site.plotAreaSqM, project.occupancyClass);
    mgcPercent = Number(((groundFootprintSqM / site.plotAreaSqM) * 100).toFixed(1));
    maxAllowedFar = lookupMaxAllowedFar(site.abuttingRoadWidthM, project.occupancyClass);
    achievedFar = Number((totalBuildingAreaSqM / site.plotAreaSqM).toFixed(2));

    if (mgcPercent > maxAllowedMgcPercent) {
      violations.push({
        ...whole,
        id: 'viol-zoning-mgc',
        ruleId: 'imarat_rule16_mgc',
        category: 'zoning_far',
        roomName: 'Ground coverage',
        measuredValue: mgcPercent,
        limitValue: maxAllowedMgcPercent,
        unit: '%',
        comparator: '<=',
        status: 'WARN',
        severity: 'high',
        location: centre,
        description: `The ground floor (${groundFootprintSqM.toFixed(1)} m²) covers ${mgcPercent.toFixed(1)}% of the ${site.plotAreaSqM} m² plot, over the ${maxAllowedMgcPercent}% screening limit.`,
      });
    } else totalPassed++;

    if (achievedFar > maxAllowedFar) {
      violations.push({
        ...whole,
        id: 'viol-zoning-far',
        ruleId: 'imarat_rule16_far',
        category: 'zoning_far',
        roomName: 'Floor area ratio',
        measuredValue: achievedFar,
        limitValue: maxAllowedFar,
        unit: 'FAR',
        comparator: '<=',
        status: 'WARN',
        severity: 'high',
        location: centre,
        description: `FAR is ${achievedFar.toFixed(2)} (${totalBuildingAreaSqM.toFixed(0)} m² on a ${site.plotAreaSqM} m² plot), over the ${maxAllowedFar.toFixed(2)} screening limit for a ${site.abuttingRoadWidthM.toFixed(1)} m road.`,
      });
    } else totalPassed++;

    const setbacks: [string, number, number, Point2D][] = [
      ['Front setback', site.frontSetbackM, 1.5, { x: centre.x, y: gf.bounds.minY + 0.4 }],
      ['Rear setback', site.rearSetbackM, totalHeightM > 10 ? 2.0 : 1.5, { x: centre.x, y: gf.bounds.maxY - 0.4 }],
      ['Side setback', site.sideSetbackM, project.occupancyClass === 'industrial_rmg' ? 1.25 : 1.0, { x: gf.bounds.minX + 0.4, y: centre.y }],
    ];
    for (const [name, got, need, loc] of setbacks) {
      if (got < need) {
        violations.push({
          ...whole,
          id: `viol-setback-${name.split(' ')[0].toLowerCase()}`,
          ruleId: 'imarat_rule17_setback',
          category: 'zoning_far',
          roomName: name,
          measuredValue: got,
          limitValue: need,
          unit: 'm',
          comparator: '>=',
          status: 'WARN',
          severity: 'high',
          location: loc,
          description: `The declared ${name.toLowerCase()} (${got.toFixed(2)} m) is below the ${need.toFixed(2)} m screening minimum.`,
        });
      } else totalPassed++;
    }
  } else {
    notChecked.push({
      item: 'FAR, ground coverage and setbacks',
      reason: 'Plot area, road width and setbacks are not in the drawing. Enter them in Review to screen zoning.',
    });
  }

  // Occupant load against exit and stair width (screening factors).
  let totalOccupantLoad = 0;
  let peakFloorLoad = 0;
  let maxUpperFloorLoad = 0;
  project.floors.forEach((fl, idx) => {
    const load = fl.rooms.reduce((s, r) => s + computeRoomOccupantLoad(r), 0);
    totalOccupantLoad += load;
    peakFloorLoad = Math.max(peakFloorLoad, load);
    if (idx > 0) maxUpperFloorLoad = Math.max(maxUpperFloorLoad, load);
  });
  const groundExitWidthM = gf.doors.filter((d) => d.isExit && !d.isLocked).reduce((s, d) => s + d.widthM, 0);
  const groundExitCapacityPersons = Math.round(groundExitWidthM * 200);
  const stairWidthM = gf.stairs.reduce((s, st) => s + st.clearWidthM, 0);
  const stairCapacityPersons = Math.round(stairWidthM * 133);

  if (gf.doors.some((d) => d.isExit)) {
    if (groundExitCapacityPersons < peakFloorLoad) {
      violations.push({
        ...whole,
        id: 'viol-capacity-ground-exits',
        ruleId: 'bnbc_4.3.9_exit_capacity',
        category: 'egress_capacity',
        roomName: 'Ground exits',
        measuredValue: groundExitCapacityPersons,
        limitValue: peakFloorLoad,
        unit: 'persons',
        comparator: '>=',
        status: 'WARN',
        severity: 'high',
        location: { x: centre.x, y: gf.bounds.minY + 1 },
        description: `Unlocked ground exits total ${groundExitWidthM.toFixed(2)} m (about ${groundExitCapacityPersons} persons at an assumed 5 mm each), below the estimated peak floor load of ${peakFloorLoad} persons.`,
      });
    } else totalPassed++;
  }
  if (project.floors.length > 1 && maxUpperFloorLoad > 0) {
    if (stairCapacityPersons < maxUpperFloorLoad) {
      violations.push({
        ...whole,
        floorIndex: 1,
        floorLabel: project.floors[1]?.floorLabel || 'L2',
        id: 'viol-capacity-stairs',
        ruleId: 'bnbc_4.3.9_stair_capacity',
        category: 'egress_capacity',
        roomName: 'Stairs',
        measuredValue: stairCapacityPersons,
        limitValue: maxUpperFloorLoad,
        unit: 'persons',
        comparator: '>=',
        status: 'WARN',
        severity: 'high',
        location: gf.stairs[0]?.centroid || centre,
        description: `Stairs total ${stairWidthM.toFixed(2)} m wide (about ${stairCapacityPersons} persons at an assumed 7.5 mm each), below the estimated upper-floor load of ${maxUpperFloorLoad} persons.`,
      });
    } else totalPassed++;
  }

  if (totalHeightM > 20.0) {
    violations.push({
      ...whole,
      floorIndex: project.floors.length - 1,
      floorLabel: project.floors[project.floors.length - 1]?.floorLabel || 'TOP',
      id: 'viol-highrise',
      ruleId: 'bnbc_4.4.1_highrise',
      category: 'fire_access',
      roomName: 'Building height',
      measuredValue: Number(totalHeightM.toFixed(1)),
      limitValue: 20.0,
      unit: 'm',
      comparator: '<=',
      status: 'WARN',
      severity: 'medium',
      location: centre,
      description: `${project.floors.length} floors at ${project.storyHeightM.toFixed(1)} m each is ${totalHeightM.toFixed(1)} m, above 20 m, so the building is a high-rise and the additional fire provisions of BNBC Part 4 apply.`,
    });
  }

  violations.forEach(stamp);

  const metrics: ZoningAndCapacityMetrics = {
    plotAreaSqM: siteDeclared && site ? site.plotAreaSqM : 0,
    groundFootprintSqM,
    totalBuildingAreaSqM,
    mgcPercent,
    maxAllowedMgcPercent,
    achievedFar,
    maxAllowedFar,
    travelLimitM: screenLimitM,
    totalOccupantLoad,
    peakFloorLoad,
    groundExitCapacityPersons,
    stairCapacityPersons,
    sprinklered,
  };

  return {
    violations,
    passedCount: totalPassed,
    failCount: violations.filter((v) => v.status === 'FAIL').length,
    warnCount: violations.filter((v) => v.status === 'WARN').length,
    escapePaths,
    worstEscapeSec: buildingWorstSec,
    trappedRoomCount: totalTrapped,
    floorSummaries,
    metrics,
    notChecked,
  };
}

function applyFixesToFloor(
  fixedPlan: ParsedFloorPlan,
  floorViolations: Violation[]
): RemediationDelta[] {
  const deltas: RemediationDelta[] = [];

  for (const v of floorViolations) {
    if (!v.fixSpec) continue;
    const fix = v.fixSpec;
    deltas.push(fix);

    if (fix.targetType === 'door') {
      const door = fixedPlan.doors.find((d) => d.id === fix.targetId);
      if (door) {
        door.isLocked = false;
        door.widthM = Math.max(door.widthM, fix.deltaAfterM || 1.1);
        door.blockName = door.blockName.replace(/LOCKED|BLOCKED/gi, 'OPEN');
        if (!door.blockName.includes('OPEN') && fix.action === 'unlock_exit') {
          door.blockName = `${door.blockName}_OPEN`;
        }
      }
    } else if (fix.targetType === 'wall' && fix.wallShift) {
      // The routine below moves a horizontal wall line. For a vertical wall the
      // plan is mirrored across the diagonal, moved, and mirrored back.
      const vertical = fix.wallShift.dx !== 0 && fix.wallShift.dy === 0;
      const flip = () => {
        const sw = (pt: Point2D) => {
          const t = pt.x;
          pt.x = pt.y;
          pt.y = t;
        };
        fixedPlan.walls.forEach((w) => { sw(w.start); sw(w.end); });
        fixedPlan.doors.forEach((d) => sw(d.position));
        fixedPlan.rooms.forEach((r) => r.polygon.forEach(sw));
      };
      if (vertical) flip();
      const shiftY = vertical ? fix.wallShift.dx : fix.wallShift.dy;
      const shiftX = 0;
      const targetWall = fixedPlan.walls.find((w) => w.id === fix.wallShift!.wallId);
      if (targetWall) {
        const oldY = targetWall.start.y;
        const sameY = fixedPlan.walls
          .filter(
            (w) =>
              Math.abs(w.start.y - oldY) < 0.05 &&
              Math.abs(w.end.y - oldY) < 0.05
          )
          .sort((a, b) => Math.min(a.start.x, a.end.x) - Math.min(b.start.x, b.end.x));

        let chainMinX = Math.min(targetWall.start.x, targetWall.end.x);
        let chainMaxX = Math.max(targetWall.start.x, targetWall.end.x);
        let expanded = true;
        while (expanded) {
          expanded = false;
          for (const w of sameY) {
            const wMin = Math.min(w.start.x, w.end.x);
            const wMax = Math.max(w.start.x, w.end.x);
            if (wMin <= chainMaxX + 2.5 && wMax >= chainMinX - 2.5) {
              if (wMin < chainMinX) {
                chainMinX = wMin;
                expanded = true;
              }
              if (wMax > chainMaxX) {
                chainMaxX = wMax;
                expanded = true;
              }
            }
          }
        }

        for (const w of fixedPlan.walls) {
          if (
            Math.abs(w.start.y - oldY) < 0.05 &&
            Math.abs(w.end.y - oldY) < 0.05 &&
            Math.max(w.start.x, w.end.x) >= chainMinX - 0.1 &&
            Math.min(w.start.x, w.end.x) <= chainMaxX + 0.1
          ) {
            w.start.x += shiftX;
            w.end.x += shiftX;
            w.start.y += shiftY;
            w.end.y += shiftY;
          } else if (
            Math.abs(w.start.x - w.end.x) < 0.05 &&
            w.start.x >= chainMinX - 0.1 &&
            w.start.x <= chainMaxX + 0.1
          ) {
            if (Math.abs(w.start.y - oldY) < 0.05) w.start.y += shiftY;
            if (Math.abs(w.end.y - oldY) < 0.05) w.end.y += shiftY;
          }
        }
        for (const d of fixedPlan.doors) {
          if (
            Math.abs(d.position.y - oldY) < 0.08 &&
            d.position.x >= chainMinX - 0.5 &&
            d.position.x <= chainMaxX + 0.5
          ) {
            d.position.x += shiftX;
            d.position.y += shiftY;
          }
        }
        for (const rm of fixedPlan.rooms) {
          for (const pt of rm.polygon) {
            if (
              Math.abs(pt.y - oldY) < 0.05 &&
              pt.x >= chainMinX - 0.1 &&
              pt.x <= chainMaxX + 0.1
            ) {
              pt.y += shiftY;
            }
          }
        }
      }
      if (vertical) flip();
    } else if (fix.targetType === 'stair') {
      const stair = fixedPlan.stairs.find((s) => s.id === fix.targetId);
      if (stair) {
        if (v.ruleId === 'bnbc_1.13.5_stair_headroom') {
          stair.headroomM = 2.25;
        }
        if (v.ruleId === 'bnbc_1.13.5_stair_proportion' && fix.deltaAfterM) {
          stair.treadMm = Math.round(fix.deltaAfterM * 1000);
        }
        if (v.ruleId === 'bnbc_1.13.5_stair_handrail') {
          stair.handrailHeightM = 0.95;
        }
      }
    } else if (fix.targetType === 'dimension') {
      const dim = fixedPlan.dimensions.find((d) => d.id === fix.targetId);
      if (dim) {
        const after = fix.deltaAfterM ?? dim.measuredValueM;
        dim.measuredValueM = after;
        dim.overrideText = `${after.toFixed(2)}m`;
        dim.parsedOverrideM = after;
        dim.isStaleOverride = false;
      }
    }
  }

  return deltas;
}

/**
 * Applies the proposed changes to a copy of the parsed geometry.
 * The source DXF is never edited.
 */
export function applyBuildingRemediationFixes(
  project: BuildingProject,
  audit: ComplianceAudit
): { fixedProject: BuildingProject; deltas: RemediationDelta[] } {
  const fixedProject: BuildingProject = JSON.parse(JSON.stringify(project));
  const deltas: RemediationDelta[] = [];

  for (let f = 0; f < fixedProject.floors.length; f++) {
    const floorViolations = audit.violations.filter(
      (v) => (v.floorIndex ?? 0) === f
    );
    const floorDeltas = applyFixesToFloor(fixedProject.floors[f], floorViolations);
    deltas.push(...floorDeltas);
  }

  return { fixedProject, deltas };
}
