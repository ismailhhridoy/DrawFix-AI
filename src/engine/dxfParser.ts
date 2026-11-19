import DxfParser from 'dxf-parser';
import type { IDxf, IPoint } from 'dxf-parser';
import { cleanDxfText, matchBanglaRoom } from './banglaText';
import type {
  DimensionEntity,
  DoorEntity,
  LayerConventions,
  OccupancyClass,
  ParsedFloorPlan,
  Point2D,
  RoomEntity,
  RoomTaxonomy,
  StairEntity,
  WallSegment,
  WindowEntity,
} from '../types/plan';
import {
  detectWallOpenings,
  pointInPolygon,
  pointToSegmentDist,
  polygonArea,
  segmentEnclosedRegions,
  type WallOpening,
} from './geometry';

export const DEFAULT_CONVENTIONS: LayerConventions = {
  wallLayers: ['A-WALL', 'A-WALL-EXT', 'A-WALL-INT', 'WALL', 'WALLS', '0'],
  doorLayers: ['A-DOOR', 'DOOR', 'DOORS', 'EXIT'],
  windowLayers: ['A-GLAZ', 'WINDOW', 'WINDOWS', 'A-WIND'],
  stairLayers: ['A-STAIR', 'STAIR', 'STAIRS'],
  textLayers: ['A-TEXT', 'TEXT', 'ANNO', 'ROOM', 'LABELS'],
  dimLayers: ['A-DIM', 'DIM', 'DIMENSIONS'],
  unitMode: 'auto',
};

function matchesLayer(layer: string | undefined, allowlist: string[]): boolean {
  const norm = (layer || '0').toUpperCase();
  return allowlist.some((item) => {
    const target = item.toUpperCase();
    // Very short names such as "0" must match exactly, or they would match half the drawing.
    return norm === target || (target.length > 2 && norm.includes(target));
  });
}

function polygonCentroid(poly: Point2D[]): Point2D {
  if (poly.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of poly) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / poly.length, y: sy / poly.length };
}

export function heuristicRoomTaxonomy(label: string): {
  taxonomy: RoomTaxonomy;
  confidence: number;
  reason: string;
} {
  const s = label.trim().toLowerCase();
  const bnMatch = matchBanglaRoom(label);
  if (bnMatch) {
    return {
      taxonomy: bnMatch.taxonomy,
      confidence: 0.92,
      reason: `Matched Bangla label "${bnMatch.word}"`,
    };
  }
  if (/stair|সিঁড়ি|সিড়ি|step/.test(s)) {
    return {
      taxonomy: 'stair',
      confidence: 0.96,
      reason: 'Matched stair/vertical circulation token',
    };
  }
  if (/exit|escape|fire[-_ ]?(door|stair|lobby)|বাহির|জরুরি/.test(s) && !/control|pump|panel/.test(s)) {
    return {
      taxonomy: 'exit',
      confidence: 0.95,
      reason: 'Matched designated exit token',
    };
  }
  if (/corr|passage|hallway|\bhall\b|aisle|spine|বারান্দা|করিডোর/.test(s)) {
    return {
      taxonomy: 'corridor',
      confidence: 0.94,
      reason: 'Matched circulation corridor token',
    };
  }
  if (/lobby|foyer|vestibule|lift|atrium|reception|লবি/.test(s)) {
    return {
      taxonomy: 'lobby',
      confidence: 0.92,
      reason: 'Matched lobby/vestibule/reception token',
    };
  }
  if (/cbn|cabin|office|supv|manager|qa|কেবিন|অফিস/.test(s)) {
    return {
      taxonomy: 'cabin',
      confidence: 0.91,
      reason: 'Matched cabin/enclosed room abbreviation',
    };
  }
  if (/kitchen|dining|living|lounge|family|drawing|রান্না|খাবার|বসার|unit|apt|flat/.test(s)) {
    return {
      taxonomy: 'habitable',
      confidence: 0.9,
      reason: 'Matched living / dining / kitchen / dwelling-unit label',
    };
  }
  if (/br-|\bbr\b|bed|শয়ন|শোবার/.test(s)) {
    return {
      taxonomy: 'bedroom',
      confidence: 0.92,
      reason: 'Matched sleeping-room label',
    };
  }
  if (/sew|line|cut|pack|finishing|prod|work|pattern|lab|canteen|ক্যান্টিন|গার্মেন্ট|সেলাই/.test(s)) {
    return {
      taxonomy: 'workfloor',
      confidence: 0.93,
      reason: 'Matched garment production/workfloor token',
    };
  }
  if (/util|store|chem|elect|service|dock|dispatch|logistic|সার্ভিস|স্টোর|গুদাম|toilet|wc|bath|wash|duct|shaft/.test(s)) {
    return {
      taxonomy: 'utility',
      confidence: 0.89,
      reason: 'Matched utility/storage/service space token',
    };
  }
  return {
    taxonomy: 'cabin',
    confidence: 0.65,
    reason: 'Label not recognised. Treated as an enclosed room (strictest travel rule) until a reviewer confirms',
  };
}

function parseDoorBlockMeta(blockName: string, xScale = 1): {
  declaredWidthM: number | null;
  nameSaysExit: boolean;
  isLocked: boolean;
} {
  const upper = blockName.toUpperCase();
  const nameSaysExit = /EXIT|FIRE|ROOF|EGRESS|ENTRY|ENTRANCE/.test(upper);
  const isLocked = /LOCK|BLOCK|SEAL|CLOSED/.test(upper);
  const numMatch = upper.match(/(\d{3,4})/);
  let declaredWidthM: number | null = null;
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    let w = val > 20 ? val / 1000 : val;
    if (xScale > 0 && Math.abs(xScale - 1) > 0.05) w *= xScale;
    if (w >= 0.5 && w <= 3) declaredWidthM = Number(w.toFixed(2));
  }
  return { declaredWidthM, nameSaysExit, isLocked };
}

const INSUNITS_TO_M: Record<number, { scale: number; label: string }> = {
  1: { scale: 0.0254, label: 'inches' },
  2: { scale: 0.3048, label: 'feet' },
  4: { scale: 0.001, label: 'millimetres' },
  5: { scale: 0.01, label: 'centimetres' },
  6: { scale: 1, label: 'metres' },
};

/** Folds a wall direction into (-90°, 90°] so labels drawn along it are never upside down. */
function uprightAngle(deg: number): number {
  let a = ((Math.round(deg) % 180) + 180) % 180;
  if (a > 90) a -= 180;
  return a;
}

const MEASURE_TEXT = /^[\d\s.,x×'"\-+]*\s*(m|mm|cm|sqm|sq\.?\s?m|sft|sq\.?\s?ft|m2|m²|ft)?$/i;

function parseWindowBlockMeta(blockName: string): number {
  const numMatch = blockName.toUpperCase().match(/(\d{3,4})/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    return val > 20 ? val / 1000 : val;
  }
  return 1.5;
}

function parseOverrideNumericMeters(text: string | undefined, unitScaleToM: number): number | null {
  if (!text) return null;
  const cleaned = text.replace(/\\P/g, ' ').trim();
  const mMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*m\b/i);
  if (mMatch) return parseFloat(mMatch[1]);
  const mmMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*mm\b/i);
  if (mmMatch) return parseFloat(mmMatch[1]) / 1000;
  const plainMatch = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (plainMatch) {
    const raw = parseFloat(plainMatch[1]);
    return raw > 30 ? raw * unitScaleToM : raw;
  }
  return null;
}

function stripMtextFormatting(raw: string): string {
  return cleanDxfText(raw);
}

export function parseDxfString(
  dxfText: string,
  options: {
    id?: string;
    name?: string;
    subtitle?: string;
    fileName: string;
    occupancyClass?: OccupancyClass;
    conventions?: Partial<LayerConventions>;
    floorIndex?: number;
    floorLabel?: string;
    floorName?: string;
  }
): ParsedFloorPlan {
  const parser = new DxfParser();
  let parsed: IDxf | null = null;
  try {
    parsed = parser.parseSync(dxfText);
  } catch {
    parsed = null;
  }
  if (!parsed || !parsed.entities || parsed.entities.length === 0) {
    throw new Error(
      'This file could not be read as a DXF drawing. Export it from AutoCAD as an ASCII DXF (R12–R2018) and try again. DWG and PDF files are not supported.'
    );
  }

  const floorIdx = options.floorIndex ?? 0;
  const floorLabel = options.floorLabel || (floorIdx === 0 ? 'GF' : `L${floorIdx + 1}`);
  const idPrefix = options.floorIndex !== undefined ? `f${floorIdx}-` : '';
  const parseNotes: string[] = [];

  const conventions: LayerConventions = {
    ...DEFAULT_CONVENTIONS,
    ...options.conventions,
  };

  // ---- Units -------------------------------------------------------------
  const headerUnits = parsed.header?.$INSUNITS as number | undefined;
  let maxCoordAbs = 0;
  for (const ent of parsed.entities) {
    const anyEnt = ent as unknown as Record<string, unknown>;
    const pts = (anyEnt.vertices as IPoint[] | undefined) || [];
    for (const p of pts) {
      maxCoordAbs = Math.max(maxCoordAbs, Math.abs(p.x || 0), Math.abs(p.y || 0));
    }
    const pos = (anyEnt.position as IPoint | undefined) || (anyEnt.startPoint as IPoint | undefined);
    if (pos) {
      maxCoordAbs = Math.max(maxCoordAbs, Math.abs(pos.x || 0), Math.abs(pos.y || 0));
    }
  }

  let scale = 1;
  if (conventions.unitMode === 'millimeters') {
    scale = 0.001;
  } else if (conventions.unitMode === 'meters') {
    scale = 1;
  } else if (headerUnits !== undefined && INSUNITS_TO_M[headerUnits]) {
    scale = INSUNITS_TO_M[headerUnits].scale;
    if (headerUnits !== 4 && headerUnits !== 6) {
      parseNotes.push(`Drawing units are ${INSUNITS_TO_M[headerUnits].label}; converted to metres.`);
    }
  } else if (maxCoordAbs > 200) {
    scale = 0.001;
    parseNotes.push('No unit header found; coordinates are large, so the drawing was read as millimetres.');
  }
  const units: 'meters' | 'millimeters' = scale < 0.02 ? 'millimeters' : 'meters';

  // ---- Wall layers: fall back when the configured names find nothing -------
  const lineLenByLayer = new Map<string, number>();
  for (const ent of parsed.entities) {
    if (ent.type !== 'LINE' && ent.type !== 'LWPOLYLINE' && ent.type !== 'POLYLINE') continue;
    const verts = ((ent as unknown as Record<string, unknown>).vertices as IPoint[] | undefined) || [];
    let len = 0;
    for (let i = 0; i < verts.length - 1; i++) {
      len += Math.hypot(verts[i + 1].x - verts[i].x, verts[i + 1].y - verts[i].y);
    }
    const layer = ent.layer || '0';
    lineLenByLayer.set(layer, (lineLenByLayer.get(layer) || 0) + len);
  }
  const isOtherKnown = (l: string) =>
    matchesLayer(l, conventions.doorLayers) ||
    matchesLayer(l, conventions.windowLayers) ||
    matchesLayer(l, conventions.stairLayers) ||
    matchesLayer(l, conventions.dimLayers) ||
    matchesLayer(l, conventions.textLayers) ||
    /AREA|ROOM|POLY|HATCH|FURN|GRID|AXIS|DEFPOINTS/i.test(l);
  const configuredWallLen = Array.from(lineLenByLayer.entries())
    .filter(([l]) => matchesLayer(l, conventions.wallLayers) && !isOtherKnown(l))
    .reduce((s, [, v]) => s + v, 0);
  if (configuredWallLen === 0) {
    const named = Array.from(lineLenByLayer.keys()).filter((l) =>
      /WALL|MUR|PARED|WAND|PARTITION|MASONRY|BRICK/i.test(l)
    );
    if (named.length > 0) {
      conventions.wallLayers = named;
      parseNotes.push(`Wall layers recognised by name: ${named.join(', ')}.`);
    } else {
      const candidates = Array.from(lineLenByLayer.entries())
        .filter(([l]) => !isOtherKnown(l))
        .sort((x, y) => y[1] - x[1]);
      if (candidates.length > 0) {
        conventions.wallLayers = [candidates[0][0]];
        parseNotes.push(
          `No layer named like a wall layer was found. Layer "${candidates[0][0]}" holds the most line work and was read as walls. Check this in Review.`
        );
      }
    }
  }

  const layersSet = new Set<string>();
  const walls: WallSegment[] = [];
  const windows: WindowEntity[] = [];
  const rawRoomPolys: Point2D[][] = [];
  const stairPolys: Point2D[][] = [];
  const stairLines: { a: Point2D; b: Point2D }[] = [];
  const stairMetaTexts: { text: string; position: Point2D }[] = [];
  const texts: { text: string; position: Point2D; layer: string }[] = [];
  const dimensions: DimensionEntity[] = [];
  const doorInserts: {
    position: Point2D;
    blockName: string;
    rotationDeg: number;
    layer: string;
    xScale: number;
  }[] = [];
  const swingArcs: { center: Point2D; radius: number }[] = [];

  const pushWall = (start: Point2D, end: Point2D, layer: string) => {
    if (Math.hypot(end.x - start.x, end.y - start.y) <= 0.05) return;
    const ext = layer.toUpperCase().includes('EXT');
    walls.push({
      id: `${idPrefix}wall-${walls.length + 1}`,
      start,
      end,
      thickness: ext ? 0.25 : 0.15,
      layer,
      isExterior: ext,
    });
  };

  for (const ent of parsed.entities) {
    const layer = ent.layer || '0';
    layersSet.add(layer);
    const anyEnt = ent as unknown as Record<string, unknown>;

    if (ent.type === 'LINE') {
      const verts = anyEnt.vertices as IPoint[] | undefined;
      if (!verts || verts.length < 2) continue;
      const start = { x: verts[0].x * scale, y: verts[0].y * scale };
      const end = { x: verts[1].x * scale, y: verts[1].y * scale };
      if (matchesLayer(layer, conventions.stairLayers)) {
        stairLines.push({ a: start, b: end });
      } else if (matchesLayer(layer, conventions.wallLayers)) {
        pushWall(start, end, layer);
      }
    } else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
      const verts = (anyEnt.vertices as IPoint[] | undefined) || [];
      if (verts.length < 2) continue;
      const pts: Point2D[] = verts.map((v) => ({ x: v.x * scale, y: v.y * scale }));
      const isClosed = Boolean(anyEnt.shape);
      const upperLayer = layer.toUpperCase();

      if (matchesLayer(layer, conventions.stairLayers)) {
        if (isClosed && pts.length >= 3) stairPolys.push(pts);
        else for (let i = 0; i < pts.length - 1; i++) stairLines.push({ a: pts[i], b: pts[i + 1] });
      } else if (upperLayer.includes('AREA') || upperLayer.includes('ROOM') || upperLayer.includes('POLY')) {
        if (pts.length >= 3) rawRoomPolys.push(pts);
      } else if (matchesLayer(layer, conventions.wallLayers)) {
        for (let i = 0; i < pts.length - 1; i++) pushWall(pts[i], pts[i + 1], layer);
        if (isClosed && pts.length >= 3) pushWall(pts[pts.length - 1], pts[0], layer);
      }
    } else if (ent.type === 'ARC') {
      const c = anyEnt.center as IPoint | undefined;
      const radius = Number(anyEnt.radius || 0) * scale;
      if (c && radius >= 0.5 && radius <= 1.5) {
        swingArcs.push({ center: { x: c.x * scale, y: c.y * scale }, radius });
      }
    } else if (ent.type === 'INSERT') {
      const pos = anyEnt.position as IPoint | undefined;
      const blockName = String(anyEnt.name || 'BLOCK');
      const rot = Number(anyEnt.rotation || 0);
      const xScale = Number(anyEnt.xScale || 1);
      if (!pos) continue;
      const upperName = blockName.toUpperCase();
      const position = { x: pos.x * scale, y: pos.y * scale };

      if (matchesLayer(layer, conventions.windowLayers) || /^W[-_ ]?\d|WIN|GLAZ/.test(upperName)) {
        windows.push({
          id: `${idPrefix}win-${windows.length + 1}`,
          position,
          widthM: parseWindowBlockMeta(blockName),
          rotationDeg: rot,
          layer,
        });
      } else if (
        matchesLayer(layer, conventions.doorLayers) ||
        /DOOR|EXIT|ENTRY|ENTRANCE|^DR?[-_ ]?\d/.test(upperName)
      ) {
        doorInserts.push({ position, blockName, rotationDeg: rot, layer, xScale });
      }
    } else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
      const rawText = String(anyEnt.text || '');
      const cleanText = stripMtextFormatting(rawText);
      const pos = (anyEnt.startPoint as IPoint | undefined) || (anyEnt.position as IPoint | undefined);
      if (!pos || !cleanText) continue;
      const position = { x: pos.x * scale, y: pos.y * scale };

      if (/HEADROOM=|HANDRAIL=|RISER=|TREAD=/.test(cleanText.toUpperCase())) {
        stairMetaTexts.push({ text: cleanText, position });
      } else if (!matchesLayer(layer, conventions.dimLayers)) {
        texts.push({ text: cleanText, position, layer });
      }
    } else if (ent.type === 'DIMENSION') {
      const p1 = anyEnt.linearOrAngularPoint1 as IPoint | undefined;
      const p2 = anyEnt.linearOrAngularPoint2 as IPoint | undefined;
      const actualRaw = Number(anyEnt.actualMeasurement || 0);
      const rawOverride = anyEnt.text ? String(anyEnt.text).trim() : '';
      const overrideText = rawOverride && rawOverride !== '<>' ? rawOverride : null;
      if (p1 && p2) {
        const start = { x: p1.x * scale, y: p1.y * scale };
        const end = { x: p2.x * scale, y: p2.y * scale };
        const geomDist = Math.hypot(end.x - start.x, end.y - start.y);
        const measuredValueM = Number((actualRaw > 0 ? actualRaw * scale : geomDist).toFixed(3));
        const parsedOverrideM = parseOverrideNumericMeters(overrideText || undefined, scale);
        const isStaleOverride =
          parsedOverrideM !== null && Math.abs(parsedOverrideM - measuredValueM) > 0.05;
        dimensions.push({
          id: `${idPrefix}dim-${dimensions.length + 1}`,
          start,
          end,
          measuredValueM,
          overrideText,
          parsedOverrideM,
          isStaleOverride,
          layer,
        });
      }
    }
  }

  // ---- Bounds --------------------------------------------------------------
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  if (!Number.isFinite(minX)) {
    throw new Error(
      `No wall lines were found. Layers in this file: ${Array.from(layersSet).join(', ') || 'none'}. Open "Layers & Height" and enter the name of the wall layer.`
    );
  }
  if (maxX - minX > 400 || maxY - minY > 400) {
    parseNotes.push(
      'The drawing extent is larger than 400 m. The units may have been read wrongly, or the file holds more than one plan.'
    );
  }

  // ---- Openings, doors and exits --------------------------------------------
  const openings: WallOpening[] = detectWallOpenings(walls);
  const takenOpenings = new Set<string>();
  const doors: DoorEntity[] = [];

  const probeSides = (d: DoorEntity): boolean => {
    const rad = ((d.rotationDeg + 90) * Math.PI) / 180;
    const s1 = regionMapRef!.regionAt({ x: d.position.x + Math.cos(rad) * 0.55, y: d.position.y + Math.sin(rad) * 0.55 });
    const s2 = regionMapRef!.regionAt({ x: d.position.x - Math.cos(rad) * 0.55, y: d.position.y - Math.sin(rad) * 0.55 });
    return (s1 === 0 && s2 > 0) || (s2 === 0 && s1 > 0);
  };
  let regionMapRef: ReturnType<typeof segmentEnclosedRegions> | null = null;

  const sortedInserts = doorInserts
    .map((ins) => {
      let best: WallOpening | null = null;
      let bestD = 1.3;
      for (const o of openings) {
        const d = pointToSegmentDist(ins.position, o.a, o.b);
        if (d < bestD) {
          bestD = d;
          best = o;
        }
      }
      return { ins, best, bestD };
    })
    .sort((x, y) => x.bestD - y.bestD);

  for (const { ins, best } of sortedInserts) {
    const meta = parseDoorBlockMeta(ins.blockName, ins.xScale);
    const opening = best && !takenOpenings.has(best.id) ? best : null;
    if (opening) takenOpenings.add(opening.id);
    let widthM = 0.9;
    let widthSource: DoorEntity['widthSource'] = 'default';
    if (opening && meta.declaredWidthM !== null) {
      widthM = Math.min(opening.widthM, meta.declaredWidthM);
      widthSource = opening.widthM <= meta.declaredWidthM + 0.005 ? 'wall-gap' : 'block-name';
    } else if (opening) {
      widthM = opening.widthM;
      widthSource = 'wall-gap';
    } else if (meta.declaredWidthM !== null) {
      widthM = meta.declaredWidthM;
      widthSource = 'block-name';
    }
    doors.push({
      id: '',
      position: opening ? { ...opening.center } : ins.position,
      widthM: Number(widthM.toFixed(2)),
      rotationDeg: opening ? uprightAngle(opening.angleDeg) : ins.rotationDeg,
      layer: ins.layer,
      blockName: ins.blockName,
      isExit: meta.nameSaysExit,
      isLocked: meta.isLocked,
      exitSource: meta.nameSaysExit ? 'block-name' : 'none',
      widthSource,
    });
  }

  // Doors drawn as a swing arc beside a wall gap, with no block.
  for (const o of openings) {
    if (takenOpenings.has(o.id)) continue;
    const hasSwing = swingArcs.some(
      (arc) =>
        Math.abs(arc.radius - o.widthM) < 0.25 &&
        (Math.hypot(arc.center.x - o.a.x, arc.center.y - o.a.y) < 0.3 ||
          Math.hypot(arc.center.x - o.b.x, arc.center.y - o.b.y) < 0.3)
    );
    if (!hasSwing) continue;
    takenOpenings.add(o.id);
    doors.push({
      id: '',
      position: { ...o.center },
      widthM: o.widthM,
      rotationDeg: uprightAngle(o.angleDeg),
      layer: 'detected',
      blockName: `DOOR (${Math.round(o.widthM * 1000)} mm gap)`,
      isExit: false,
      isLocked: false,
      exitSource: 'none',
      widthSource: 'wall-gap',
    });
  }
  // Keep source order stable for ids.
  doors.forEach((d, i) => {
    d.id = `${idPrefix}door-${i + 1}`;
  });

  // Rooms and exterior are found with every opening sealed.
  const seals: { a: Point2D; b: Point2D }[] = openings.map((o) => ({ a: o.a, b: o.b }));
  for (const d of doors) {
    if (d.widthSource !== 'wall-gap' && !openings.some((o) => Math.hypot(o.center.x - d.position.x, o.center.y - d.position.y) < 0.2)) {
      const rad = (d.rotationDeg * Math.PI) / 180;
      const h = d.widthM / 2 + 0.1;
      seals.push({
        a: { x: d.position.x - Math.cos(rad) * h, y: d.position.y - Math.sin(rad) * h },
        b: { x: d.position.x + Math.cos(rad) * h, y: d.position.y + Math.sin(rad) * h },
      });
    }
  }
  const regionMap = segmentEnclosedRegions(walls, seals, { minX, minY, maxX, maxY });

  regionMapRef = regionMap;
  for (const d of doors) d.onExterior = probeSides(d);

  let exitDetection: ParsedFloorPlan['exitDetection'] = 'none';
  if (doors.some((d) => d.isExit)) {
    exitDetection = 'block-name';
  } else if (floorIdx === 0 && doors.some((d) => d.onExterior)) {
    exitDetection = 'exterior-wall';
    for (const d of doors) {
      if (d.onExterior) {
        d.isExit = true;
        d.exitSource = 'exterior-wall';
      }
    }
    parseNotes.push(
      'No door is named as an exit. Doors in the outer wall were taken as exits. Confirm them in Review.'
    );
  }

  // ---- Stairs ----------------------------------------------------------------
  // Tread lines on a stair layer are grouped into one stair per cluster.
  if (stairPolys.length === 0 && stairLines.length >= 4) {
    const boxes: { minX: number; minY: number; maxX: number; maxY: number; n: number }[] = [];
    for (const l of stairLines) {
      const bx = {
        minX: Math.min(l.a.x, l.b.x),
        minY: Math.min(l.a.y, l.b.y),
        maxX: Math.max(l.a.x, l.b.x),
        maxY: Math.max(l.a.y, l.b.y),
        n: 1,
      };
      let merged = true;
      while (merged) {
        merged = false;
        for (let i = 0; i < boxes.length; i++) {
          const o = boxes[i];
          if (bx.minX <= o.maxX + 0.5 && bx.maxX >= o.minX - 0.5 && bx.minY <= o.maxY + 0.5 && bx.maxY >= o.minY - 0.5) {
            bx.minX = Math.min(bx.minX, o.minX);
            bx.minY = Math.min(bx.minY, o.minY);
            bx.maxX = Math.max(bx.maxX, o.maxX);
            bx.maxY = Math.max(bx.maxY, o.maxY);
            bx.n += o.n;
            boxes.splice(i, 1);
            merged = true;
            break;
          }
        }
      }
      boxes.push(bx);
    }
    for (const b of boxes) {
      if (b.n < 4) continue;
      stairPolys.push([
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ]);
    }
  }

  const stairs: StairEntity[] = stairPolys.map((poly, idx) => {
    const centroid = polygonCentroid(poly);
    let metaStr = '';
    let metaD = Infinity;
    const sx = poly.map((p) => p.x);
    const sy = poly.map((p) => p.y);
    for (const m of stairMetaTexts) {
      // A note belongs to a stair only when it is written on or right beside it.
      const near =
        m.position.x >= Math.min(...sx) - 1 &&
        m.position.x <= Math.max(...sx) + 1 &&
        m.position.y >= Math.min(...sy) - 1 &&
        m.position.y <= Math.max(...sy) + 1;
      const d = Math.hypot(m.position.x - centroid.x, m.position.y - centroid.y);
      if (near && d < metaD) {
        metaD = d;
        metaStr = m.text;
      }
    }
    const read = (key: string): number | null => {
      const m = metaStr.match(new RegExp(`${key}=([0-9.]+)`, 'i'));
      return m ? parseFloat(m[1]) : null;
    };
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const spanW = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const width = read('WIDTH');
    const headroom = read('HEADROOM');
    const handrail = read('HANDRAIL');
    const riser = read('RISER');
    const tread = read('TREAD');
    return {
      id: `${idPrefix}stair-${idx + 1}`,
      polygon: poly,
      centroid,
      label: `STAIR-${idx + 1}`,
      clearWidthM: width ?? Math.max(0.9, Number((spanW / 2.2).toFixed(2))),
      headroomM: headroom ?? 2.2,
      handrailHeightM: handrail ?? 0.92,
      riserMm: riser ?? 170,
      treadMm: tread ?? 260,
      stated: {
        width: width !== null,
        headroom: headroom !== null,
        handrail: handrail !== null,
        step: riser !== null && tread !== null,
      },
    };
  });

  // ---- Rooms -------------------------------------------------------------------
  const rooms: RoomEntity[] = [];
  const usedTextIndices = new Set<number>();
  const labelTexts = texts.map((t, i) => ({ ...t, i })).filter((t) => !MEASURE_TEXT.test(t.text.trim()));

  const makeRoom = (
    label: string,
    polygon: Point2D[],
    centroid: Point2D,
    areaSqM: number,
    boundarySource: RoomEntity['boundarySource'],
    labelled: boolean
  ) => {
    const tax = heuristicRoomTaxonomy(label);
    const xs = polygon.map((p) => p.x);
    const ys = polygon.map((p) => p.y);
    rooms.push({
      id: `${idPrefix}room-${rooms.length + 1}`,
      originalLabel: label,
      taxonomy: tax.taxonomy,
      confidence: labelled ? tax.confidence : 0.4,
      mappingSource: 'heuristic',
      mappingReason: labelled ? tax.reason : 'No label inside this enclosure. Please classify it',
      polygon,
      centroid,
      areaSqM,
      occupantLoad: 0,
      floorIndex: floorIdx,
      floorLabel,
      boundarySource,
      minWidthM: Number(
        Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)).toFixed(2)
      ),
    });
  };

  if (rawRoomPolys.length > 0) {
    for (let i = 0; i < rawRoomPolys.length; i++) {
      const poly = rawRoomPolys[i];
      let label = `ROOM-${i + 1}`;
      let labelled = false;
      for (const t of labelTexts) {
        if (usedTextIndices.has(t.i)) continue;
        if (pointInPolygon(t.position, poly)) {
          label = t.text;
          labelled = true;
          usedTextIndices.add(t.i);
          break;
        }
      }
      makeRoom(label, poly, polygonCentroid(poly), Number(polygonArea(poly).toFixed(2)), 'polyline', labelled);
    }
  } else {
    // No room boundaries in the file: use the areas enclosed by the walls.
    let unnamed = 0;
    for (const region of regionMap.regions) {
      const inside = labelTexts
        .filter((t) => !usedTextIndices.has(t.i) && regionMap.regionAt(t.position) === region.id)
        .sort(
          (p, q) =>
            Math.hypot(p.position.x - region.anchor.x, p.position.y - region.anchor.y) -
            Math.hypot(q.position.x - region.anchor.x, q.position.y - region.anchor.y)
        );
      if (inside.length === 0 && region.areaSqM < 2.5) continue;
      const label = inside[0]?.text ?? `UNLABELLED-${++unnamed}`;
      if (inside[0]) usedTextIndices.add(inside[0].i);
      makeRoom(label, region.polygon, region.anchor, region.areaSqM, 'wall-enclosure', inside.length > 0);
    }
    if (rooms.length > 0) {
      parseNotes.push(
        `No room boundary polylines in the file. ${rooms.length} rooms were found from the areas the walls enclose.`
      );
    } else if (labelTexts.length > 0) {
      parseNotes.push(
        'The walls do not form closed rooms, so room areas could not be measured. Rooms are placed at their text labels only.'
      );
      labelTexts.forEach((t) => {
        const r = 1.2;
        const poly: Point2D[] = [
          { x: t.position.x - r, y: t.position.y - r },
          { x: t.position.x + r, y: t.position.y - r },
          { x: t.position.x + r, y: t.position.y + r },
          { x: t.position.x - r, y: t.position.y + r },
        ];
        makeRoom(t.text, poly, t.position, 0, 'text-only', true);
        usedTextIndices.add(t.i);
      });
    }
  }

  // Stair labels, and stairs that exist only as a labelled room.
  for (const rm of rooms) {
    if (rm.taxonomy !== 'stair') continue;
    let linked = false;
    for (const st of stairs) {
      if (pointInPolygon(st.centroid, rm.polygon)) {
        st.label = rm.originalLabel;
        linked = true;
      }
    }
    if (!linked && rm.boundarySource !== 'text-only') {
      stairs.push({
        id: `${idPrefix}stair-${stairs.length + 1}`,
        polygon: rm.polygon,
        centroid: rm.centroid,
        label: rm.originalLabel,
        clearWidthM: Math.max(0.9, Number(((rm.minWidthM || 2) / 2.2).toFixed(2))),
        headroomM: 2.2,
        handrailHeightM: 0.92,
        riserMm: 170,
        treadMm: 260,
        stated: { width: false, headroom: false, handrail: false, step: false },
      });
    }
  }

  const unmappedTexts = texts.filter((_, idx) => !usedTextIndices.has(idx));

  return {
    id: options.id || `upload-${Date.now()}`,
    name: options.name || options.fileName.replace(/\.dxf$/i, ''),
    subtitle:
      options.subtitle ||
      `${(maxX - minX).toFixed(1)} m × ${(maxY - minY).toFixed(1)} m · ${units}`,
    sourceFileName: options.fileName,
    occupancyClass: options.occupancyClass || 'mixed',
    units,
    floorIndex: floorIdx,
    floorLabel,
    floorName: options.floorName || (floorIdx === 0 ? 'Ground Floor' : `Level ${floorIdx + 1}`),
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      widthM: Number((maxX - minX).toFixed(2)),
      heightM: Number((maxY - minY).toFixed(2)),
    },
    layersFound: Array.from(layersSet),
    conventions,
    walls,
    doors,
    windows,
    stairs,
    dimensions,
    rooms,
    unmappedTexts,
    parseNotes,
    rawDxf: dxfText,
    openings: openings.map((o) => ({ id: o.id, a: o.a, b: o.b, center: o.center, widthM: o.widthM })),
    exitDetection,
  };
}
