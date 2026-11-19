/**
 * Plan reading from an image or PDF (AI vision), turned into the same ParsedFloorPlan the DXF parser
 * produces.
 *
 * Gemini only traces positions in normalised image coordinates (0-1000, y from the top). It never
 * gives a size in metres. The scale comes from the reviewer, who types the real overall width of
 * the building; code converts, snaps and builds rooms, and every element is marked as read by AI so
 * the Review step asks a person to confirm it before the rule engine's numbers are relied on.
 */
import type {
  DoorEntity,
  OccupancyClass,
  ParsedFloorPlan,
  Point2D,
  RoomEntity,
  StairEntity,
  WallSegment,
} from '../types/plan';
import { DEFAULT_CONVENTIONS, heuristicRoomTaxonomy } from './dxfParser';
import { pointToSegmentDist, polygonArea } from './geometry';
import { computeRoomOccupantLoad } from './ruleEngine';

export interface VisionReading {
  walls?: { x1: number; y1: number; x2: number; y2: number; exterior?: boolean }[];
  doors?: { x: number; y: number; widthUnits?: number; isExit?: boolean; label?: string }[];
  rooms?: { label: string; polygon: number[][] }[];
  stairs?: { label?: string; polygon: number[][] }[];
  notes?: string[];
}

export interface VisionBuildOptions {
  /** Real overall width of the building outline, in metres, given by the reviewer. */
  realWidthM: number;
  name: string;
  fileName: string;
  occupancyClass: OccupancyClass;
  floorIndex?: number;
  floorLabel?: string;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const inRange = (n: number) => n >= -50 && n <= 1050;

function centroidOf(poly: Point2D[]): Point2D {
  const n = poly.length || 1;
  return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
}

/** Converts a vision reading into a parsed floor plan in metres. Throws with a plain message if it cannot. */
export function buildPlanFromVision(reading: VisionReading, opts: VisionBuildOptions): ParsedFloorPlan {
  if (!finite(opts.realWidthM) || opts.realWidthM < 3 || opts.realWidthM > 500) {
    throw new Error('Enter the building width in metres (between 3 and 500) so the plan can be scaled.');
  }
  const rawWalls = (reading.walls || []).filter(
    (w) => [w.x1, w.y1, w.x2, w.y2].every((v) => finite(v) && inRange(v)) && Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 2
  );
  if (rawWalls.length < 4) {
    throw new Error('The AI could not find enough walls in this image. Try a clearer plan with the whole floor in view.');
  }
  const xs = rawWalls.flatMap((w) => [w.x1, w.x2]);
  const ys = rawWalls.flatMap((w) => [w.y1, w.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = opts.realWidthM / Math.max(1, maxX - minX);
  // Image y runs down; plan y runs up. Origin at the plan's lower-left corner.
  const toM = (x: number, y: number): Point2D => ({
    x: Math.round((x - minX) * scale * 1000) / 1000,
    y: Math.round((maxY - y) * scale * 1000) / 1000,
  });

  const notes: string[] = [
    'Read by AI from an image, not from CAD geometry. Every wall, door, exit and room below is an estimate: confirm each one before relying on any measurement.',
    `Scale: overall width ${opts.realWidthM} m given by the reviewer (1 image unit = ${(scale).toFixed(3)} m).`,
    ...(reading.notes || []).filter((n) => typeof n === 'string').slice(0, 6).map((n) => `AI note: ${n}`),
  ];

  // Walls: snap nearly-straight lines to the axis (within 3 degrees) so corridors read cleanly.
  const walls: WallSegment[] = rawWalls.map((w, i) => {
    let a = toM(w.x1, w.y1);
    let b = toM(w.x2, w.y2);
    const ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (ang < 3 || ang > 177) b = { x: b.x, y: a.y };
    else if (Math.abs(ang - 90) < 3) b = { x: a.x, y: b.y };
    if (a.x > b.x || (a.x === b.x && a.y > b.y)) [a, b] = [b, a];
    return { id: `v-wall-${i + 1}`, start: a, end: b, thickness: 0.2, layer: 'AI-VISION', isExterior: Boolean(w.exterior) };
  });

  const doors: DoorEntity[] = (reading.doors || [])
    .filter((d) => finite(d.x) && finite(d.y) && inRange(d.x) && inRange(d.y))
    .map((d, i) => {
      let pos = toM(d.x, d.y);
      // Snap the door onto the nearest wall line when it is close.
      let best: { p: Point2D; dist: number; w: WallSegment } | null = null;
      for (const w of walls) {
        const dist = pointToSegmentDist(pos, w.start, w.end);
        if (!best || dist < best.dist) {
          const dx = w.end.x - w.start.x;
          const dy = w.end.y - w.start.y;
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((pos.x - w.start.x) * dx + (pos.y - w.start.y) * dy) / len2));
          best = { p: { x: w.start.x + dx * t, y: w.start.y + dy * t }, dist, w };
        }
      }
      if (best && best.dist < 0.6) pos = best.p;
      const widthM = finite(d.widthUnits) && d.widthUnits > 0
        ? Math.min(3, Math.max(0.6, d.widthUnits * scale))
        : 0.9;
      const rot = best ? (Math.atan2(best.w.end.y - best.w.start.y, best.w.end.x - best.w.start.x) * 180) / Math.PI : 0;
      return {
        id: `v-door-${i + 1}`,
        position: pos,
        widthM: Math.round(widthM * 100) / 100,
        rotationDeg: rot,
        layer: 'AI-VISION',
        blockName: (d.label || (d.isExit ? 'EXIT' : 'DOOR')).slice(0, 40),
        isExit: Boolean(d.isExit),
        isLocked: false,
        exitSource: 'ai-vision',
        widthSource: 'ai-vision',
        onExterior: Boolean(best?.w.isExterior),
      };
    });

  const toPoly = (poly: number[][]): Point2D[] =>
    (Array.isArray(poly) ? poly : [])
      .filter((pt) => Array.isArray(pt) && finite(pt[0]) && finite(pt[1]))
      .map((pt) => toM(pt[0], pt[1]));

  const plan: ParsedFloorPlan = {
    id: `vision-${Date.now()}`,
    name: opts.name,
    subtitle: 'Read by AI from an image',
    sourceFileName: opts.fileName,
    occupancyClass: opts.occupancyClass,
    units: 'meters',
    floorIndex: opts.floorIndex ?? 0,
    floorLabel: opts.floorLabel ?? 'GF',
    floorName: opts.floorLabel ?? 'Ground floor',
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, widthM: 0, heightM: 0 },
    layersFound: ['AI-VISION'],
    conventions: DEFAULT_CONVENTIONS,
    walls,
    doors,
    windows: [],
    stairs: [],
    dimensions: [],
    rooms: [],
    unmappedTexts: [],
    parseNotes: notes,
    exitDetection: doors.some((d) => d.isExit) ? 'block-name' : 'none',
  };
  const allPts = walls.flatMap((w) => [w.start, w.end]);
  const bx = allPts.map((p) => p.x);
  const by = allPts.map((p) => p.y);
  plan.bounds = {
    minX: Math.min(...bx), minY: Math.min(...by), maxX: Math.max(...bx), maxY: Math.max(...by),
    widthM: Math.max(...bx) - Math.min(...bx), heightM: Math.max(...by) - Math.min(...by),
  };

  plan.rooms = (reading.rooms || [])
    .map((r, i): RoomEntity | null => {
      const polygon = toPoly(r.polygon);
      if (polygon.length < 3) return null;
      const areaSqM = Math.round(polygonArea(polygon) * 100) / 100;
      if (areaSqM < 0.5) return null;
      const label = (r.label || `ROOM-${i + 1}`).trim().slice(0, 60);
      const tax = heuristicRoomTaxonomy(label);
      const room: RoomEntity = {
        id: `v-room-${i + 1}`,
        originalLabel: label,
        taxonomy: tax.taxonomy,
        confidence: Math.min(tax.confidence, 0.7),
        mappingSource: 'heuristic',
        mappingReason: `${tax.reason} (room read by AI from an image)`,
        polygon,
        centroid: centroidOf(polygon),
        areaSqM,
        occupantLoad: 0,
        floorIndex: plan.floorIndex,
        floorLabel: plan.floorLabel,
        boundarySource: 'ai-vision',
      };
      room.occupantLoad = computeRoomOccupantLoad(room);
      return room;
    })
    .filter((r): r is RoomEntity => r !== null);

  plan.stairs = (reading.stairs || [])
    .map((s, i): StairEntity | null => {
      const polygon = toPoly(s.polygon);
      if (polygon.length < 3) return null;
      const xsS = polygon.map((p) => p.x);
      const ysS = polygon.map((p) => p.y);
      const w = Math.min(Math.max(...xsS) - Math.min(...xsS), Math.max(...ysS) - Math.min(...ysS));
      return {
        id: `v-stair-${i + 1}`,
        polygon,
        centroid: centroidOf(polygon),
        label: (s.label || `STAIR-${i + 1}`).slice(0, 40),
        clearWidthM: Math.round(w * 100) / 100,
        headroomM: 0,
        handrailHeightM: 0,
        riserMm: 0,
        treadMm: 0,
        // Nothing about the stair was written in a drawing, so none of these values are checked.
        stated: { width: false, headroom: false, handrail: false, step: false },
      };
    })
    .filter((s): s is StairEntity => s !== null);

  if (plan.rooms.length === 0) notes.push('No rooms were read. Add room outlines in CAD or try a clearer image.');
  if (!doors.some((d) => d.isExit)) notes.push('No exit door was read. Mark the exits in the Review step.');
  return plan;
}

export interface ReadingScore {
  rooms: { truth: number; read: number; matched: number };
  doors: { truth: number; read: number; matched: number };
  exits: { truth: number; read: number; matched: number };
  /** Mean absolute area error of matched rooms, as a percentage of the true area. */
  meanRoomAreaErrorPct: number | null;
  /** Share of true rooms, doors and exits found (0-1). */
  recall: number;
}

/**
 * Scores an AI reading against a plan whose geometry is known (for example a demo DXF rendered to
 * an image). Rooms match when the read centroid falls within 1.5 m of a true one; doors within 0.8 m.
 */
export function scoreReading(read: ParsedFloorPlan, truth: ParsedFloorPlan): ReadingScore {
  // Align the two plans at their lower-left corners; the reading's origin is its own outline.
  const ox = truth.bounds.minX - read.bounds.minX;
  const oy = truth.bounds.minY - read.bounds.minY;
  const shift = (p: Point2D) => ({ x: p.x + ox, y: p.y + oy });

  const match = <T,>(a: T[], b: T[], pos: (x: T) => Point2D, tol: number, shiftA: boolean) => {
    const used = new Set<number>();
    const pairs: [T, T][] = [];
    for (const t of b) {
      let bi = -1;
      let bd = Infinity;
      a.forEach((r, i) => {
        if (used.has(i)) return;
        const p = shiftA ? shift(pos(r)) : pos(r);
        const q = pos(t);
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < bd) { bd = d; bi = i; }
      });
      if (bi >= 0 && bd <= tol) { used.add(bi); pairs.push([a[bi], t]); }
    }
    return pairs;
  };
  const roomPairs = match(read.rooms, truth.rooms, (r) => r.centroid, 1.5, true);
  const doorPairs = match(read.doors, truth.doors, (d) => d.position, 0.8, true);
  const readExits = read.doors.filter((d) => d.isExit);
  const truthExits = truth.doors.filter((d) => d.isExit);
  const exitPairs = match(readExits, truthExits, (d) => d.position, 0.8, true);
  const errs = roomPairs.map(([r, t]) => Math.abs(r.areaSqM - t.areaSqM) / Math.max(0.01, t.areaSqM));
  const totalTruth = truth.rooms.length + truth.doors.length + truthExits.length;
  return {
    rooms: { truth: truth.rooms.length, read: read.rooms.length, matched: roomPairs.length },
    doors: { truth: truth.doors.length, read: read.doors.length, matched: doorPairs.length },
    exits: { truth: truthExits.length, read: readExits.length, matched: exitPairs.length },
    meanRoomAreaErrorPct: errs.length ? Math.round((errs.reduce((s, e) => s + e, 0) / errs.length) * 1000) / 10 : null,
    recall: totalTruth ? (roomPairs.length + doorPairs.length + exitPairs.length) / totalTruth : 0,
  };
}

/** Draws a parsed plan as a plain SVG (walls, door gaps, room labels), for evaluating plan reading. */
export function planToSvg(plan: ParsedFloorPlan, pxPerM = 20): string {
  const pad = 1;
  const W = (plan.bounds.widthM + 2 * pad) * pxPerM;
  const H = (plan.bounds.heightM + 2 * pad) * pxPerM;
  const X = (x: number) => ((x - plan.bounds.minX + pad) * pxPerM).toFixed(1);
  const Y = (y: number) => ((plan.bounds.maxY - y + pad) * pxPerM).toFixed(1);
  const lines = plan.walls
    .map((w) => `<line x1="${X(w.start.x)}" y1="${Y(w.start.y)}" x2="${X(w.end.x)}" y2="${Y(w.end.y)}" stroke="#000" stroke-width="${Math.max(2, 0.2 * pxPerM)}"/>`)
    .join('');
  const doors = plan.doors
    .map((d) => `<circle cx="${X(d.position.x)}" cy="${Y(d.position.y)}" r="${((d.widthM / 2) * pxPerM).toFixed(1)}" fill="#fff" stroke="#888" stroke-dasharray="3 2"/>${d.isExit ? `<text x="${X(d.position.x)}" y="${Y(d.position.y)}" font-size="${pxPerM * 0.5}" text-anchor="middle" fill="#c00">EXIT</text>` : ''}`)
    .join('');
  const labels = plan.rooms
    .map((r) => `<text x="${X(r.centroid.x)}" y="${Y(r.centroid.y)}" font-size="${pxPerM * 0.55}" text-anchor="middle" font-family="sans-serif">${r.originalLabel.replace(/[<&>]/g, '')}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}"><rect width="100%" height="100%" fill="#fff"/>${lines}${doors}${labels}</svg>`;
}
