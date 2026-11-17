/**
 * Geometry helpers that let the parser work on drawings that carry no helper
 * layers: wall openings are found from gaps between wall ends, and rooms are
 * found as the areas the walls enclose.
 */
import type { Point2D, WallSegment } from '../types/plan';

const CELL = 0.2;
const WALL_HALF = 0.14;

export function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function polygonArea(poly: Point2D[]): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(area / 2);
}

export function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface WallOpening {
  id: string;
  a: Point2D;
  b: Point2D;
  center: Point2D;
  widthM: number;
  /** Degrees, direction of the wall line the opening sits in. */
  angleDeg: number;
}

const MIN_OPENING = 0.55;
const MAX_OPENING = 2.6;

/**
 * Finds door-sized gaps in the wall lines: a wall that stops short and either
 * resumes on the same line, or meets another wall, 0.55–2.6 m further on.
 */
export function detectWallOpenings(walls: WallSegment[]): WallOpening[] {
  const openings: WallOpening[] = [];

  const isFreeEnd = (pt: Point2D, own: WallSegment): boolean => {
    for (const w of walls) {
      if (w === own) continue;
      if (pointToSegmentDist(pt, w.start, w.end) < 0.08) return false;
    }
    return true;
  };

  const midpointClear = (a: Point2D, b: Point2D, skip: WallSegment[]): boolean => {
    for (const t of [0.25, 0.5, 0.75]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      for (const w of walls) {
        if (skip.includes(w)) continue;
        if (pointToSegmentDist(p, w.start, w.end) < 0.1) return false;
      }
    }
    return true;
  };

  const add = (a: Point2D, b: Point2D) => {
    const widthM = Math.hypot(b.x - a.x, b.y - a.y);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (openings.some((o) => Math.hypot(o.center.x - center.x, o.center.y - center.y) < 0.15)) {
      return;
    }
    openings.push({
      id: `opening-${openings.length + 1}`,
      a,
      b,
      center,
      widthM: Number(widthM.toFixed(2)),
      angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    });
  };

  for (const w of walls) {
    const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
    if (len < 0.15) continue;
    const ends: [Point2D, Point2D][] = [
      [w.end, { x: (w.end.x - w.start.x) / len, y: (w.end.y - w.start.y) / len }],
      [w.start, { x: (w.start.x - w.end.x) / len, y: (w.start.y - w.end.y) / len }],
    ];
    for (const [pt, dir] of ends) {
      if (!isFreeEnd(pt, w)) continue;

      // Case 1: the wall resumes on the same line.
      let best: { p: Point2D; d: number; other: WallSegment } | null = null;
      for (const o of walls) {
        if (o === w) continue;
        for (const q of [o.start, o.end]) {
          const vx = q.x - pt.x;
          const vy = q.y - pt.y;
          const d = Math.hypot(vx, vy);
          if (d < MIN_OPENING || d > MAX_OPENING) continue;
          const along = (vx * dir.x + vy * dir.y) / d;
          if (along < 0.985) continue;
          const oLen = Math.hypot(o.end.x - o.start.x, o.end.y - o.start.y);
          if (oLen < 0.15) continue;
          const cross = Math.abs(
            ((o.end.x - o.start.x) / oLen) * dir.y - ((o.end.y - o.start.y) / oLen) * dir.x
          );
          if (cross > 0.2) continue;
          if (!best || d < best.d) best = { p: q, d, other: o };
        }
      }
      if (best && midpointClear(pt, best.p, [w, best.other])) {
        add(pt, best.p);
        continue;
      }

      // Case 2: the wall stops short of a crossing wall.
      let hit: { p: Point2D; d: number; other: WallSegment } | null = null;
      for (const o of walls) {
        if (o === w) continue;
        const ex = o.end.x - o.start.x;
        const ey = o.end.y - o.start.y;
        const denom = dir.x * ey - dir.y * ex;
        if (Math.abs(denom) < 1e-6) continue;
        const sx = o.start.x - pt.x;
        const sy = o.start.y - pt.y;
        const t = (sx * ey - sy * ex) / denom;
        const u = (sx * dir.y - sy * dir.x) / denom;
        if (t < MIN_OPENING || t > MAX_OPENING || u < -0.02 || u > 1.02) continue;
        if (!hit || t < hit.d) hit = { p: { x: pt.x + dir.x * t, y: pt.y + dir.y * t }, d: t, other: o };
      }
      if (hit && midpointClear(pt, hit.p, [w, hit.other])) {
        add(pt, hit.p);
      }
    }
  }

  return openings;
}

export interface EnclosedRegion {
  id: number;
  cellCount: number;
  polygon: Point2D[];
  areaSqM: number;
  /** A point guaranteed to lie inside the region. */
  anchor: Point2D;
  minWidthM: number;
}

export interface RegionMap {
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  /** -1 wall/sealed, 0 exterior, >=1 region id */
  labels: Int32Array;
  regions: EnclosedRegion[];
  regionAt(pt: Point2D): number;
}

/**
 * Rasterises walls (with openings sealed), flood-fills the outside, and returns
 * every remaining enclosed area as a region with an outline polygon.
 */
export function segmentEnclosedRegions(
  walls: WallSegment[],
  seals: { a: Point2D; b: Point2D }[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): RegionMap {
  const pad = 1.0;
  const minX = bounds.minX - pad;
  const minY = bounds.minY - pad;
  const cols = Math.max(4, Math.ceil((bounds.maxX - bounds.minX + 2 * pad) / CELL));
  const rows = Math.max(4, Math.ceil((bounds.maxY - bounds.minY + 2 * pad) / CELL));
  const labels = new Int32Array(cols * rows).fill(-2);

  const segs = [
    ...walls.map((w) => ({ a: w.start, b: w.end })),
    ...seals,
  ];
  for (const s of segs) {
    const c0 = Math.max(0, Math.floor((Math.min(s.a.x, s.b.x) - WALL_HALF - minX) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((Math.max(s.a.x, s.b.x) + WALL_HALF - minX) / CELL));
    const r0 = Math.max(0, Math.floor((Math.min(s.a.y, s.b.y) - WALL_HALF - minY) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(s.a.y, s.b.y) + WALL_HALF - minY) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const p = { x: minX + (c + 0.5) * CELL, y: minY + (r + 0.5) * CELL };
        if (pointToSegmentDist(p, s.a, s.b) < WALL_HALF) labels[r * cols + c] = -1;
      }
    }
  }

  const fill = (start: number, id: number): number[] => {
    const stack = [start];
    const cells: number[] = [];
    labels[start] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      cells.push(cur);
      const c = cur % cols;
      const r = (cur - c) / cols;
      if (c > 0 && labels[cur - 1] === -2) { labels[cur - 1] = id; stack.push(cur - 1); }
      if (c < cols - 1 && labels[cur + 1] === -2) { labels[cur + 1] = id; stack.push(cur + 1); }
      if (r > 0 && labels[cur - cols] === -2) { labels[cur - cols] = id; stack.push(cur - cols); }
      if (r < rows - 1 && labels[cur + cols] === -2) { labels[cur + cols] = id; stack.push(cur + cols); }
    }
    return cells;
  };

  fill(0, 0);

  // Wall coordinates used to pull the outline back onto the wall centre-lines.
  const hWalls = walls.filter((w) => Math.abs(w.start.y - w.end.y) < 0.05);
  const vWalls = walls.filter((w) => Math.abs(w.start.x - w.end.x) < 0.05);
  const hSeals = seals.filter((s) => Math.abs(s.a.y - s.b.y) < 0.05);
  const vSeals = seals.filter((s) => Math.abs(s.a.x - s.b.x) < 0.05);
  const snapY = (y: number, x0: number, x1: number): number => {
    let best = y;
    let bestD = 0.35;
    for (const w of [...hWalls.map((h) => ({ a: h.start, b: h.end })), ...hSeals]) {
      const lo = Math.min(w.a.x, w.b.x) - 0.3;
      const hi = Math.max(w.a.x, w.b.x) + 0.3;
      if (hi < x0 || lo > x1) continue;
      const d = Math.abs(w.a.y - y);
      if (d < bestD) { bestD = d; best = w.a.y; }
    }
    return best;
  };
  const snapX = (x: number, y0: number, y1: number): number => {
    let best = x;
    let bestD = 0.35;
    for (const w of [...vWalls.map((h) => ({ a: h.start, b: h.end })), ...vSeals]) {
      const lo = Math.min(w.a.y, w.b.y) - 0.3;
      const hi = Math.max(w.a.y, w.b.y) + 0.3;
      if (hi < y0 || lo > y1) continue;
      const d = Math.abs(w.a.x - x);
      if (d < bestD) { bestD = d; best = w.a.x; }
    }
    return best;
  };

  const regions: EnclosedRegion[] = [];
  let nextId = 1;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== -2) continue;
    const id = nextId++;
    const cells = fill(i, id);
    if (cells.length * CELL * CELL < 1.2) continue;

    const outline = traceOutline(cells, id, labels, cols, rows).map((p) => ({
      x: minX + p.x * CELL,
      y: minY + p.y * CELL,
    }));
    // Snap each axis-aligned edge to the wall line it runs beside.
    const snapped = outline.map((p) => ({ ...p }));
    const n = snapped.length;
    for (let k = 0; k < n; k++) {
      const a = outline[k];
      const b = outline[(k + 1) % n];
      if (Math.abs(a.y - b.y) < 1e-6) {
        const y = snapY(a.y, Math.min(a.x, b.x), Math.max(a.x, b.x));
        snapped[k].y = y;
        snapped[(k + 1) % n].y = y;
      } else if (Math.abs(a.x - b.x) < 1e-6) {
        const x = snapX(a.x, Math.min(a.y, b.y), Math.max(a.y, b.y));
        snapped[k].x = x;
        snapped[(k + 1) % n].x = x;
      }
    }
    const polygon = dropCollinear(snapped).map((p) => ({
      x: Number(p.x.toFixed(3)),
      y: Number(p.y.toFixed(3)),
    }));
    if (polygon.length < 3) continue;

    // Interior anchor: the region cell closest to the mean cell position.
    let sx = 0;
    let sy = 0;
    for (const cIdx of cells) { sx += cIdx % cols; sy += Math.floor(cIdx / cols); }
    const mx = sx / cells.length;
    const my = sy / cells.length;
    let bestCell = cells[0];
    let bestD = Infinity;
    for (const cIdx of cells) {
      const d = (cIdx % cols - mx) ** 2 + (Math.floor(cIdx / cols) - my) ** 2;
      if (d < bestD) { bestD = d; bestCell = cIdx; }
    }

    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    regions.push({
      id,
      cellCount: cells.length,
      polygon,
      areaSqM: Number(polygonArea(polygon).toFixed(2)),
      anchor: {
        x: Number((minX + ((bestCell % cols) + 0.5) * CELL).toFixed(2)),
        y: Number((minY + (Math.floor(bestCell / cols) + 0.5) * CELL).toFixed(2)),
      },
      minWidthM: Number(
        Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)).toFixed(2)
      ),
    });
  }

  const regionAt = (pt: Point2D): number => {
    const c = Math.floor((pt.x - minX) / CELL);
    const r = Math.floor((pt.y - minY) / CELL);
    for (let rad = 0; rad <= 3; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
          const v = labels[rr * cols + cc];
          if (v >= 0) return v;
        }
      }
    }
    return -1;
  };

  return { cols, rows, minX, minY, labels, regions, regionAt };
}

/** Outer boundary of a 4-connected cell set, as grid-corner coordinates. */
function traceOutline(
  cells: number[],
  id: number,
  labels: Int32Array,
  cols: number,
  rows: number
): Point2D[] {
  const inside = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < cols && r < rows && labels[r * cols + c] === id;
  // Directed boundary edges, region kept on the left.
  const next = new Map<string, string[]>();
  const push = (x1: number, y1: number, x2: number, y2: number) => {
    const k = `${x1},${y1}`;
    const arr = next.get(k);
    if (arr) arr.push(`${x2},${y2}`);
    else next.set(k, [`${x2},${y2}`]);
  };
  for (const idx of cells) {
    const c = idx % cols;
    const r = (idx - c) / cols;
    if (!inside(c, r - 1)) push(c, r, c + 1, r);
    if (!inside(c + 1, r)) push(c + 1, r, c + 1, r + 1);
    if (!inside(c, r + 1)) push(c + 1, r + 1, c, r + 1);
    if (!inside(c - 1, r)) push(c, r + 1, c, r);
  }
  let bestLoop: Point2D[] = [];
  const used = new Set<string>();
  for (const startKey of next.keys()) {
    if (used.has(startKey)) continue;
    const loop: Point2D[] = [];
    let cur = startKey;
    let guard = 0;
    while (guard++ < 200000) {
      used.add(cur);
      const [x, y] = cur.split(',').map(Number);
      loop.push({ x, y });
      const outs = next.get(cur);
      if (!outs || outs.length === 0) break;
      const nxt = outs.shift()!;
      if (nxt === startKey) break;
      cur = nxt;
    }
    if (loop.length > bestLoop.length) bestLoop = loop;
  }
  return dropCollinear(bestLoop);
}

function dropCollinear(pts: Point2D[]): Point2D[] {
  if (pts.length < 4) return pts;
  const out: Point2D[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n];
    const c = pts[i];
    const q = pts[(i + 1) % n];
    if (Math.hypot(c.x - p.x, c.y - p.y) < 1e-6) continue;
    const cross = (c.x - p.x) * (q.y - c.y) - (c.y - p.y) * (q.x - c.x);
    if (Math.abs(cross) > 1e-6) out.push(c);
  }
  return out;
}
