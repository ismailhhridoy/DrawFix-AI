import type {
  EscapePathResult,
  ParsedFloorPlan,
  Point2D,
  Point3D,
  RoomEntity,
  StairEntity,
} from '../types/plan';

const CELL_SIZE = 0.2; // 20 cm navigation grid

function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export interface NavGrid {
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  blocked: Uint8Array;
  wallClearanceM: Float32Array;
}

export function buildNavGrid(plan: ParsedFloorPlan): NavGrid {
  const minX = plan.bounds.minX;
  const minY = plan.bounds.minY;
  const cols = Math.max(10, Math.ceil(plan.bounds.widthM / CELL_SIZE) + 1);
  const rows = Math.max(10, Math.ceil(plan.bounds.heightM / CELL_SIZE) + 1);
  const blocked = new Uint8Array(cols * rows);
  const wallClearanceM = new Float32Array(cols * rows);

  // Mark wall cells (keep door openings passable unless door is locked!)
  for (let r = 0; r < rows; r++) {
    const wy = minY + (r + 0.5) * CELL_SIZE;
    for (let c = 0; c < cols; c++) {
      const wx = minX + (c + 0.5) * CELL_SIZE;
      const idx = r * cols + c;
      let minWallDist = Infinity;

      for (const w of plan.walls) {
        const d = pointToSegmentDist({ x: wx, y: wy }, w.start, w.end);
        if (d < minWallDist) minWallDist = d;
      }

      // Check if cell falls inside an unlocked door opening
      let insideUnlockedDoor = false;
      let insideLockedDoor = false;
      for (const door of plan.doors) {
        const dDoor = Math.hypot(wx - door.position.x, wy - door.position.y);
        if (dDoor <= Math.max(0.45, door.widthM * 0.52)) {
          if (door.isLocked) {
            insideLockedDoor = true;
          } else {
            insideUnlockedDoor = true;
          }
        }
      }

      wallClearanceM[idx] = minWallDist;
      if (insideLockedDoor) {
        blocked[idx] = 1;
      } else if (!insideUnlockedDoor && minWallDist < 0.14) {
        blocked[idx] = 1;
      }
    }
  }

  return { cols, rows, minX, minY, blocked, wallClearanceM };
}

function worldToCell(grid: NavGrid, pt: Point2D): { c: number; r: number } {
  const c = Math.max(0, Math.min(grid.cols - 1, Math.floor((pt.x - grid.minX) / CELL_SIZE)));
  const r = Math.max(0, Math.min(grid.rows - 1, Math.floor((pt.y - grid.minY) / CELL_SIZE)));
  return { c, r };
}

function cellToWorld(grid: NavGrid, c: number, r: number): Point2D {
  return {
    x: Number((grid.minX + (c + 0.5) * CELL_SIZE).toFixed(2)),
    y: Number((grid.minY + (r + 0.5) * CELL_SIZE).toFixed(2)),
  };
}

function findNearestWalkable(grid: NavGrid, c0: number, r0: number): { c: number; r: number } | null {
  if (grid.blocked[r0 * grid.cols + c0] === 0) return { c: c0, r: r0 };
  for (let rad = 1; rad <= 10; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c >= 0 && c < grid.cols && r >= 0 && r < grid.rows) {
          if (grid.blocked[r * grid.cols + c] === 0) return { c, r };
        }
      }
    }
  }
  return null;
}

function simplifyPath(pts: Point2D[]): Point2D[] {
  if (pts.length <= 2) return pts;
  const out: Point2D[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const cross = Math.abs(d1x * d2y - d1y * d2x);
    const len = Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y);
    if (len < 1e-6 || cross / len > 0.08) {
      out.push(curr);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export interface AStarTarget {
  id: string;
  name: string;
  position: Point2D;
}

export interface SingleFloorPathResult {
  blocked: boolean;
  blockedReason?: string;
  target: AStarTarget | null;
  path: Point2D[];
  distanceM: number;
  bottleneckCount: number;
}

export function computePathBetweenPoints(
  grid: NavGrid,
  startPt: Point2D,
  targets: AStarTarget[]
): SingleFloorPathResult {
  if (targets.length === 0) {
    return {
      blocked: true,
      blockedReason: 'No unlocked egress target available on this floor.',
      target: null,
      path: [startPt],
      distanceM: Infinity,
      bottleneckCount: 0,
    };
  }

  const startRaw = worldToCell(grid, startPt);
  const startCell = findNearestWalkable(grid, startRaw.c, startRaw.r);
  if (!startCell) {
    return {
      blocked: true,
      blockedReason: 'Origin centroid is sealed with no walkable opening.',
      target: null,
      path: [startPt],
      distanceM: Infinity,
      bottleneckCount: 0,
    };
  }

  const goalCells = new Map<number, AStarTarget>();
  for (const tgt of targets) {
    const raw = worldToCell(grid, tgt.position);
    const walkable = findNearestWalkable(grid, raw.c, raw.r);
    if (walkable) {
      goalCells.set(walkable.r * grid.cols + walkable.c, tgt);
    }
  }

  if (goalCells.size === 0) {
    return {
      blocked: true,
      blockedReason: 'No walkable egress portal reachable.',
      target: null,
      path: [startPt],
      distanceM: Infinity,
      bottleneckCount: 0,
    };
  }

  const total = grid.cols * grid.rows;
  const gScore = new Float32Array(total);
  gScore.fill(Infinity);
  const parent = new Int32Array(total);
  parent.fill(-1);
  const closed = new Uint8Array(total);

  const startIdx = startCell.r * grid.cols + startCell.c;
  gScore[startIdx] = 0;

  const openIdx: number[] = [startIdx];
  const openF: number[] = [0];

  const pushHeap = (idx: number, f: number) => {
    openIdx.push(idx);
    openF.push(f);
    let i = openIdx.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (openF[p] <= openF[i]) break;
      [openIdx[p], openIdx[i]] = [openIdx[i], openIdx[p]];
      [openF[p], openF[i]] = [openF[i], openF[p]];
      i = p;
    }
  };

  const popHeap = (): number => {
    const top = openIdx[0];
    const lastIdx = openIdx.pop()!;
    const lastF = openF.pop()!;
    if (openIdx.length > 0) {
      openIdx[0] = lastIdx;
      openF[0] = lastF;
      let i = 0;
      const n = openIdx.length;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < n && openF[l] < openF[smallest]) smallest = l;
        if (r < n && openF[r] < openF[smallest]) smallest = r;
        if (smallest === i) break;
        [openIdx[i], openIdx[smallest]] = [openIdx[smallest], openIdx[i]];
        [openF[i], openF[smallest]] = [openF[smallest], openF[i]];
        i = smallest;
      }
    }
    return top;
  };

  const heuristic = (c: number, r: number) => {
    let best = Infinity;
    const wx = grid.minX + (c + 0.5) * CELL_SIZE;
    const wy = grid.minY + (r + 0.5) * CELL_SIZE;
    for (const tgt of targets) {
      const d = Math.hypot(wx - tgt.position.x, wy - tgt.position.y);
      if (d < best) best = d;
    }
    return best;
  };

  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];

  let reachedGoalIdx = -1;
  while (openIdx.length > 0) {
    const curr = popHeap();
    if (closed[curr]) continue;
    closed[curr] = 1;

    if (goalCells.has(curr)) {
      reachedGoalIdx = curr;
      break;
    }

    const cc = curr % grid.cols;
    const cr = Math.floor(curr / grid.cols);

    for (const [dc, dr, stepMult] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;
      const nIdx = nr * grid.cols + nc;
      if (grid.blocked[nIdx] || closed[nIdx]) continue;

      if (dc !== 0 && dr !== 0) {
        if (
          grid.blocked[cr * grid.cols + nc] ||
          grid.blocked[nr * grid.cols + cc]
        ) {
          continue;
        }
      }

      const clearance = grid.wallClearanceM[nIdx];
      const clearancePenalty = clearance < 0.35 ? 0.12 : 0;
      const tentativeG = gScore[curr] + stepMult * CELL_SIZE + clearancePenalty;

      if (tentativeG < gScore[nIdx]) {
        gScore[nIdx] = tentativeG;
        parent[nIdx] = curr;
        pushHeap(nIdx, tentativeG + heuristic(nc, nr));
      }
    }
  }

  if (reachedGoalIdx === -1) {
    return {
      blocked: true,
      blockedReason: 'Locked exit or sealed partition blocks all paths.',
      target: null,
      path: [startPt],
      distanceM: Infinity,
      bottleneckCount: 0,
    };
  }

  const rawCells: number[] = [];
  let trace = reachedGoalIdx;
  while (trace !== -1) {
    rawCells.push(trace);
    trace = parent[trace];
  }
  rawCells.reverse();

  const target = goalCells.get(reachedGoalIdx)!;
  const worldPts: Point2D[] = rawCells.map((idx) =>
    cellToWorld(grid, idx % grid.cols, Math.floor(idx / grid.cols))
  );
  worldPts[0] = startPt;
  worldPts[worldPts.length - 1] = target.position;

  let distanceM = 0;
  let bottleneckCells = 0;
  for (let i = 1; i < worldPts.length; i++) {
    distanceM += Math.hypot(
      worldPts[i].x - worldPts[i - 1].x,
      worldPts[i].y - worldPts[i - 1].y
    );
  }
  for (const idx of rawCells) {
    if (grid.wallClearanceM[idx] < 0.36) {
      bottleneckCells++;
    }
  }

  return {
    blocked: false,
    target,
    path: simplifyPath(worldPts),
    distanceM: Number(distanceM.toFixed(2)),
    bottleneckCount: bottleneckCells >= 3 ? 1 : 0,
  };
}

export function findMatchingLowerStair(
  upperStair: StairEntity,
  lowerPlan: ParsedFloorPlan
): StairEntity | null {
  let best: StairEntity | null = null;
  let bestDist = Infinity;
  for (const cand of lowerPlan.stairs) {
    const d = Math.hypot(
      cand.centroid.x - upperStair.centroid.x,
      cand.centroid.y - upperStair.centroid.y
    );
    if (d <= 2.5 && d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best;
}

export function computeRoomEscapePath(
  plan: ParsedFloorPlan,
  room: RoomEntity,
  grid: NavGrid
): EscapePathResult {
  const floorIdx = plan.floorIndex ?? 0;
  const floorLabel = plan.floorLabel || (floorIdx === 0 ? 'GF' : `L${floorIdx + 1}`);
  const unlockedExits: AStarTarget[] = plan.doors
    .filter((d) => d.isExit && !d.isLocked)
    .map((d) => ({ id: d.id, name: d.blockName, position: d.position }));

  if (unlockedExits.length === 0) {
    return {
      roomId: room.id,
      roomName: room.originalLabel,
      floorIndex: floorIdx,
      floorLabel,
      start: room.centroid,
      targetExitId: null,
      targetExitName: 'No unlocked exit',
      blocked: true,
      blockedReason: 'All designated exits are locked or obstructed.',
      path: [room.centroid],
      path3D: [{ x: room.centroid.x, y: room.centroid.y, floorIndex: floorIdx, localElevationM: 0.14 }],
      floorDistanceM: Infinity,
      stairDescentDistM: 0,
      groundDischargeDistM: 0,
      distanceM: Infinity,
      estimatedTimeSec: Infinity,
      walkingSpeedMps: 0,
      bottleneckCount: 0,
    };
  }

  const res = computePathBetweenPoints(grid, room.centroid, unlockedExits);
  if (res.blocked || !res.target) {
    return {
      roomId: room.id,
      roomName: room.originalLabel,
      floorIndex: floorIdx,
      floorLabel,
      start: room.centroid,
      targetExitId: null,
      targetExitName: 'No reachable unlocked exit',
      blocked: true,
      blockedReason: res.blockedReason || 'Locked exit or sealed partition blocks all paths from this room.',
      path: [room.centroid],
      path3D: [{ x: room.centroid.x, y: room.centroid.y, floorIndex: floorIdx, localElevationM: 0.14 }],
      floorDistanceM: Infinity,
      stairDescentDistM: 0,
      groundDischargeDistM: 0,
      distanceM: Infinity,
      estimatedTimeSec: Infinity,
      walkingSpeedMps: 0,
      bottleneckCount: 0,
    };
  }

  const walkingSpeedMps = res.bottleneckCount > 0 ? 0.92 : 1.2;
  const estimatedTimeSec = Number((res.distanceM / walkingSpeedMps).toFixed(1));

  return {
    roomId: room.id,
    roomName: room.originalLabel,
    floorIndex: floorIdx,
    floorLabel,
    start: room.centroid,
    targetExitId: res.target.id,
    targetExitName: res.target.name,
    blocked: false,
    path: res.path,
    path3D: res.path.map((p) => ({
      x: p.x,
      y: p.y,
      floorIndex: floorIdx,
      localElevationM: 0.14,
    })),
    floorDistanceM: res.distanceM,
    stairDescentDistM: 0,
    groundDischargeDistM: 0,
    distanceM: res.distanceM,
    estimatedTimeSec,
    walkingSpeedMps,
    bottleneckCount: res.bottleneckCount,
  };
}

/**
 * Computes end-to-end 3D escape trajectory for a room on any floor:
 * - Ground floor (floorIdx === 0): A* to unlocked Ground exterior exit.
 * - Upper floor (floorIdx > 0): A* on origin floor to an accessible Stair Core,
 *   continuous vertical shaft descent down to Ground Floor, and Ground Floor A*
 *   discharge to the nearest unlocked street exit.
 */
export function computeMultiFloorRoomEscapePath(
  floors: ParsedFloorPlan[],
  floorIdx: number,
  room: RoomEntity,
  grids: NavGrid[],
  storyHeightM = 3.2
): EscapePathResult {
  const floor = floors[floorIdx];
  const floorLabel = floor.floorLabel || (floorIdx === 0 ? 'GF' : `L${floorIdx + 1}`);

  if (floorIdx === 0) {
    return computeRoomEscapePath(floor, room, grids[0]);
  }

  const groundFloor = floors[0];
  const groundGrid = grids[0];
  const groundUnlockedExits: AStarTarget[] = groundFloor.doors
    .filter((d) => d.isExit && !d.isLocked)
    .map((d) => ({ id: d.id, name: d.blockName, position: d.position }));

  let bestResult: EscapePathResult | null = null;
  let failureReasons: string[] = [];

  for (const upperStair of floor.stairs) {
    // 1. Horizontal A* on origin floor to this stair core
    const floorPath = computePathBetweenPoints(grids[floorIdx], room.centroid, [
      { id: upperStair.id, name: upperStair.label, position: upperStair.centroid },
    ]);
    if (floorPath.blocked) {
      failureReasons.push(`${upperStair.label} unreachable on ${floorLabel}`);
      continue;
    }

    // 2. Check vertical stair continuity down to Ground Floor
    const shaftStairs: { floorIndex: number; stair: StairEntity }[] = [
      { floorIndex: floorIdx, stair: upperStair },
    ];
    let currentStair: StairEntity | null = upperStair;
    let shaftBroken = false;
    for (let k = floorIdx - 1; k >= 0; k--) {
      const lowerMatch: StairEntity | null = currentStair
        ? findMatchingLowerStair(currentStair, floors[k])
        : null;
      if (!lowerMatch) {
        shaftBroken = true;
        break;
      }
      shaftStairs.push({ floorIndex: k, stair: lowerMatch });
      currentStair = lowerMatch;
    }
    if (shaftBroken || !currentStair) {
      failureReasons.push(`${upperStair.label} shaft discontinuous below ${floorLabel}`);
      continue;
    }

    // 3. Ground Floor discharge A* from base of stair core to unlocked exterior exit
    const groundStair = currentStair;
    const dischargePath = computePathBetweenPoints(
      groundGrid,
      groundStair.centroid,
      groundUnlockedExits
    );
    if (dischargePath.blocked || !dischargePath.target) {
      failureReasons.push(`${upperStair.label} ground discharge blocked`);
      continue;
    }

    // 4. Combine metrics + build continuous 3D waypoints down the stairwell
    const floorSpeed = floorPath.bottleneckCount > 0 ? 0.92 : 1.2;
    const groundSpeed = dischargePath.bottleneckCount > 0 ? 0.92 : 1.2;
    const stairRunPerStory = Math.hypot(storyHeightM, 4.2);
    const stairDescentDistM = Number((floorIdx * stairRunPerStory).toFixed(2));
    const stairSpeed = 0.75; // realistic downward stair evacuation speed (m/s)
    const totalDistM = Number(
      (floorPath.distanceM + stairDescentDistM + dischargePath.distanceM).toFixed(2)
    );
    const totalTimeSec = Number(
      (
        floorPath.distanceM / floorSpeed +
        stairDescentDistM / stairSpeed +
        dischargePath.distanceM / groundSpeed
      ).toFixed(1)
    );

    const path3D: Point3D[] = [
      ...floorPath.path.map((p) => ({
        x: p.x,
        y: p.y,
        floorIndex: floorIdx,
        localElevationM: 0.14,
      })),
    ];

    // Add descending stair flight waypoints for each story down to GF
    for (let k = 0; k < shaftStairs.length - 1; k++) {
      const upper = shaftStairs[k];
      const lower = shaftStairs[k + 1];
      const xs = upper.stair.polygon.map((p) => p.x);
      const ys = upper.stair.polygon.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const midX = (minX + maxX) / 2;
      const yNorth = minY + (maxY - minY) * 0.72;
      const ySouth = minY + (maxY - minY) * 0.28;

      path3D.push(
        {
          x: midX,
          y: yNorth,
          floorIndex: upper.floorIndex,
          localElevationM: 0.14,
        },
        {
          x: midX,
          y: ySouth,
          floorIndex: lower.floorIndex,
          localElevationM: storyHeightM * 0.5,
        },
        {
          x: lower.stair.centroid.x,
          y: lower.stair.centroid.y,
          floorIndex: lower.floorIndex,
          localElevationM: 0.14,
        }
      );
    }

    // Add Ground Floor discharge path
    for (let i = 1; i < dischargePath.path.length; i++) {
      const pt = dischargePath.path[i];
      path3D.push({
        x: pt.x,
        y: pt.y,
        floorIndex: 0,
        localElevationM: 0.14,
      });
    }

    const candidate: EscapePathResult = {
      roomId: room.id,
      roomName: room.originalLabel,
      floorIndex: floorIdx,
      floorLabel,
      start: room.centroid,
      targetExitId: dischargePath.target.id,
      targetExitName: `${upperStair.label} → ${dischargePath.target.name}`,
      viaStairLabel: upperStair.label,
      blocked: false,
      path: floorPath.path,
      path3D,
      floorDistanceM: floorPath.distanceM,
      stairDescentDistM,
      groundDischargeDistM: dischargePath.distanceM,
      distanceM: totalDistM,
      estimatedTimeSec: totalTimeSec,
      walkingSpeedMps: floorSpeed,
      bottleneckCount: floorPath.bottleneckCount + dischargePath.bottleneckCount,
    };

    if (
      !bestResult ||
      candidate.floorDistanceM! < bestResult.floorDistanceM! ||
      (Math.abs(candidate.floorDistanceM! - bestResult.floorDistanceM!) < 0.5 &&
        candidate.estimatedTimeSec < bestResult.estimatedTimeSec)
    ) {
      bestResult = candidate;
    }
  }

  if (bestResult) return bestResult;

  return {
    roomId: room.id,
    roomName: room.originalLabel,
    floorIndex: floorIdx,
    floorLabel,
    start: room.centroid,
    targetExitId: null,
    targetExitName: 'No continuous stair discharge',
    blocked: true,
    blockedReason:
      failureReasons.join('; ') ||
      'Locked stair door or blocked ground discharge prevents evacuation from this floor.',
    path: [room.centroid],
    path3D: [{ x: room.centroid.x, y: room.centroid.y, floorIndex: floorIdx, localElevationM: 0.14 }],
    floorDistanceM: Infinity,
    stairDescentDistM: 0,
    groundDischargeDistM: 0,
    distanceM: Infinity,
    estimatedTimeSec: Infinity,
    walkingSpeedMps: 0,
    bottleneckCount: 0,
  };
}

/**
 * Deterministically measures minimum parallel passage clearance between opposing
 * horizontal or vertical wall segments that bound a corridor or walkway.
 */
export function detectNarrowPassages(plan: ParsedFloorPlan): {
  id: string;
  widthM: number;
  center: Point2D;
  wallAId: string;
  wallBId: string;
  orientation: 'horizontal_gap' | 'vertical_gap';
  shiftWallId: string;
  shiftDx: number;
  shiftDy: number;
}[] {
  const results: {
    id: string;
    widthM: number;
    center: Point2D;
    wallAId: string;
    wallBId: string;
    orientation: 'horizontal_gap' | 'vertical_gap';
    shiftWallId: string;
    shiftDx: number;
    shiftDy: number;
  }[] = [];

  const horizWalls = plan.walls.filter(
    (w) => Math.abs(w.start.y - w.end.y) < 0.05 && Math.abs(w.end.x - w.start.x) > 1.2
  );

  for (let i = 0; i < horizWalls.length; i++) {
    for (let j = i + 1; j < horizWalls.length; j++) {
      const a = horizWalls[i];
      const b = horizWalls[j];
      const dy = Math.abs(a.start.y - b.start.y);
      if (dy < 0.25 || dy >= 0.75) continue;

      const aMinX = Math.min(a.start.x, a.end.x);
      const aMaxX = Math.max(a.start.x, a.end.x);
      const bMinX = Math.min(b.start.x, b.end.x);
      const bMaxX = Math.max(b.start.x, b.end.x);
      const overlapMin = Math.max(aMinX, bMinX);
      const overlapMax = Math.min(aMaxX, bMaxX);
      if (overlapMax - overlapMin < 0.99) continue;

      const cx = (overlapMin + overlapMax) / 2;
      const cy = (a.start.y + b.start.y) / 2;

      // Verify this gap is inside the floor bounds and represents a walkway (not exterior wall cavity)
      const upperWall = a.start.y > b.start.y ? a : b;
      const lowerWall = a.start.y > b.start.y ? b : a;
      const targetWall = upperWall.isExterior ? lowerWall : upperWall;
      const neededDelta = 1.2 - dy; // Widen to compliant 1.20m
      const dir = targetWall === upperWall ? 1 : -1;

      // Deduplicate collinear segments along the same opposing wall lines (e.g., split by a doorway)
      const alreadyFound = results.some(
        (r) =>
          Math.abs(r.center.y - cy) < 0.08 &&
          Math.abs(r.widthM - Number(dy.toFixed(2))) < 0.05
      );
      if (alreadyFound) continue;

      results.push({
        id: `pinch-${results.length + 1}`,
        widthM: Number(dy.toFixed(2)),
        center: { x: Number(cx.toFixed(2)), y: Number(cy.toFixed(2)) },
        wallAId: a.id,
        wallBId: b.id,
        orientation: 'horizontal_gap',
        shiftWallId: targetWall.id,
        shiftDx: 0,
        shiftDy: Number((dir * neededDelta).toFixed(2)),
      });
    }
  }

  return results;
}
