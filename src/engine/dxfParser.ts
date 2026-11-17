import DxfParser from 'dxf-parser';
import type { IDxf, IPoint } from 'dxf-parser';
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
    return norm === target || norm.includes(target);
  });
}

function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonArea(poly: Point2D[]): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(area / 2);
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
  if (/stair|সিঁড়ি|সিড়ি|step/.test(s)) {
    return {
      taxonomy: 'stair',
      confidence: 0.96,
      reason: 'Matched stair/vertical circulation token',
    };
  }
  if (/exit|fire|escape|বাহির|জরুরি/.test(s)) {
    return {
      taxonomy: 'exit',
      confidence: 0.95,
      reason: 'Matched designated exit token',
    };
  }
  if (/corr|passage|hallway|aisle|বারান্দা|করিডোর/.test(s)) {
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
  if (/br-|bed|শয়ন|ঘর|living|unit|apt|flat/.test(s)) {
    return {
      taxonomy: 'bedroom',
      confidence: 0.9,
      reason: 'Matched residential habitable room/bedroom label',
    };
  }
  if (/sew|line|cut|pack|finishing|prod|work|pattern|lab|canteen|ক্যান্টিন|গার্মেন্ট|সেলাই/.test(s)) {
    return {
      taxonomy: 'workfloor',
      confidence: 0.93,
      reason: 'Matched garment production/workfloor token',
    };
  }
  if (/util|store|chem|elect|service|dock|dispatch|সার্ভিস|স্টোর|গুদাম|toilet|wc|bath/.test(s)) {
    return {
      taxonomy: 'utility',
      confidence: 0.89,
      reason: 'Matched utility/storage/service space token',
    };
  }
  return {
    taxonomy: 'cabin',
    confidence: 0.65,
    reason: 'Defaulted unrecognized room label to enclosed cabin/room for conservative egress check',
  };
}

function parseDoorBlockMeta(blockName: string, xScale = 1): {
  widthM: number;
  isExit: boolean;
  isLocked: boolean;
} {
  const upper = blockName.toUpperCase();
  const isExit = /EXIT|FIRE|ROOF|EGRESS/.test(upper);
  const isLocked = /LOCK|BLOCK|SEAL|CLOSED/.test(upper);
  const numMatch = upper.match(/(\d{3,4})/);
  let widthM = 0.9;
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    widthM = val > 20 ? val / 1000 : val;
  }
  if (xScale > 0 && Math.abs(xScale - 1) > 0.05) {
    widthM = widthM * xScale;
  }
  return {
    widthM: Math.max(0.55, Math.min(2.6, Number(widthM.toFixed(2)))),
    isExit,
    isLocked,
  };
}

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
  return raw
    .replace(/\{\\[^;]+;([^}]*)\}/g, '$1')
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .trim();
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
  const parsed: IDxf | null = parser.parseSync(dxfText);
  if (!parsed || !parsed.entities) {
    throw new Error('Could not parse DXF entities. Ensure the file is a valid ASCII AutoCAD DXF (R12–R2018).');
  }

  const floorIdx = options.floorIndex ?? 0;
  const floorLabel = options.floorLabel || (floorIdx === 0 ? 'GF' : `L${floorIdx + 1}`);
  const idPrefix = options.floorIndex !== undefined ? `f${floorIdx}-` : '';

  const conventions: LayerConventions = {
    ...DEFAULT_CONVENTIONS,
    ...options.conventions,
  };

  // Detect units from $INSUNITS or coordinate magnitude
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

  let units: 'meters' | 'millimeters' = 'meters';
  if (conventions.unitMode === 'millimeters') {
    units = 'millimeters';
  } else if (conventions.unitMode === 'meters') {
    units = 'meters';
  } else if (headerUnits === 4 || maxCoordAbs > 200) {
    units = 'millimeters';
  }
  const scale = units === 'millimeters' ? 0.001 : 1;

  const layersSet = new Set<string>();
  const walls: WallSegment[] = [];
  const doors: DoorEntity[] = [];
  const windows: WindowEntity[] = [];
  const rawRoomPolys: Point2D[][] = [];
  const stairPolys: Point2D[][] = [];
  const stairMetaTexts: string[] = [];
  const texts: { text: string; position: Point2D; layer: string }[] = [];
  const dimensions: DimensionEntity[] = [];
  const parseNotes: string[] = [];

  for (const ent of parsed.entities) {
    const layer = ent.layer || '0';
    layersSet.add(layer);
    const anyEnt = ent as unknown as Record<string, unknown>;

    if (ent.type === 'LINE') {
      const verts = anyEnt.vertices as IPoint[] | undefined;
      if (verts && verts.length >= 2 && matchesLayer(layer, conventions.wallLayers)) {
        const start = { x: verts[0].x * scale, y: verts[0].y * scale };
        const end = { x: verts[1].x * scale, y: verts[1].y * scale };
        const len = Math.hypot(end.x - start.x, end.y - start.y);
        if (len > 0.05) {
          walls.push({
            id: `${idPrefix}wall-${walls.length + 1}`,
            start,
            end,
            thickness: layer.toUpperCase().includes('EXT') ? 0.25 : 0.15,
            layer,
            isExterior: layer.toUpperCase().includes('EXT'),
          });
        }
      }
    } else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
      const verts = (anyEnt.vertices as IPoint[] | undefined) || [];
      if (verts.length < 2) continue;
      const pts: Point2D[] = verts.map((v) => ({ x: v.x * scale, y: v.y * scale }));
      const isClosed = Boolean(anyEnt.shape);
      const upperLayer = layer.toUpperCase();

      if (matchesLayer(layer, conventions.stairLayers)) {
        stairPolys.push(pts);
      } else if (upperLayer.includes('AREA') || upperLayer.includes('ROOM') || upperLayer.includes('POLY')) {
        if (pts.length >= 3) rawRoomPolys.push(pts);
      } else if (matchesLayer(layer, conventions.wallLayers)) {
        for (let i = 0; i < pts.length - 1; i++) {
          const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
          if (len > 0.05) {
            walls.push({
              id: `${idPrefix}wall-${walls.length + 1}`,
              start: pts[i],
              end: pts[i + 1],
              thickness: upperLayer.includes('EXT') ? 0.25 : 0.15,
              layer,
              isExterior: upperLayer.includes('EXT'),
            });
          }
        }
        if (isClosed && pts.length >= 3) {
          const first = pts[0];
          const last = pts[pts.length - 1];
          if (Math.hypot(first.x - last.x, first.y - last.y) > 0.05) {
            walls.push({
              id: `${idPrefix}wall-${walls.length + 1}`,
              start: last,
              end: first,
              thickness: upperLayer.includes('EXT') ? 0.25 : 0.15,
              layer,
              isExterior: upperLayer.includes('EXT'),
            });
          }
        }
      }
    } else if (ent.type === 'INSERT') {
      const pos = anyEnt.position as IPoint | undefined;
      const blockName = String(anyEnt.name || 'BLOCK');
      const rot = Number(anyEnt.rotation || 0);
      const xScale = Number(anyEnt.xScale || 1);
      if (!pos) continue;

      if (matchesLayer(layer, conventions.doorLayers) || /DOOR|EXIT/.test(blockName.toUpperCase())) {
        const meta = parseDoorBlockMeta(blockName, xScale);
        doors.push({
          id: `${idPrefix}door-${doors.length + 1}`,
          position: { x: pos.x * scale, y: pos.y * scale },
          widthM: meta.widthM,
          rotationDeg: rot,
          layer,
          blockName,
          isExit: meta.isExit,
          isLocked: meta.isLocked,
        });
      } else if (matchesLayer(layer, conventions.windowLayers) || /WIN|GLAZ/.test(blockName.toUpperCase())) {
        windows.push({
          id: `${idPrefix}win-${windows.length + 1}`,
          position: { x: pos.x * scale, y: pos.y * scale },
          widthM: parseWindowBlockMeta(blockName),
          rotationDeg: rot,
          layer,
        });
      }
    } else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
      const rawText = String(anyEnt.text || '');
      const cleanText = stripMtextFormatting(rawText);
      const pos = (anyEnt.startPoint as IPoint | undefined) || (anyEnt.position as IPoint | undefined);
      if (!pos || !cleanText) continue;

      if (matchesLayer(layer, conventions.stairLayers) && /HEADROOM=|HANDRAIL=|RISER=/.test(cleanText.toUpperCase())) {
        stairMetaTexts.push(cleanText);
      } else if (matchesLayer(layer, conventions.textLayers) || !matchesLayer(layer, conventions.dimLayers)) {
        texts.push({
          text: cleanText,
          position: { x: pos.x * scale, y: pos.y * scale },
          layer,
        });
      }
    } else if (ent.type === 'DIMENSION') {
      const p1 = anyEnt.linearOrAngularPoint1 as IPoint | undefined;
      const p2 = anyEnt.linearOrAngularPoint2 as IPoint | undefined;
      const actualRaw = Number(anyEnt.actualMeasurement || 0);
      const overrideText = anyEnt.text ? String(anyEnt.text).trim() : null;
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

  // Compute bounds
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
    minX = 0;
    minY = 0;
    maxX = 20;
    maxY = 14;
    parseNotes.push('No wall line/polyline entities matched the configured wall layers.');
  }

  // Build Stair entities (match each stair polygon to the closest stair metadata text if multiple exist)
  const stairs: StairEntity[] = stairPolys.map((poly, idx) => {
    const centroid = polygonCentroid(poly);
    const metaStr = stairMetaTexts[idx] || stairMetaTexts[0] || '';
    const getNum = (key: string, def: number) => {
      const m = metaStr.match(new RegExp(`${key}=([0-9.]+)`, 'i'));
      return m ? parseFloat(m[1]) : def;
    };
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const spanW = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return {
      id: `${idPrefix}stair-${idx + 1}`,
      polygon: poly,
      centroid,
      label: `STAIR-${idx + 1}`,
      clearWidthM: getNum('WIDTH', Math.max(1.0, Number((spanW / 2.2).toFixed(2)))),
      headroomM: getNum('HEADROOM', 2.2),
      handrailHeightM: getNum('HANDRAIL', 0.92),
      riserMm: getNum('RISER', 170),
      treadMm: getNum('TREAD', 260),
    };
  });

  // Match room texts to room polygons using point-in-polygon
  const rooms: RoomEntity[] = [];
  const usedTextIndices = new Set<number>();

  for (let i = 0; i < rawRoomPolys.length; i++) {
    const poly = rawRoomPolys[i];
    const areaSqM = Number(polygonArea(poly).toFixed(2));
    const centroid = polygonCentroid(poly);
    let matchedLabel = `ROOM-${i + 1}`;
    for (let tIdx = 0; tIdx < texts.length; tIdx++) {
      if (usedTextIndices.has(tIdx)) continue;
      if (pointInPolygon(texts[tIdx].position, poly)) {
        matchedLabel = texts[tIdx].text;
        usedTextIndices.add(tIdx);
        break;
      }
    }
    const tax = heuristicRoomTaxonomy(matchedLabel);
    const occDensity =
      tax.taxonomy === 'workfloor' ? 0.35 : tax.taxonomy === 'corridor' ? 0 : 0.12;
    rooms.push({
      id: `${idPrefix}room-${i + 1}`,
      originalLabel: matchedLabel,
      taxonomy: tax.taxonomy,
      confidence: tax.confidence,
      mappingSource: 'heuristic',
      mappingReason: tax.reason,
      polygon: poly,
      centroid,
      areaSqM,
      occupantLoad: Math.max(1, Math.round(areaSqM * occDensity)),
      floorIndex: floorIdx,
      floorLabel,
    });
  }

  // Fallback for external DXFs that have TEXT labels inside walls without closed room polylines
  if (rooms.length === 0 && texts.length > 0) {
    parseNotes.push(
      'No closed room boundary polylines found; synthesized room zones around DXF TEXT entities.'
    );
    texts.forEach((t, idx) => {
      const tax = heuristicRoomTaxonomy(t.text);
      const r = 1.6;
      const poly: Point2D[] = [
        { x: Math.max(minX, t.position.x - r), y: Math.max(minY, t.position.y - r) },
        { x: Math.min(maxX, t.position.x + r), y: Math.max(minY, t.position.y - r) },
        { x: Math.min(maxX, t.position.x + r), y: Math.min(maxY, t.position.y + r) },
        { x: Math.max(minX, t.position.x - r), y: Math.min(maxY, t.position.y + r) },
      ];
      rooms.push({
        id: `${idPrefix}room-${idx + 1}`,
        originalLabel: t.text,
        taxonomy: tax.taxonomy,
        confidence: tax.confidence,
        mappingSource: 'heuristic',
        mappingReason: tax.reason,
        polygon: poly,
        centroid: t.position,
        areaSqM: Number(polygonArea(poly).toFixed(2)),
        occupantLoad: tax.taxonomy === 'workfloor' ? 12 : 2,
        floorIndex: floorIdx,
        floorLabel,
      });
      usedTextIndices.add(idx);
    });
  }

  // Link stair labels if a room is mapped to stair
  for (const rm of rooms) {
    if (rm.taxonomy === 'stair') {
      for (const st of stairs) {
        if (pointInPolygon(st.centroid, rm.polygon)) {
          st.label = rm.originalLabel;
        }
      }
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
  };
}
