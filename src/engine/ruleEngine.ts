import type {
  BuildingProject,
  ComplianceAudit,
  EscapePathResult,
  FloorAuditSummary,
  ParsedFloorPlan,
  Point2D,
  RemediationDelta,
  RoomEntity,
  SiteContext,
  Violation,
  ZoningAndCapacityMetrics,
} from '../types/plan';
import {
  buildNavGrid,
  computeMultiFloorRoomEscapePath,
  computePathBetweenPoints,
  computeRoomEscapePath,
  detectNarrowPassages,
  findMatchingLowerStair,
  type NavGrid,
} from './pathfinding';

export function computeRoomOccupantLoad(room: RoomEntity): number {
  switch (room.taxonomy) {
    case 'workfloor':
      return Math.max(1, Math.round(room.areaSqM / 2.8));
    case 'lobby':
      return Math.max(1, Math.round(room.areaSqM / 1.4));
    case 'cabin':
      return Math.max(1, Math.round(room.areaSqM / 9.3));
    case 'bedroom':
      return Math.max(1, Math.round(room.areaSqM / 18.6));
    case 'utility':
      return Math.max(1, Math.round(room.areaSqM / 28.0));
    default:
      return 0;
  }
}

function pointToSegmentDist(pt: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(pt.x - a.x, pt.y - a.y);
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq));
  return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
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
    if (minEdgeDist <= 1.25) {
      count++;
    }
  }
  return count;
}

function lookupMaxAllowedFar(roadWidthM: number, occupancyClass: BuildingProject['occupancyClass']): number {
  const base =
    roadWidthM < 6.0
      ? 2.5
      : roadWidthM < 9.0
        ? 3.0
        : roadWidthM < 12.0
          ? 3.25
          : roadWidthM < 18.0
            ? 3.5
            : 4.25;
  return occupancyClass === 'industrial_rmg' ? Math.min(base, 3.5) : base;
}

function lookupMaxAllowedMgc(plotAreaSqM: number, occupancyClass: BuildingProject['occupancyClass']): number {
  if (occupancyClass === 'industrial_rmg') return 60;
  return plotAreaSqM <= 335 ? 62.5 : 60;
}

function appendZoningHabitabilityAndCapacityChecks(
  project: BuildingProject,
  audit: ComplianceAudit,
  travelLimitM: number
): ComplianceAudit {
  const gf = project.floors[0];
  if (!gf) return audit;

  const gfRoomSum = gf.rooms
    .filter((r) => r.taxonomy !== 'exit')
    .reduce((s, r) => s + r.areaSqM, 0);
  const groundFootprintSqM = Number(
    (gfRoomSum > 10 ? gfRoomSum : gf.bounds.widthM * gf.bounds.heightM).toFixed(1)
  );
  const totalBuildingAreaSqM = Number(
    project.floors
      .reduce((acc, fl) => {
        const sum = fl.rooms.reduce((s, r) => s + r.areaSqM, 0);
        return acc + (sum > 10 ? sum : fl.bounds.widthM * fl.bounds.heightM);
      }, 0)
      .toFixed(1)
  );

  const site: SiteContext = project.siteContext || {
    plotAreaSqM: Number((groundFootprintSqM / 0.54).toFixed(0)),
    abuttingRoadWidthM: 12.2,
    frontSetbackM: 2.5,
    rearSetbackM: 2.0,
    sideSetbackM: 1.5,
    sprinklered: false,
    zoneLabel: 'Default Urban Site',
  };

  const maxAllowedMgcPercent = lookupMaxAllowedMgc(site.plotAreaSqM, project.occupancyClass);
  const mgcPercent = Number(((groundFootprintSqM / Math.max(1, site.plotAreaSqM)) * 100).toFixed(1));
  const maxAllowedFar = lookupMaxAllowedFar(site.abuttingRoadWidthM, project.occupancyClass);
  const achievedFar = Number((totalBuildingAreaSqM / Math.max(1, site.plotAreaSqM)).toFixed(2));

  let addedPassed = 0;
  const extraViolations: Violation[] = [];
  const totalHeightM = project.floors.length * project.storyHeightM;

  // 1. Zoning: MGC % (Dhaka Imarat Nirman Bidhimala 2008, Rule 16)
  if (mgcPercent > maxAllowedMgcPercent) {
    extraViolations.push({
      id: 'viol-zoning-mgc',
      ruleId: 'imarat_rule16_mgc',
      ruleName: 'Maximum Ground Coverage (MGC) Exceeded',
      citation: 'Dhaka Imarat Nirman Bidhimala 2008, Rule 16 (MGC Schedule)',
      category: 'zoning_far',
      floorIndex: 0,
      floorLabel: gf.floorLabel || 'GF',
      roomId: null,
      roomName: 'Ground Footprint vs. Plot',
      measuredValue: mgcPercent,
      limitValue: maxAllowedMgcPercent,
      unit: '%',
      comparator: '<=',
      status: 'FAIL',
      severity: 'high',
      location: { x: gf.bounds.widthM / 2, y: gf.bounds.heightM / 2 },
      description: `Ground footprint (${groundFootprintSqM.toFixed(1)} m²) covers ${mgcPercent.toFixed(1)}% of the ${site.plotAreaSqM} m² plot, exceeding the ${maxAllowedMgcPercent}% MGC ceiling.`,
      fixSpec: null,
    });
  } else {
    addedPassed++;
  }

  // 2. Zoning: FAR (Dhaka Imarat Nirman Bidhimala 2008, Rule 16 / Schedule-3)
  if (achievedFar > maxAllowedFar) {
    extraViolations.push({
      id: 'viol-zoning-far',
      ruleId: 'imarat_rule16_far',
      ruleName: 'Floor Area Ratio (FAR) Exceeds Road-Width Limit',
      citation: 'Dhaka Imarat Nirman Bidhimala 2008, Rule 16 / Schedule-3 (FAR)',
      category: 'zoning_far',
      floorIndex: 0,
      floorLabel: gf.floorLabel || 'GF',
      roomId: null,
      roomName: 'Total Built Area / Plot',
      measuredValue: achievedFar,
      limitValue: maxAllowedFar,
      unit: 'FAR',
      comparator: '<=',
      status: 'FAIL',
      severity: 'critical',
      location: { x: gf.bounds.widthM / 2, y: gf.bounds.heightM / 2 },
      description: `Achieved FAR is ${achievedFar.toFixed(2)} (${totalBuildingAreaSqM.toFixed(0)} m² across ${project.floors.length} floors on ${site.plotAreaSqM} m² plot), above the ${maxAllowedFar.toFixed(2)} limit for a ${site.abuttingRoadWidthM.toFixed(1)} m abutting road.`,
      fixSpec: null,
    });
  } else {
    addedPassed++;
  }

  // 3. Zoning: Setbacks (Rule 17)
  const reqFront = 1.5;
  const reqRear = totalHeightM > 10 ? 2.0 : 1.5;
  const reqSide = project.occupancyClass === 'industrial_rmg' ? 1.25 : 1.0;

  if (site.frontSetbackM < reqFront) {
    extraViolations.push({
      id: 'viol-setback-front',
      ruleId: 'imarat_rule17_setback',
      ruleName: 'Front Plot Setback Below Minimum',
      citation: 'Dhaka Imarat Nirman Bidhimala 2008, Rule 17 (Setbacks)',
      category: 'zoning_far',
      floorIndex: 0,
      floorLabel: gf.floorLabel || 'GF',
      roomId: null,
      roomName: 'Front Yard Setback',
      measuredValue: site.frontSetbackM,
      limitValue: reqFront,
      unit: 'm',
      comparator: '>=',
      status: 'FAIL',
      severity: 'high',
      location: { x: gf.bounds.widthM / 2, y: 0.4 },
      description: `Declared front setback (${site.frontSetbackM.toFixed(2)} m) is below the ${reqFront.toFixed(2)} m Imarat Bidhimala minimum.`,
      fixSpec: null,
    });
  } else {
    addedPassed++;
  }

  if (site.rearSetbackM < reqRear) {
    extraViolations.push({
      id: 'viol-setback-rear',
      ruleId: 'imarat_rule17_setback',
      ruleName: 'Rear Plot Setback Below Minimum',
      citation: 'Dhaka Imarat Nirman Bidhimala 2008, Rule 17 (Setbacks)',
      category: 'zoning_far',
      floorIndex: 0,
      floorLabel: gf.floorLabel || 'GF',
      roomId: null,
      roomName: 'Rear Yard Setback',
      measuredValue: site.rearSetbackM,
      limitValue: reqRear,
      unit: 'm',
      comparator: '>=',
      status: 'FAIL',
      severity: 'high',
      location: { x: gf.bounds.widthM / 2, y: gf.bounds.heightM - 0.4 },
      description: `Declared rear setback (${site.rearSetbackM.toFixed(2)} m) is below the ${reqRear.toFixed(2)} m minimum.`,
      fixSpec: null,
    });
  } else {
    addedPassed++;
  }

  if (site.sideSetbackM < reqSide) {
    extraViolations.push({
      id: 'viol-setback-side',
      ruleId: 'imarat_rule17_setback',
      ruleName: 'Side Setback Below Fire-Access Minimum',
      citation: 'Dhaka Imarat Nirman Bidhimala 2008, Rule 17 (Setbacks)',
      category: 'zoning_far',
      floorIndex: 0,
      floorLabel: gf.floorLabel || 'GF',
      roomId: null,
      roomName: 'Side Yard Setback',
      measuredValue: site.sideSetbackM,
      limitValue: reqSide,
      unit: 'm',
      comparator: '>=',
      status: 'FAIL',
      severity: 'high',
      location: { x: 0.4, y: gf.bounds.heightM / 2 },
      description: `Declared side setback (${site.sideSetbackM.toFixed(2)} m) is below the ${reqSide.toFixed(2)} m minimum clear side passage.`,
      fixSpec: null,
    });
  } else {
    addedPassed++;
  }

  // 4. Habitability & Daylight Openings (BNBC 2020 Part 3, Sec 1.12 & 1.16)
  for (let f = 0; f < project.floors.length; f++) {
    const fl = project.floors[f];
    const flLabel = fl.floorLabel || (f === 0 ? 'GF' : `L${f + 1}`);
    for (const room of fl.rooms) {
      if (room.taxonomy === 'bedroom') {
        if (room.areaSqM < 9.5) {
          extraViolations.push({
            id: `viol-hab-area-${room.id}`,
            ruleId: 'bnbc_3.12_habitable_area',
            ruleName: 'Habitable Bedroom Below 9.5 m² Minimum',
            citation: 'BNBC 2020, Part 3, Ch. 1 (Sec 1.12)',
            category: 'habitability_ventilation',
            floorIndex: f,
            floorLabel: flLabel,
            roomId: room.id,
            roomName: room.originalLabel,
            measuredValue: room.areaSqM,
            limitValue: 9.5,
            unit: 'm²',
            comparator: '>=',
            status: 'FAIL',
            severity: 'high',
            location: room.centroid,
            description: `On ${flLabel}, bedroom "${room.originalLabel}" measures ${room.areaSqM.toFixed(1)} m², below the 9.5 m² BNBC habitable minimum.`,
            fixSpec: null,
          });
        } else {
          addedPassed++;
        }

        const winCount = countWindowsNearRoom(room, fl);
        if (winCount === 0) {
          extraViolations.push({
            id: `viol-hab-daylight-${room.id}`,
            ruleId: 'bnbc_3.16_daylight_ventilation',
            ruleName: 'Habitable Room Missing Exterior Daylight Window',
            citation: 'BNBC 2020, Part 3, Ch. 1 (Sec 1.16 Lighting & Ventilation)',
            category: 'habitability_ventilation',
            floorIndex: f,
            floorLabel: flLabel,
            roomId: room.id,
            roomName: room.originalLabel,
            measuredValue: 0,
            limitValue: 1,
            unit: 'window',
            comparator: '>=',
            status: 'FAIL',
            severity: 'high',
            location: room.centroid,
            description: `On ${flLabel}, habitable room "${room.originalLabel}" has no detected window opening along its perimeter for natural light and cross-ventilation.`,
            fixSpec: null,
          });
        } else {
          addedPassed++;
        }
      }
    }
  }

  // 5. Occupant Load & Exit / Stair Capacity (BNBC 2020 Part 4, Table 4.3.2 & Sec 3.9)
  let totalOccupantLoad = 0;
  let peakFloorLoad = 0;
  let maxUpperFloorLoad = 0;
  const updatedFloorSummaries = (audit.floorSummaries || []).map((fs) => ({ ...fs }));

  project.floors.forEach((fl, fIdx) => {
    const flLoad = fl.rooms.reduce((s, r) => s + computeRoomOccupantLoad(r), 0);
    totalOccupantLoad += flLoad;
    if (flLoad > peakFloorLoad) peakFloorLoad = flLoad;
    if (fIdx > 0 && flLoad > maxUpperFloorLoad) maxUpperFloorLoad = flLoad;
    const matchFs = updatedFloorSummaries.find((s) => s.floorIndex === fIdx);
    if (matchFs) matchFs.occupantLoad = flLoad;
  });

  const groundUnlockedExitWidthM = gf.doors
    .filter((d) => d.isExit && !d.isLocked)
    .reduce((s, d) => s + d.widthM, 0);
  const groundExitCapacityPersons = Math.round(groundUnlockedExitWidthM * 200);
  const stairWidthM = gf.stairs.reduce((s, st) => s + st.clearWidthM, 0);
  const stairCapacityPersons = Math.round(stairWidthM * 133);

  if (gf.doors.some((d) => d.isExit) && groundExitCapacityPersons < peakFloorLoad) {
    extraViolations.push({
      id: 'viol-capacity-ground-exits',
      ruleId: 'bnbc_4.3.9_exit_capacity',
      ruleName: 'Ground Exit Width Insufficient for Occupant Load',
      citation: 'BNBC 2020, Part 4, Ch. 3 (Table 4.3.2 & Sec 3.9)',
      category: 'egress_capacity',
      floorIndex: 0,
      floorLabel: gf.floorLabel || 'GF',
      roomId: null,
      roomName: 'Ground Exit Capacity',
      measuredValue: groundExitCapacityPersons,
      limitValue: peakFloorLoad,
      unit: 'persons',
      comparator: '>=',
      status: 'FAIL',
      severity: 'critical',
      location: { x: gf.bounds.widthM / 2, y: 1.0 },
      description: `Unlocked ground exits provide ${groundUnlockedExitWidthM.toFixed(2)} m width (${groundExitCapacityPersons} persons capacity at 5 mm/person), below peak floor occupant load (${peakFloorLoad} persons).`,
      fixSpec: null,
    });
  } else if (gf.doors.some((d) => d.isExit)) {
    addedPassed++;
  }

  if (project.floors.length > 1 && maxUpperFloorLoad > 0 && stairCapacityPersons < maxUpperFloorLoad) {
    extraViolations.push({
      id: 'viol-capacity-stairs',
      ruleId: 'bnbc_4.3.9_stair_capacity',
      ruleName: 'Staircase Total Width Insufficient for Upper-Floor Load',
      citation: 'BNBC 2020, Part 4, Ch. 3 (Sec 3.9 Stair Capacity)',
      category: 'egress_capacity',
      floorIndex: 1,
      floorLabel: project.floors[1]?.floorLabel || 'L2',
      roomId: null,
      roomName: 'Staircase Core Capacity',
      measuredValue: stairCapacityPersons,
      limitValue: maxUpperFloorLoad,
      unit: 'persons',
      comparator: '>=',
      status: 'FAIL',
      severity: 'critical',
      location: gf.stairs[0]?.centroid || { x: gf.bounds.widthM / 2, y: gf.bounds.heightM / 2 },
      description: `Combined staircase clear width (${stairWidthM.toFixed(2)} m = ${stairCapacityPersons} persons at 7.5 mm/person) is below upper-floor occupant load (${maxUpperFloorLoad} persons).`,
      fixSpec: null,
    });
  } else if (project.floors.length > 1) {
    addedPassed++;
  }

  if (totalHeightM > 20.0) {
    extraViolations.push({
      id: 'viol-highrise-fscd',
      ruleId: 'bnbc_4.4.1_highrise',
      ruleName: 'High-Rise (> 20 m) Fire Lift & FSCD NOC Required',
      citation: 'BNBC 2020, Part 4, Ch. 4 (Sec 4.1 High-Rise Provisions)',
      category: 'fire_access',
      floorIndex: project.floors.length - 1,
      floorLabel: project.floors[project.floors.length - 1]?.floorLabel || 'TOP',
      roomId: null,
      roomName: 'Building Height Trigger',
      measuredValue: Number(totalHeightM.toFixed(1)),
      limitValue: 20.0,
      unit: 'm',
      comparator: '<=',
      status: 'WARN',
      severity: 'medium',
      location: { x: gf.bounds.widthM / 2, y: gf.bounds.heightM / 2 },
      description: `Building stack height (${totalHeightM.toFixed(1)} m) exceeds 20.0 m, triggering mandatory FSCD Fire Safety NOC, pressurized stairs, and dedicated fireman lift.`,
      fixSpec: null,
    });
  }

  const allViolations = [...audit.violations, ...extraViolations];
  const metrics: ZoningAndCapacityMetrics = {
    plotAreaSqM: site.plotAreaSqM,
    groundFootprintSqM,
    totalBuildingAreaSqM,
    mgcPercent,
    maxAllowedMgcPercent,
    achievedFar,
    maxAllowedFar,
    travelLimitM,
    totalOccupantLoad,
    peakFloorLoad,
    groundExitCapacityPersons,
    stairCapacityPersons,
    sprinklered: site.sprinklered,
  };

  return {
    ...audit,
    violations: allViolations,
    passedCount: audit.passedCount + addedPassed,
    failCount: allViolations.filter((v) => v.status === 'FAIL').length,
    warnCount: allViolations.filter((v) => v.status === 'WARN').length,
    floorSummaries: updatedFloorSummaries,
    metrics,
  };
}

function isEgressDoor(d: ParsedFloorPlan['doors'][number]): boolean {
  return (
    d.isExit ||
    (d.isLocked && /STAIR|EXIT|FIRE|EGRESS/.test(d.blockName.toUpperCase()))
  );
}

export function runComplianceAudit(plan: ParsedFloorPlan, travelLimitM = 16.0): ComplianceAudit {
  const violations: Violation[] = [];
  let passedCount = 0;

  const grid = buildNavGrid(plan);
  const escapePaths: Record<string, EscapePathResult> = {};

  // 1. Check all exit / egress doors (BNBC 2020, Part 4, Ch. 3 & BNBC 2012, Part 3, Sec 1.13.8)
  const exitDoors = plan.doors.filter((d) => isEgressDoor(d));
  const unlockedExits = plan.doors.filter((d) => d.isExit && !d.isLocked);

  for (const door of exitDoors) {
    if (door.isLocked) {
      violations.push({
        id: `viol-locked-${door.id}`,
        ruleId: 'bnbc_p4_exit_unobstructed',
        ruleName: 'Locked / Obstructed Fire Exit Door',
        citation: 'BNBC 2020, Part 4, Ch. 3 (Means of Egress, Sec 3.5)',
        category: 'exit_obstruction',
        floorIndex: plan.floorIndex,
        floorLabel: plan.floorLabel,
        roomId: null,
        roomName: door.blockName,
        measuredValue: 0,
        limitValue: 1,
        unit: 'open exit',
        comparator: '>=',
        status: 'FAIL',
        severity: 'critical',
        location: door.position,
        description: `Designated egress door "${door.blockName}" is marked locked/obstructed (0 m effective egress width). Occupants cannot pass through this portal during an emergency.`,
        fixSpec: {
          id: `fix-unlock-${door.id}`,
          targetType: 'door',
          targetId: door.id,
          floorIndex: plan.floorIndex,
          floorLabel: plan.floorLabel,
          action: 'unlock_exit',
          summary: `Unlock "${door.blockName}" and upgrade clear opening to 1.10 m panic-bar egress door`,
          deltaBeforeM: 0,
          deltaAfterM: 1.1,
        },
      });
    } else if (door.widthM < 0.9) {
      violations.push({
        id: `viol-exitwidth-${door.id}`,
        ruleId: 'bnbc_p4_exit_door_width',
        ruleName: 'Exit Door Clear Width Deficit',
        citation: 'BNBC 2020, Part 4, Ch. 3 / Table 4.3.6',
        category: 'passage_width',
        roomId: null,
        roomName: door.blockName,
        measuredValue: door.widthM,
        limitValue: 0.9,
        unit: 'm',
        comparator: '>=',
        status: 'FAIL',
        severity: 'high',
        location: door.position,
        description: `Exit doorway "${door.blockName}" measures ${door.widthM.toFixed(2)} m clear width, below the 0.90 m minimum exit door width.`,
        fixSpec: {
          id: `fix-widen-door-${door.id}`,
          targetType: 'door',
          targetId: door.id,
          action: 'widen_door',
          summary: `Widen exit doorway "${door.blockName}" from ${door.widthM.toFixed(2)} m to 1.10 m`,
          deltaBeforeM: door.widthM,
          deltaAfterM: 1.1,
        },
      });
    } else {
      passedCount++;
    }
  }

  // Dual egress check for industrial / multi-unit floors
  if (unlockedExits.length < 2 && plan.doors.some((d) => d.isExit)) {
    const anchor = exitDoors[0]?.position || {
      x: plan.bounds.widthM / 2,
      y: plan.bounds.heightM / 2,
    };
    violations.push({
      id: 'viol-dual-egress',
      ruleId: 'bnbc_p4_dual_exit_count',
      ruleName: 'Insufficient Independent Unlocked Exits',
      citation: 'BNBC 2020, Part 4, Ch. 3 (Minimum Number of Exits)',
      category: 'exit_obstruction',
      roomId: null,
      roomName: 'Floor Plan Perimeter',
      measuredValue: unlockedExits.length,
      limitValue: 2,
      unit: 'exits',
      comparator: '>=',
      status: 'FAIL',
      severity: 'critical',
      location: anchor,
      description: `Only ${unlockedExits.length} unlocked exit is active on this floor; at least 2 remote unobstructed exits are required to prevent single-point entrapment.`,
      fixSpec: null,
    });
  } else if (unlockedExits.length >= 2) {
    passedCount++;
  }

  // 2. Travel distance check per habitable / work room (BNBC 2012, Part 3, Sec 1.13.8.2)
  let worstEscapeSec = 0;
  let trappedRoomCount = 0;

  for (const room of plan.rooms) {
    const res = computeRoomEscapePath(plan, room, grid);
    escapePaths[room.id] = res;

    if (res.blocked) {
      trappedRoomCount++;
    } else if (res.estimatedTimeSec > worstEscapeSec) {
      worstEscapeSec = res.estimatedTimeSec;
    }

    if (room.taxonomy === 'corridor' || room.taxonomy === 'exit' || room.taxonomy === 'stair') {
      continue;
    }

    if (res.blocked || res.distanceM > travelLimitM) {
      violations.push({
        id: `viol-travel-${room.id}`,
        ruleId: 'bnbc_1.13.8.2_travel_distance',
        ruleName: 'Maximum Travel Distance Exceeded',
        citation: travelLimitM > 16 ? 'BNBC 2020, Part 4, Table 4.3.3 (Sprinklered)' : 'BNBC 2012, Part 3, Sec 1.13.8.2',
        category: 'egress_travel',
        roomId: room.id,
        roomName: room.originalLabel,
        measuredValue: res.blocked ? 99.9 : res.distanceM,
        limitValue: travelLimitM,
        unit: 'm',
        comparator: '<=',
        status: 'FAIL',
        severity: res.blocked || res.distanceM > travelLimitM + 4 ? 'critical' : 'high',
        location: room.centroid,
        description: res.blocked
          ? `Occupants in "${room.originalLabel}" have no reachable unlocked exit.`
          : `Measured A* egress travel distance from "${room.originalLabel}" to nearest unlocked exit (${res.targetExitName}) is ${res.distanceM.toFixed(2)} m, exceeding the ${travelLimitM.toFixed(2)} m BNBC limit by ${(res.distanceM - travelLimitM).toFixed(2)} m.`,
        fixSpec: null,
      });
    } else {
      passedCount++;
    }
  }

  // 3. Passage / corridor pinch-point clear width check (BNBC 2012, Part 3, Sec 1.13.8.2)
  const narrowPassages = detectNarrowPassages(plan);
  if (narrowPassages.length === 0) {
    passedCount++;
  } else {
    for (const pinch of narrowPassages) {
      violations.push({
        id: `viol-passage-${pinch.id}`,
        ruleId: 'bnbc_1.13.8.2_passage_width',
        ruleName: 'Passage Clear Width Below 0.75 m Minimum',
        citation: 'BNBC 2012, Part 3, Sec 1.13.8.2',
        category: 'passage_width',
        roomId: null,
        roomName: 'Corridor Pinch Point',
        measuredValue: pinch.widthM,
        limitValue: 0.75,
        unit: 'm',
        comparator: '>=',
        status: 'FAIL',
        severity: 'high',
        location: pinch.center,
        description: `Wall-to-wall clear corridor width measures ${pinch.widthM.toFixed(2)} m, violating the 0.75 m minimum passage width and creating an evacuation bottleneck.`,
        fixSpec: {
          id: `fix-widen-passage-${pinch.id}`,
          targetType: 'wall',
          targetId: pinch.shiftWallId,
          action: 'widen_passage',
          summary: `Shift partition wall by ${Math.abs(pinch.shiftDy).toFixed(2)} m to widen corridor from ${pinch.widthM.toFixed(2)} m to 1.20 m`,
          deltaBeforeM: pinch.widthM,
          deltaAfterM: 1.2,
          wallShift: {
            wallId: pinch.shiftWallId,
            dx: pinch.shiftDx,
            dy: pinch.shiftDy,
          },
        },
      });
    }
  }

  // 4. Stair geometry checks (BNBC 2012, Part 3, Sec 1.13.5)
  for (const stair of plan.stairs) {
    // Headroom >= 2.15m
    if (stair.headroomM < 2.15) {
      violations.push({
        id: `viol-stair-headroom-${stair.id}`,
        ruleId: 'bnbc_1.13.5_stair_headroom',
        ruleName: 'Staircase Clear Headroom Deficit',
        citation: 'BNBC 2012, Part 3, Sec 1.13.5',
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
        description: `Clear headroom over "${stair.label}" flight is ${stair.headroomM.toFixed(2)} m, below the 2.15 m BNBC minimum.`,
        fixSpec: {
          id: `fix-stair-headroom-${stair.id}`,
          targetType: 'stair',
          targetId: stair.id,
          action: 'adjust_stair',
          summary: `Raise "${stair.label}" soffit clearance from ${stair.headroomM.toFixed(2)} m to 2.25 m`,
          deltaBeforeM: stair.headroomM,
          deltaAfterM: 2.25,
        },
      });
    } else {
      passedCount++;
    }

    // Handrail >= 0.90m
    if (stair.handrailHeightM < 0.9) {
      violations.push({
        id: `viol-stair-handrail-${stair.id}`,
        ruleId: 'bnbc_1.13.5_stair_handrail',
        ruleName: 'Staircase Handrail Height Below 0.90 m',
        citation: 'BNBC 2012, Part 3, Sec 1.13.5',
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
        description: `Handrail height at "${stair.label}" is ${stair.handrailHeightM.toFixed(2)} m, below the 0.90 m BNBC minimum.`,
        fixSpec: {
          id: `fix-stair-handrail-${stair.id}`,
          targetType: 'stair',
          targetId: stair.id,
          action: 'adjust_stair',
          summary: `Raise "${stair.label}" handrail height from ${stair.handrailHeightM.toFixed(2)} m to 0.95 m`,
          deltaBeforeM: stair.handrailHeightM,
          deltaAfterM: 0.95,
        },
      });
    } else {
      passedCount++;
    }

    // Step proportion 2R + T between 610mm and 648mm (Sec 1.13.5)
    const stepProportion = Math.round(2 * stair.riserMm + stair.treadMm);
    if (stepProportion < 610 || stepProportion > 648) {
      violations.push({
        id: `viol-stair-step-${stair.id}`,
        ruleId: 'bnbc_1.13.5_stair_proportion',
        ruleName: 'Stair Riser/Tread Proportion Out of Range',
        citation: 'BNBC 2012, Part 3, Sec 1.13.5',
        category: 'stair_safety',
        roomId: null,
        roomName: stair.label,
        measuredValue: stepProportion,
        limitValue: 610,
        unit: 'mm (2R+T)',
        comparator: '>=',
        status: 'WARN',
        severity: 'medium',
        location: stair.centroid,
        description: `Stair 2R+T proportion (${stair.riserMm} mm riser, ${stair.treadMm} mm tread = ${stepProportion} mm) falls outside the 610–648 mm BNBC comfort band.`,
        fixSpec: null,
      });
    } else {
      passedCount++;
    }
  }

  // 5. DXF Dimension override integrity check
  for (const dim of plan.dimensions) {
    if (dim.isStaleOverride && dim.parsedOverrideM !== null) {
      violations.push({
        id: `viol-dim-${dim.id}`,
        ruleId: 'cad_dimension_override_mismatch',
        ruleName: 'Stale DXF Dimension Label Override',
        citation: 'CAD Geometry Audit (DXF DIMENSION vs Measured)',
        category: 'dimension_integrity',
        roomId: null,
        roomName: `Dimension (${dim.overrideText})`,
        measuredValue: Number(dim.measuredValueM.toFixed(2)),
        limitValue: Number(dim.parsedOverrideM.toFixed(2)),
        unit: 'm',
        comparator: '==',
        status: 'WARN',
        severity: 'medium',
        location: {
          x: (dim.start.x + dim.end.x) / 2,
          y: (dim.start.y + dim.end.y) / 2,
        },
        description: `DXF DIMENSION text was manually overridden to "${dim.overrideText}", but true CAD endpoint geometry measures ${dim.measuredValueM.toFixed(2)} m.`,
        fixSpec: {
          id: `fix-dim-${dim.id}`,
          targetType: 'dimension',
          targetId: dim.id,
          action: 'sync_dimension',
          summary: `Sync dimension text override to true post-remediation geometry (1.20 m)`,
          deltaBeforeM: dim.measuredValueM,
          deltaAfterM: 1.2,
        },
      });
    } else {
      passedCount++;
    }
  }

  const failCount = violations.filter((v) => v.status === 'FAIL').length;
  const warnCount = violations.filter((v) => v.status === 'WARN').length;
  const flIdx = plan.floorIndex ?? 0;
  const flLabel = plan.floorLabel || (flIdx === 0 ? 'GF' : `L${flIdx + 1}`);

  for (const v of violations) {
    if (v.floorIndex === undefined) v.floorIndex = flIdx;
    if (!v.floorLabel) v.floorLabel = flLabel;
    if (v.fixSpec) {
      if (v.fixSpec.floorIndex === undefined) v.fixSpec.floorIndex = flIdx;
      if (!v.fixSpec.floorLabel) v.fixSpec.floorLabel = flLabel;
    }
  }

  return {
    violations,
    passedCount,
    failCount,
    warnCount,
    escapePaths,
    worstEscapeSec,
    trappedRoomCount,
    floorSummaries: [
      {
        floorIndex: flIdx,
        floorLabel: flLabel,
        floorName: plan.floorName || (flIdx === 0 ? 'Ground Floor' : `Level ${flIdx + 1}`),
        failCount,
        warnCount,
        passedCount,
        worstEscapeSec,
        trappedRoomCount,
      },
    ],
  };
}

/**
 * Deterministic multi-floor BNBC fire-egress compliance audit across all floors:
 * - Ground Floor (f = 0): A* to unlocked street exits + dual exit checks
 * - Upper Floors (f > 0): A* to accessible stair cores, vertical shaft continuity,
 *   ground-floor stair discharge path to street, and per-floor corridor/stair/dim checks.
 */
export function runBuildingAudit(project: BuildingProject): ComplianceAudit {
  const travelLimitM = project.siteContext?.sprinklered ? 22.5 : 16.0;

  if (project.floors.length === 0) {
    return {
      violations: [],
      passedCount: 0,
      failCount: 0,
      warnCount: 0,
      escapePaths: {},
      worstEscapeSec: 0,
      trappedRoomCount: 0,
      floorSummaries: [],
    };
  }
  if (project.floors.length === 1) {
    const base = runComplianceAudit(project.floors[0], travelLimitM);
    return appendZoningHabitabilityAndCapacityChecks(project, base, travelLimitM);
  }

  const grids: NavGrid[] = project.floors.map((f) => buildNavGrid(f));
  const violations: Violation[] = [];
  const escapePaths: Record<string, EscapePathResult> = {};
  const floorSummaries: FloorAuditSummary[] = [];

  let totalPassed = 0;
  let buildingWorstSec = 0;
  let totalTrapped = 0;

  const groundFloor = project.floors[0];
  const groundUnlockedExits = groundFloor.doors
    .filter((d) => d.isExit && !d.isLocked)
    .map((d) => ({ id: d.id, name: d.blockName, position: d.position }));

  for (let f = 0; f < project.floors.length; f++) {
    const floor = project.floors[f];
    const floorLabel = floor.floorLabel || (f === 0 ? 'GF' : `L${f + 1}`);
    const floorName = floor.floorName || (f === 0 ? 'Ground Floor' : `Level ${f + 1}`);
    const floorViolations: Violation[] = [];
    let floorPassed = 0;
    let floorWorstSec = 0;
    let floorTrapped = 0;

    // 1. Egress / exit / stair doors on this floor
    const egressDoors = floor.doors.filter((d) => isEgressDoor(d));
    const unlockedFloorExits = floor.doors.filter((d) => d.isExit && !d.isLocked);

    for (const door of egressDoors) {
      if (door.isLocked) {
        floorViolations.push({
          id: `viol-f${f}-locked-${door.id}`,
          ruleId: 'bnbc_p4_exit_unobstructed',
          ruleName: 'Locked / Obstructed Fire Egress Door',
          citation: 'BNBC 2020, Part 4, Ch. 3 (Means of Egress, Sec 3.5)',
          category: 'exit_obstruction',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: door.blockName,
          measuredValue: 0,
          limitValue: 1,
          unit: 'open exit',
          comparator: '>=',
          status: 'FAIL',
          severity: 'critical',
          location: door.position,
          description: `On ${floorLabel}, egress door "${door.blockName}" is locked/obstructed (0 m effective width), blocking evacuation.`,
          fixSpec: {
            id: `fix-f${f}-unlock-${door.id}`,
            targetType: 'door',
            targetId: door.id,
            floorIndex: f,
            floorLabel,
            action: 'unlock_exit',
            summary: `[${floorLabel}] Unlock "${door.blockName}" and upgrade to 1.10 m panic-bar egress door`,
            deltaBeforeM: 0,
            deltaAfterM: 1.1,
          },
        });
      } else if (door.widthM < 0.9) {
        floorViolations.push({
          id: `viol-f${f}-exitwidth-${door.id}`,
          ruleId: 'bnbc_p4_exit_door_width',
          ruleName: 'Exit Door Clear Width Deficit',
          citation: 'BNBC 2020, Part 4, Ch. 3 / Table 4.3.6',
          category: 'passage_width',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: door.blockName,
          measuredValue: door.widthM,
          limitValue: 0.9,
          unit: 'm',
          comparator: '>=',
          status: 'FAIL',
          severity: 'high',
          location: door.position,
          description: `On ${floorLabel}, exit doorway "${door.blockName}" measures ${door.widthM.toFixed(2)} m clear width, below the 0.90 m minimum.`,
          fixSpec: {
            id: `fix-f${f}-widen-door-${door.id}`,
            targetType: 'door',
            targetId: door.id,
            floorIndex: f,
            floorLabel,
            action: 'widen_door',
            summary: `[${floorLabel}] Widen "${door.blockName}" from ${door.widthM.toFixed(2)} m to 1.10 m`,
            deltaBeforeM: door.widthM,
            deltaAfterM: 1.1,
          },
        });
      } else {
        floorPassed++;
      }
    }

    // 2. Dual independent egress check (Ground: >=2 street exits; Upper: >=2 continuous accessible stairs)
    if (f === 0) {
      if (unlockedFloorExits.length < 2 && floor.doors.some((d) => d.isExit)) {
        const anchor = floor.doors.find((d) => d.isExit)?.position || {
          x: floor.bounds.widthM / 2,
          y: floor.bounds.heightM / 2,
        };
        floorViolations.push({
          id: `viol-f${f}-dual-egress`,
          ruleId: 'bnbc_p4_dual_exit_count',
          ruleName: 'Insufficient Independent Unlocked Exits',
          citation: 'BNBC 2020, Part 4, Ch. 3 (Minimum Number of Exits)',
          category: 'exit_obstruction',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: `${floorLabel} Perimeter`,
          measuredValue: unlockedFloorExits.length,
          limitValue: 2,
          unit: 'exits',
          comparator: '>=',
          status: 'FAIL',
          severity: 'critical',
          location: anchor,
          description: `Only ${unlockedFloorExits.length} unlocked exterior exit is active on ${floorLabel}; at least 2 remote unobstructed street exits are required.`,
          fixSpec: null,
        });
      } else if (unlockedFloorExits.length >= 2) {
        floorPassed++;
      }
    } else {
      // Check each upper-floor stair core for vertical shaft continuity, floor reachability, & ground discharge
      const corridorAnchor =
        floor.rooms.find((r) => r.taxonomy === 'corridor' || r.taxonomy === 'lobby')?.centroid ||
        floor.rooms[0]?.centroid;
      let activeContinuousStairs = 0;

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
          floorViolations.push({
            id: `viol-f${f}-continuity-${stair.id}`,
            ruleId: 'bnbc_p4_stair_continuity',
            ruleName: 'Discontinuous Vertical Stair Shaft',
            citation: 'BNBC 2020, Part 4, Ch. 3 (Vertical Exit Enclosures)',
            category: 'stair_safety',
            floorIndex: f,
            floorLabel,
            roomId: null,
            roomName: stair.label,
            measuredValue: 0,
            limitValue: 1,
            unit: 'continuous shaft',
            comparator: '>=',
            status: 'FAIL',
            severity: 'critical',
            location: stair.centroid,
            description: `"${stair.label}" on ${floorLabel} does not align vertically with a continuous stair core down to Ground Floor.`,
            fixSpec: null,
          });
          continue;
        }

        const reachableOnFloor = corridorAnchor
          ? !computePathBetweenPoints(grids[f], corridorAnchor, [
              { id: stair.id, name: stair.label, position: stair.centroid },
            ]).blocked
          : true;

        const dischargeRes = computePathBetweenPoints(
          grids[0],
          current.centroid,
          groundUnlockedExits
        );

        if (dischargeRes.blocked) {
          floorViolations.push({
            id: `viol-f${f}-discharge-${stair.id}`,
            ruleId: 'bnbc_p4_stair_discharge',
            ruleName: 'Blocked Stair Ground-Level Discharge',
            citation: 'BNBC 2020, Part 4, Ch. 3 (Exit Discharge)',
            category: 'exit_obstruction',
            floorIndex: 0,
            floorLabel: groundFloor.floorLabel || 'GF',
            roomId: null,
            roomName: `${stair.label} Discharge`,
            measuredValue: 0,
            limitValue: 1,
            unit: 'open discharge',
            comparator: '>=',
            status: 'FAIL',
            severity: 'critical',
            location: current.centroid,
            description: `Stair core "${stair.label}" serving ${floorLabel} cannot discharge to an open street exit at Ground Floor because its ground exit path is locked or blocked.`,
            fixSpec: null,
          });
        } else if (reachableOnFloor) {
          activeContinuousStairs++;
          floorPassed++;
        }
      }

      if (activeContinuousStairs < 2) {
        floorViolations.push({
          id: `viol-f${f}-dual-stairs`,
          ruleId: 'bnbc_p4_dual_exit_count',
          ruleName: 'Insufficient Accessible Independent Stair Cores',
          citation: 'BNBC 2020, Part 4, Ch. 3 (Minimum Number of Exits)',
          category: 'exit_obstruction',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: `${floorLabel} Egress Cores`,
          measuredValue: activeContinuousStairs,
          limitValue: 2,
          unit: 'stair cores',
          comparator: '>=',
          status: 'FAIL',
          severity: 'critical',
          location: floor.stairs[0]?.centroid || {
            x: floor.bounds.widthM / 2,
            y: floor.bounds.heightM / 2,
          },
          description: `Only ${activeContinuousStairs} stair core on ${floorLabel} has both an unlocked floor entry and unblocked Ground Floor discharge; 2 independent egress cores are required.`,
          fixSpec: null,
        });
      }
    }

    // 3. Per-room multi-floor A* travel path check
    for (const room of floor.rooms) {
      const res = computeMultiFloorRoomEscapePath(
        project.floors,
        f,
        room,
        grids,
        project.storyHeightM
      );
      escapePaths[room.id] = res;

      if (res.blocked) {
        floorTrapped++;
      } else if (res.estimatedTimeSec > floorWorstSec) {
        floorWorstSec = res.estimatedTimeSec;
      }

      if (room.taxonomy === 'corridor' || room.taxonomy === 'exit' || room.taxonomy === 'stair') {
        continue;
      }

      const horizDist = res.floorDistanceM ?? res.distanceM;
      if (res.blocked || horizDist > travelLimitM) {
        floorViolations.push({
          id: `viol-f${f}-travel-${room.id}`,
          ruleId: 'bnbc_1.13.8.2_travel_distance',
          ruleName: 'Maximum Travel Distance Exceeded',
          citation: travelLimitM > 16 ? 'BNBC 2020, Part 4, Table 4.3.3 (Sprinklered)' : 'BNBC 2012, Part 3, Sec 1.13.8.2',
          category: 'egress_travel',
          floorIndex: f,
          floorLabel,
          roomId: room.id,
          roomName: room.originalLabel,
          measuredValue: res.blocked ? 99.9 : horizDist,
          limitValue: travelLimitM,
          unit: 'm',
          comparator: '<=',
          status: 'FAIL',
          severity: res.blocked || horizDist > travelLimitM + 4 ? 'critical' : 'high',
          location: room.centroid,
          description: res.blocked
            ? `Occupants in "${room.originalLabel}" (${floorLabel}) have no continuous unblocked escape route to street level (${res.blockedReason || 'blocked'}).`
            : `Horizontal A* travel on ${floorLabel} from "${room.originalLabel}" to nearest accessible ${
                f === 0 ? 'exit' : 'stair core'
              } (${res.viaStairLabel || res.targetExitName}) is ${horizDist.toFixed(2)} m, exceeding the ${travelLimitM.toFixed(2)} m limit (total building escape: ${res.distanceM.toFixed(1)} m / ${res.estimatedTimeSec.toFixed(1)} s).`,
          fixSpec: null,
        });
      } else {
        floorPassed++;
      }
    }

    // 4. Narrow corridor pinch-point checks
    const narrowPassages = detectNarrowPassages(floor);
    if (narrowPassages.length === 0) {
      floorPassed++;
    } else {
      for (const pinch of narrowPassages) {
        floorViolations.push({
          id: `viol-f${f}-passage-${pinch.id}`,
          ruleId: 'bnbc_1.13.8.2_passage_width',
          ruleName: 'Passage Clear Width Below 0.75 m Minimum',
          citation: 'BNBC 2012, Part 3, Sec 1.13.8.2',
          category: 'passage_width',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: 'Corridor Pinch Point',
          measuredValue: pinch.widthM,
          limitValue: 0.75,
          unit: 'm',
          comparator: '>=',
          status: 'FAIL',
          severity: 'high',
          location: pinch.center,
          description: `On ${floorLabel}, wall-to-wall clear corridor width measures ${pinch.widthM.toFixed(2)} m, violating the 0.75 m minimum passage width.`,
          fixSpec: {
            id: `fix-f${f}-widen-passage-${pinch.id}`,
            targetType: 'wall',
            targetId: pinch.shiftWallId,
            floorIndex: f,
            floorLabel,
            action: 'widen_passage',
            summary: `[${floorLabel}] Shift partition wall by ${Math.abs(pinch.shiftDy).toFixed(2)} m to widen corridor from ${pinch.widthM.toFixed(2)} m to 1.20 m`,
            deltaBeforeM: pinch.widthM,
            deltaAfterM: 1.2,
            wallShift: {
              wallId: pinch.shiftWallId,
              dx: pinch.shiftDx,
              dy: pinch.shiftDy,
            },
          },
        });
      }
    }

    // 5. Stair headroom, handrail, and 2R+T proportion checks
    for (const stair of floor.stairs) {
      if (stair.headroomM < 2.15) {
        floorViolations.push({
          id: `viol-f${f}-stair-headroom-${stair.id}`,
          ruleId: 'bnbc_1.13.5_stair_headroom',
          ruleName: 'Staircase Clear Headroom Deficit',
          citation: 'BNBC 2012, Part 3, Sec 1.13.5',
          category: 'stair_safety',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: stair.label,
          measuredValue: stair.headroomM,
          limitValue: 2.15,
          unit: 'm',
          comparator: '>=',
          status: 'FAIL',
          severity: 'high',
          location: stair.centroid,
          description: `On ${floorLabel}, clear headroom over "${stair.label}" is ${stair.headroomM.toFixed(2)} m, below the 2.15 m BNBC minimum.`,
          fixSpec: {
            id: `fix-f${f}-stair-headroom-${stair.id}`,
            targetType: 'stair',
            targetId: stair.id,
            floorIndex: f,
            floorLabel,
            action: 'adjust_stair',
            summary: `[${floorLabel}] Raise "${stair.label}" soffit clearance from ${stair.headroomM.toFixed(2)} m to 2.25 m`,
            deltaBeforeM: stair.headroomM,
            deltaAfterM: 2.25,
          },
        });
      } else {
        floorPassed++;
      }

      if (stair.handrailHeightM < 0.9) {
        floorViolations.push({
          id: `viol-f${f}-stair-handrail-${stair.id}`,
          ruleId: 'bnbc_1.13.5_stair_handrail',
          ruleName: 'Staircase Handrail Height Below 0.90 m',
          citation: 'BNBC 2012, Part 3, Sec 1.13.5',
          category: 'stair_safety',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: stair.label,
          measuredValue: stair.handrailHeightM,
          limitValue: 0.9,
          unit: 'm',
          comparator: '>=',
          status: 'FAIL',
          severity: 'medium',
          location: stair.centroid,
          description: `On ${floorLabel}, handrail height at "${stair.label}" is ${stair.handrailHeightM.toFixed(2)} m, below the 0.90 m BNBC minimum.`,
          fixSpec: {
            id: `fix-f${f}-stair-handrail-${stair.id}`,
            targetType: 'stair',
            targetId: stair.id,
            floorIndex: f,
            floorLabel,
            action: 'adjust_stair',
            summary: `[${floorLabel}] Raise "${stair.label}" handrail height from ${stair.handrailHeightM.toFixed(2)} m to 0.95 m`,
            deltaBeforeM: stair.handrailHeightM,
            deltaAfterM: 0.95,
          },
        });
      } else {
        floorPassed++;
      }

      const stepProportion = Math.round(2 * stair.riserMm + stair.treadMm);
      if (stepProportion < 610 || stepProportion > 648) {
        floorViolations.push({
          id: `viol-f${f}-stair-step-${stair.id}`,
          ruleId: 'bnbc_1.13.5_stair_proportion',
          ruleName: 'Stair Riser/Tread Proportion Out of Range',
          citation: 'BNBC 2012, Part 3, Sec 1.13.5',
          category: 'stair_safety',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: stair.label,
          measuredValue: stepProportion,
          limitValue: 610,
          unit: 'mm (2R+T)',
          comparator: '>=',
          status: 'WARN',
          severity: 'medium',
          location: stair.centroid,
          description: `On ${floorLabel}, stair 2R+T proportion (${stair.riserMm} mm riser, ${stair.treadMm} mm tread = ${stepProportion} mm) falls outside the 610–648 mm BNBC comfort band.`,
          fixSpec: null,
        });
      } else {
        floorPassed++;
      }
    }

    // 6. DXF Dimension override integrity check
    for (const dim of floor.dimensions) {
      if (dim.isStaleOverride && dim.parsedOverrideM !== null) {
        floorViolations.push({
          id: `viol-f${f}-dim-${dim.id}`,
          ruleId: 'cad_dimension_override_mismatch',
          ruleName: 'Stale DXF Dimension Label Override',
          citation: 'CAD Geometry Audit (DXF DIMENSION vs Measured)',
          category: 'dimension_integrity',
          floorIndex: f,
          floorLabel,
          roomId: null,
          roomName: `Dimension (${dim.overrideText})`,
          measuredValue: Number(dim.measuredValueM.toFixed(2)),
          limitValue: Number(dim.parsedOverrideM.toFixed(2)),
          unit: 'm',
          comparator: '==',
          status: 'WARN',
          severity: 'medium',
          location: {
            x: (dim.start.x + dim.end.x) / 2,
            y: (dim.start.y + dim.end.y) / 2,
          },
          description: `On ${floorLabel}, DXF DIMENSION text was manually overridden to "${dim.overrideText}", while CAD endpoints measure ${dim.measuredValueM.toFixed(2)} m.`,
          fixSpec: {
            id: `fix-f${f}-dim-${dim.id}`,
            targetType: 'dimension',
            targetId: dim.id,
            floorIndex: f,
            floorLabel,
            action: 'sync_dimension',
            summary: `[${floorLabel}] Sync dimension text override to true post-remediation geometry (1.20 m)`,
            deltaBeforeM: dim.measuredValueM,
            deltaAfterM: 1.2,
          },
        });
      } else {
        floorPassed++;
      }
    }

    const fFail = floorViolations.filter((v) => v.status === 'FAIL').length;
    const fWarn = floorViolations.filter((v) => v.status === 'WARN').length;
    floorSummaries.push({
      floorIndex: f,
      floorLabel,
      floorName,
      failCount: fFail,
      warnCount: fWarn,
      passedCount: floorPassed,
      worstEscapeSec: floorWorstSec,
      trappedRoomCount: floorTrapped,
    });

    violations.push(...floorViolations);
    totalPassed += floorPassed;
    totalTrapped += floorTrapped;
    if (floorWorstSec > buildingWorstSec) buildingWorstSec = floorWorstSec;
  }

  const multiFloorAudit: ComplianceAudit = {
    violations,
    passedCount: totalPassed,
    failCount: violations.filter((v) => v.status === 'FAIL').length,
    warnCount: violations.filter((v) => v.status === 'WARN').length,
    escapePaths,
    worstEscapeSec: buildingWorstSec,
    trappedRoomCount: totalTrapped,
    floorSummaries,
  };

  return appendZoningHabitabilityAndCapacityChecks(project, multiFloorAudit, travelLimitM);
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
      const shiftY = fix.wallShift.dy;
      const shiftX = fix.wallShift.dx;
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
    } else if (fix.targetType === 'stair') {
      const stair = fixedPlan.stairs.find((s) => s.id === fix.targetId);
      if (stair) {
        if (v.ruleId === 'bnbc_1.13.5_stair_headroom') {
          stair.headroomM = 2.25;
        }
        if (v.ruleId === 'bnbc_1.13.5_stair_handrail') {
          stair.handrailHeightM = 0.95;
        }
      }
    } else if (fix.targetType === 'dimension') {
      const dim = fixedPlan.dimensions.find((d) => d.id === fix.targetId);
      if (dim) {
        dim.measuredValueM = fix.deltaAfterM || 1.2;
        dim.overrideText = `${(fix.deltaAfterM || 1.2).toFixed(2)}m`;
        dim.parsedOverrideM = fix.deltaAfterM || 1.2;
        dim.isStaleOverride = false;
      }
    }
  }

  return deltas;
}

/**
 * Applies deterministic geometric transforms to a cloned ParsedFloorPlan JSON
 * (never mutating the original DXF file) to produce a compliant Before/After comparison.
 */
export function applyRemediationFixes(
  plan: ParsedFloorPlan,
  audit: ComplianceAudit
): { fixedPlan: ParsedFloorPlan; deltas: RemediationDelta[] } {
  const fixedPlan: ParsedFloorPlan = JSON.parse(JSON.stringify(plan));
  const deltas = applyFixesToFloor(fixedPlan, audit.violations);
  return { fixedPlan, deltas };
}

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
