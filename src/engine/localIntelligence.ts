import { REGULATORY_CORPUS, type RegulatoryClauseChunk } from './bnbcCorpus';
import type {
  BuildingProject,
  ComplianceAudit,
  ParsedFloorPlan,
  Point2D,
  RagQueryResponse,
  RoomEntity,
  RoomTaxonomy,
} from '../types/plan';

export type ReviewerRole = 'architect' | 'government';

function polygonPerimeter(poly: Point2D[]): number {
  if (poly.length < 2) return 0;
  let perim = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    perim += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return perim;
}

function boundingAspectRatio(poly: Point2D[]): { width: number; height: number; aspect: number } {
  if (poly.length === 0) return { width: 1, height: 1, aspect: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = Math.max(0.2, maxX - minX);
  const h = Math.max(0.2, maxY - minY);
  const aspect = Math.max(w, h) / Math.min(w, h);
  return { width: w, height: h, aspect };
}

function pointNearPolygon(pt: Point2D, poly: Point2D[], marginM = 0.85): boolean {
  if (poly.length === 0) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return (
    pt.x >= minX - marginM &&
    pt.x <= maxX + marginM &&
    pt.y >= minY - marginM &&
    pt.y <= maxY + marginM
  );
}

/**
 * On-device multi-feature spatial + morphological room classifier.
 * Runs completely locally (zero API calls) using polygon geometry, attached doors/windows,
 * and lexical morphology scores to assign confidence and explainable evidence.
 */
export function classifyRoomWithGeometry(
  room: RoomEntity,
  floorPlan?: ParsedFloorPlan | null
): { taxonomy: RoomTaxonomy; confidence: number; reason: string } {
  const scores: Record<RoomTaxonomy, number> = {
    bedroom: 0.1,
    habitable: 0.1,
    cabin: 0.1,
    corridor: 0.1,
    stair: 0.1,
    exit: 0.1,
    workfloor: 0.1,
    utility: 0.1,
    lobby: 0.1,
  };

  const label = (room.originalLabel || '').toLowerCase();
  const { aspect } = boundingAspectRatio(room.polygon);
  const perim = polygonPerimeter(room.polygon);
  const compactness = perim > 0 ? (4 * Math.PI * room.areaSqM) / (perim * perim) : 0.7;

  let doorTouches = 0;
  let exitDoorTouches = 0;
  let windowTouches = 0;
  let overlapsStair = false;

  if (floorPlan) {
    for (const d of floorPlan.doors) {
      if (pointNearPolygon(d.position, room.polygon, 0.9)) {
        doorTouches++;
        if (d.isExit) exitDoorTouches++;
      }
    }
    for (const w of floorPlan.windows) {
      if (pointNearPolygon(w.position, room.polygon, 0.9)) {
        windowTouches++;
      }
    }
    for (const st of floorPlan.stairs) {
      if (pointNearPolygon(st.centroid, room.polygon, 1.0)) {
        overlapsStair = true;
      }
    }
  }

  // 1. Lexical morphology cues
  if (/br-|bed|sleep|master|guest|dorm/.test(label)) scores.bedroom += 5.2;
  if (/living|dining|kitchen|lounge|family|drawing|apt|unit|flat/.test(label)) scores.habitable += 4.8;
  if (/cbn|cabin|office|supv|manager|qa|clinic|medical|consult/.test(label)) scores.cabin += 4.6;
  if (/corr|passage|hallway|aisle|spine|veranda/.test(label)) scores.corridor += 5.0;
  if (/stair|step|core|riser/.test(label)) scores.stair += 5.4;
  if (/exit|escape|egress|discharge/.test(label)) scores.exit += 4.8;
  if (/sew|line|cut|pack|finish|prod|work|canteen|floor|hall/.test(label)) scores.workfloor += 4.8;
  if (/util|store|chem|elect|service|dock|wc|bath|toilet|wash|duct|shaft/.test(label)) scores.utility += 4.9;
  if (/lobby|foyer|vestibule|lift|atrium|reception/.test(label)) scores.lobby += 4.8;

  // 2. Geometric & topological priors
  if (overlapsStair) scores.stair += 3.8;
  if (aspect >= 3.1 && (room.minWidthM ?? 3) <= 3.2) {
    scores.corridor += 2.6;
  }
  if (doorTouches >= 4 && aspect >= 2.2) {
    scores.corridor += 1.6;
  }
  if (doorTouches >= 3 && aspect < 2.2 && room.areaSqM >= 10) {
    scores.lobby += 1.4;
  }
  if (exitDoorTouches >= 1 && room.areaSqM < 18) {
    scores.lobby += 0.9;
  }
  if (room.areaSqM > 0 && room.areaSqM < 5.5 && windowTouches === 0 && !overlapsStair) {
    scores.utility += 1.5;
  }
  if (room.areaSqM >= 8.5 && room.areaSqM <= 26 && windowTouches >= 1 && aspect < 2.4) {
    scores.bedroom += 0.9;
    scores.habitable += 0.8;
  }
  if (room.areaSqM >= 55 && aspect < 2.8 && compactness > 0.35) {
    scores.workfloor += 2.1;
  }

  // Pick winning taxonomy & softmax confidence
  const entries = Object.entries(scores) as [RoomTaxonomy, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [bestTax, bestScore] = entries[0];
  const [, secondScore] = entries[1];

  const expVals = entries.map(([, s]) => Math.exp(Math.min(12, s)));
  const sumExp = expVals.reduce((a, b) => a + b, 0);
  const prob = sumExp > 0 ? Math.exp(Math.min(12, bestScore)) / sumExp : 0.7;
  const calibrated = Number(
    Math.max(0.55, Math.min(0.98, 0.52 + (bestScore - secondScore) * 0.085 + prob * 0.2)).toFixed(2)
  );

  const geoFacts: string[] = [];
  if (room.areaSqM > 0) geoFacts.push(`${room.areaSqM.toFixed(1)} m²`);
  if (aspect >= 2.6) geoFacts.push(`aspect ${aspect.toFixed(1)}:1`);
  if (windowTouches > 0) geoFacts.push(`${windowTouches} window${windowTouches === 1 ? '' : 's'}`);
  if (doorTouches > 0) geoFacts.push(`${doorTouches} door${doorTouches === 1 ? '' : 's'}`);

  const reason = `Local geometry + token match (${geoFacts.join(', ') || 'layout polygon'}) → ${bestTax}`;
  return { taxonomy: bestTax, confidence: calibrated, reason };
}

const LOCAL_SYNONYMS: [RegExp, string][] = [
  [/far|coverage|mgc|plot|road|setback|zoning|imarat/gi, 'far mgc coverage setback road width plot rajuk'],
  [/bedroom|sleep|9\.5|2\.9|habit/gi, 'bedroom sleeping 9.5 2.9 habitable'],
  [/window|daylight|vent|15%|18%/gi, 'window daylight ventilation opening 15 18'],
  [/stair|riser|tread|headroom|handrail|2\.15|610|648/gi, 'stair headroom handrail riser tread 2.15 0.90 610 648'],
  [/corridor|passage|width|pinch|0\.75|cabin|16/gi, 'corridor passage 0.75 cabin 16 travel'],
  [/exit|door|lock|sprinkler|22\.5|high.?rise|20/gi, 'exit door locked sprinkler 22.5 high rise 20'],
];

/**
 * In-browser BM25 retrieval + project-grounded answer synthesis.
 * Ensures air-gapped government workstations get instant answers with zero API calls.
 */
export function queryLocalCorpus(
  question: string,
  project?: BuildingProject | null,
  audit?: ComplianceAudit | null
): RagQueryResponse {
  let enriched = question.toLowerCase();
  for (const [rx, add] of LOCAL_SYNONYMS) {
    if (rx.test(enriched)) enriched += ` ${add}`;
  }
  const tokens = enriched
    .replace(/[^a-z0-9.\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const scored: { chunk: RegulatoryClauseChunk; score: number }[] = REGULATORY_CORPUS.map(
    (chunk) => {
      if (
        project?.occupancyClass &&
        !chunk.occupancyScope.includes('all') &&
        !chunk.occupancyScope.includes(project.occupancyClass)
      ) {
        // Still allow if explicitly asked, just slight downweight
      }
      const hay = `${chunk.clause} ${chunk.title} ${chunk.part} ${chunk.text}`.toLowerCase();
      const keys = `${chunk.keywords.join(' ')} ${chunk.topics.join(' ')}`.toLowerCase();
      let s = 0;
      for (const tok of tokens) {
        if (chunk.clause.toLowerCase().includes(tok)) s += 4.0;
        if (chunk.title.toLowerCase().includes(tok)) s += 3.0;
        if (keys.includes(tok)) s += 2.5;
        if (hay.includes(tok)) s += 1.2;
      }
      if (
        project?.occupancyClass &&
        (chunk.occupancyScope.includes('all') ||
          chunk.occupancyScope.includes(project.occupancyClass))
      ) {
        s *= 1.15;
      }
      return { chunk, score: Number(s.toFixed(2)) };
    }
  ).sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 4);
  const best = top[0]?.chunk;
  const activeMatches = audit
    ? audit.violations
        .filter((v) =>
          tokens.some((t) =>
            `${v.ruleName} ${v.citation} ${v.description}`.toLowerCase().includes(t)
          )
        )
        .slice(0, 2)
    : [];

  const activeNote =
    activeMatches.length > 0
      ? ` On the active drawing (${project?.name || 'Plan'}): ${activeMatches
          .map(
            (v) =>
              `${v.roomName} measures ${v.blocked ? 'No open route' : `${v.measuredValue} ${v.unit}`} vs limit ${v.comparator} ${v.limitValue} ${v.unit}`
          )
          .join('; ')}.`
      : '';

  return {
    source: 'lexical-rag',
    retrievalMode: 'bm25-lexical',
    citations: top.map(({ chunk, score }) => ({
      id: chunk.id,
      docId: chunk.docId,
      clause: `${chunk.part} — ${chunk.clause}`,
      title: chunk.title,
      excerpt: chunk.text,
      score,
      basis: chunk.basis,
    })),
    answerEn: best
      ? `${best.part}, ${best.clause} (${best.basis === 'verified' ? 'BNBC verified limit' : 'Advisory screening threshold'}): ${best.text}${activeNote}`
      : 'No indexed BNBC or Imarat Bidhimala clause matched that query.',
    answerBn: '',
  };
}

export interface ScrutinyTriage {
  disposition: 'RETURN_FOR_CORRECTIONS' | 'CONDITIONAL_REVIEW' | 'CLEARED_PRE_CHECK';
  dispositionLabel: string;
  totalHeightM: number;
  isHighRise: boolean;
  dimensionTamperAlerts: number;
  zoningFlagCount: number;
  habAndStairFlagCount: number;
  egressFlagCount: number;
  totalRoomsAudited: number;
  checksEvaluated: number;
  estimatedManualMinutesSaved: number;
  summaryPoints: string[];
}

export function buildScrutinyTriage(
  project: BuildingProject,
  audit: ComplianceAudit
): ScrutinyTriage {
  const totalHeightM = Number((project.floors.length * project.storyHeightM).toFixed(1));
  const isHighRise = totalHeightM > 20;
  const dimensionTamperAlerts = audit.violations.filter(
    (v) => v.category === 'dimension_integrity'
  ).length;
  const zoningFlagCount = audit.violations.filter(
    (v) => v.category === 'zoning_far' || v.category === 'fire_access'
  ).length;
  const habAndStairFlagCount = audit.violations.filter(
    (v) => v.category === 'habitability_ventilation' || v.category === 'stair_safety'
  ).length;
  const egressFlagCount = audit.violations.filter(
    (v) =>
      v.category === 'egress_travel' ||
      v.category === 'passage_width' ||
      v.category === 'exit_obstruction' ||
      v.category === 'egress_capacity'
  ).length;
  const totalRoomsAudited = project.floors.reduce((s, f) => s + f.rooms.length, 0);
  const checksEvaluated = audit.passedCount + audit.failCount + audit.warnCount;
  const estimatedManualMinutesSaved = Math.max(
    18,
    Math.round(totalRoomsAudited * 2.5 + project.floors.length * 18)
  );

  const disposition: ScrutinyTriage['disposition'] =
    audit.failCount > 0
      ? 'RETURN_FOR_CORRECTIONS'
      : audit.warnCount > 0 || isHighRise
        ? 'CONDITIONAL_REVIEW'
        : 'CLEARED_PRE_CHECK';

  const dispositionLabel =
    disposition === 'RETURN_FOR_CORRECTIONS'
      ? 'Objections Found — Revisions Required'
      : disposition === 'CONDITIONAL_REVIEW'
        ? 'Conditional — Officer Verification Required'
        : 'Cleared Pre-Submission Screening';

  const summaryPoints: string[] = [];
  if (dimensionTamperAlerts > 0) {
    summaryPoints.push(
      `Dimension override alert: ${dimensionTamperAlerts} CAD label${dimensionTamperAlerts === 1 ? '' : 's'} disagree with drawn wall geometry.`
    );
  }
  if (isHighRise) {
    summaryPoints.push(
      `High-rise statutory trigger: ${totalHeightM} m building height exceeds 20 m — requires FSCD high-rise clearance and protected fire lift / stair core.`
    );
  }
  if (zoningFlagCount > 0) {
    summaryPoints.push(
      `Zoning / site review: ${zoningFlagCount} screening alert${zoningFlagCount === 1 ? '' : 's'} on FAR, MGC, or perimeter setback.`
    );
  } else if (!audit.metrics || audit.metrics.plotAreaSqM <= 0) {
    summaryPoints.push(
      'Plot area and road width were not declared — verify FAR, MGC, and setbacks manually from site plan.'
    );
  }
  if (habAndStairFlagCount > 0) {
    summaryPoints.push(
      `Architectural & stair standards: ${habAndStairFlagCount} finding${habAndStairFlagCount === 1 ? '' : 's'} across room sizes, daylight openings, or stair notes.`
    );
  }
  if (egressFlagCount > 0) {
    summaryPoints.push(
      `Fire & life safety: ${egressFlagCount} egress bottleneck, locked exit, or travel distance issue${egressFlagCount === 1 ? '' : 's'}.`
    );
  }
  if (summaryPoints.length === 0) {
    summaryPoints.push('No geometric violations flagged across checked BNBC and screening rules.');
  }

  return {
    disposition,
    dispositionLabel,
    totalHeightM,
    isHighRise,
    dimensionTamperAlerts,
    zoningFlagCount,
    habAndStairFlagCount,
    egressFlagCount,
    totalRoomsAudited,
    checksEvaluated,
    estimatedManualMinutesSaved,
    summaryPoints,
  };
}

export function buildScrutinyObjectionSheetText(
  project: BuildingProject,
  audit: ComplianceAudit,
  role: ReviewerRole
): string {
  const triage = buildScrutinyTriage(project, audit);
  const m = audit.metrics;
  const title =
    role === 'government'
      ? 'DRAWFIX AI — PLAN SCRUTINY & OBJECTION WORKSHEET (ADVISORY DRAFT)'
      : 'DRAWFIX AI — ARCHITECT PRE-SUBMISSION VALIDATION CERTIFICATE (ADVISORY)';

  const lines: string[] = [
    title,
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `Project: ${project.name} | Occupancy: ${project.occupancyClass} | Floors: ${project.floors.length} (${triage.totalHeightM} m)`,
    `Disposition: ${triage.dispositionLabel}`,
    `Evaluated Locally (Zero External CAD Upload): ${triage.checksEvaluated} checks across ${triage.totalRoomsAudited} enclosed rooms`,
    '',
    '1. TRIAGE SUMMARY',
    ...triage.summaryPoints.map((p) => `- ${p}`),
    '',
  ];

  if (m) {
    lines.push(
      '2. ZONING & CAPACITY TELEMETRY',
      m.plotAreaSqM > 0
        ? `- Plot Area: ${m.plotAreaSqM} m2 | Footprint: ${m.groundFootprintSqM} m2 | MGC: ${m.mgcPercent}% (limit ${m.maxAllowedMgcPercent}%) | FAR: ${m.achievedFar} (limit ${m.maxAllowedFar})`
        : '- Plot / Road parameters omitted: Zoning FAR/MGC not screened.',
      `- Estimated Peak Floor Load: ${m.peakFloorLoad} persons (${m.totalOccupantLoad} total) | Ground Exit Capacity: ${m.groundExitCapacityPersons} persons | Stair Capacity: ${m.stairCapacityPersons} persons`,
      ''
    );
  }

  lines.push('3. ITEMIZED FINDINGS & CITATIONS');
  if (audit.violations.length === 0) {
    lines.push('- No findings flagged in automated geometry checks.');
  } else {
    audit.violations.forEach((v, idx) => {
      const fl = v.floorLabel ? `[${v.floorLabel}] ` : '';
      const meas = v.blocked ? 'No open route found' : `${v.measuredValue} ${v.unit}`;
      lines.push(
        `${idx + 1}. [${v.status} | ${(v.basis || 'screening').toUpperCase()}] ${fl}${v.ruleName} — ${v.roomName}`,
        `   Measured: ${meas} | Limit: ${v.comparator} ${v.limitValue} ${v.unit} | Clause: ${v.citation}`,
        `   Detail: ${v.description}`
      );
    });
  }

  lines.push(
    '',
    '4. ITEMS NOT CHECKED (OUTSIDE FLOOR-PLAN GEOMETRY)',
    ...(audit.notChecked && audit.notChecked.length > 0
      ? audit.notChecked.map((n) => `- ${n.floorLabel ? `[${n.floorLabel}] ` : ''}${n.item}: ${n.reason}`)
      : ['- Structural engineering calculations, fire-rating assemblies, MEP/HVAC, and soil report verification remain with licensed engineers and statutory officers.']),
    '',
    'NOTICE: Deterministic geometry measurements computed locally. Final statutory clearance rests exclusively with RAJUK, CDA, City Corporation, and FSCD.'
  );

  return lines.join('\n');
}
