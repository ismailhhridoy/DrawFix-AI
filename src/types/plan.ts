export type RoomTaxonomy =
  | 'bedroom'
  | 'habitable'
  | 'cabin'
  | 'corridor'
  | 'stair'
  | 'exit'
  | 'workfloor'
  | 'utility'
  | 'lobby';

export type OccupancyClass = 'industrial_rmg' | 'residential' | 'mixed';

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  floorIndex: number;
  localElevationM: number;
}

export interface WallSegment {
  id: string;
  start: Point2D;
  end: Point2D;
  thickness: number;
  layer: string;
  isExterior?: boolean;
}

export interface DoorEntity {
  id: string;
  position: Point2D;
  widthM: number;
  rotationDeg: number;
  layer: string;
  blockName: string;
  isExit: boolean;
  isLocked: boolean;
  connectsRooms?: [string, string];
  /** How the exit flag was decided: block name, position on the exterior wall, or the reviewer. */
  exitSource?: 'block-name' | 'exterior-wall' | 'manual' | 'none';
  /** Where the clear width came from: the wall gap measured in the drawing, or the block name. */
  widthSource?: 'wall-gap' | 'block-name' | 'default';
  /** True when the door sits in the outer wall of the floor plate. */
  onExterior?: boolean;
}

export interface WindowEntity {
  id: string;
  position: Point2D;
  widthM: number;
  rotationDeg: number;
  layer: string;
}

export interface StairEntity {
  id: string;
  polygon: Point2D[];
  centroid: Point2D;
  label: string;
  clearWidthM: number;
  headroomM: number;
  handrailHeightM: number;
  riserMm: number;
  treadMm: number;
  /** Which stair values were actually written in the drawing. Anything false is a placeholder and is never checked. */
  stated?: { width: boolean; headroom: boolean; handrail: boolean; step: boolean };
}

export interface DimensionEntity {
  id: string;
  start: Point2D;
  end: Point2D;
  measuredValueM: number;
  overrideText: string | null;
  parsedOverrideM: number | null;
  isStaleOverride: boolean;
  layer: string;
}

export interface RoomEntity {
  id: string;
  originalLabel: string;
  taxonomy: RoomTaxonomy;
  confidence: number;
  mappingSource: 'ai' | 'heuristic' | 'manual';
  mappingReason: string;
  polygon: Point2D[];
  centroid: Point2D;
  areaSqM: number;
  occupantLoad: number;
  floorIndex?: number;
  floorLabel?: string;
  /** 'polyline' = closed room boundary in the DXF; 'wall-enclosure' = area enclosed by walls, found by the parser. */
  boundarySource?: 'polyline' | 'wall-enclosure' | 'text-only';
  minWidthM?: number;
}

export interface LayerConventions {
  wallLayers: string[];
  doorLayers: string[];
  windowLayers: string[];
  stairLayers: string[];
  textLayers: string[];
  dimLayers: string[];
  unitMode: 'auto' | 'meters' | 'millimeters';
}

export interface SiteContext {
  plotAreaSqM: number;
  abuttingRoadWidthM: number;
  frontSetbackM: number;
  rearSetbackM: number;
  sideSetbackM: number;
  sprinklered: boolean;
  zoneLabel: string;
  /** True once plot data was supplied by a person (or a sample scenario). Zoning is not checked on guessed values. */
  declared?: boolean;
}

export interface ParsedFloorPlan {
  id: string;
  name: string;
  subtitle: string;
  sourceFileName: string;
  occupancyClass: OccupancyClass;
  units: 'meters' | 'millimeters';
  floorIndex?: number;
  floorLabel?: string;
  floorName?: string;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    widthM: number;
    heightM: number;
  };
  layersFound: string[];
  conventions: LayerConventions;
  walls: WallSegment[];
  doors: DoorEntity[];
  windows: WindowEntity[];
  stairs: StairEntity[];
  dimensions: DimensionEntity[];
  rooms: RoomEntity[];
  unmappedTexts: { text: string; position: Point2D; layer: string }[];
  parseNotes: string[];
  rawDxf?: string;
  /** Door-sized gaps found in the wall lines (used for door widths and room detection). */
  openings?: { id: string; a: Point2D; b: Point2D; center: Point2D; widthM: number }[];
  /** How exits were identified on this floor. */
  exitDetection?: 'block-name' | 'exterior-wall' | 'none';
}

export interface BuildingProject {
  id: string;
  name: string;
  subtitle: string;
  occupancyClass: OccupancyClass;
  storyHeightM: number;
  siteContext?: SiteContext;
  floors: ParsedFloorPlan[];
}

export interface RemediationDelta {
  id: string;
  targetType: 'door' | 'wall' | 'stair' | 'dimension';
  targetId: string;
  floorIndex?: number;
  floorLabel?: string;
  action:
    | 'unlock_exit'
    | 'widen_door'
    | 'widen_passage'
    | 'adjust_stair'
    | 'sync_dimension';
  summary: string;
  deltaBeforeM?: number;
  deltaAfterM?: number;
  wallShift?: {
    wallId: string;
    dx: number;
    dy: number;
  };
}

export interface ViolationExplanation {
  en: string;
  bn: string;
  actionEn: string;
  actionBn: string;
  source: 'gemini' | 'template';
}

export interface Violation {
  id: string;
  ruleId: string;
  ruleName: string;
  citation: string;
  category:
    | 'egress_travel'
    | 'passage_width'
    | 'exit_obstruction'
    | 'stair_safety'
    | 'dimension_integrity'
    | 'fire_access'
    | 'zoning_far'
    | 'habitability_ventilation'
    | 'egress_capacity'
    | 'input_required';
  floorIndex?: number;
  floorLabel?: string;
  roomId: string | null;
  roomName: string;
  measuredValue: number;
  limitValue: number;
  unit: string;
  comparator: '<=' | '>=' | '==';
  status: 'FAIL' | 'WARN' | 'PASS';
  severity: 'critical' | 'high' | 'medium';
  location: Point2D;
  description: string;
  fixSpec: RemediationDelta | null;
  aiExplanation?: ViolationExplanation;
  /** True when no walking route exists at all, so there is no distance to report. */
  blocked?: boolean;
  /** 'verified' = threshold read in the BNBC source text; 'screening' = prototype threshold, confirm before relying on it; 'drawing' = internal drawing consistency. */
  basis?: 'verified' | 'screening' | 'drawing';
  basisNote?: string;
}

export interface EscapePathResult {
  roomId: string;
  roomName: string;
  floorIndex?: number;
  floorLabel?: string;
  start: Point2D;
  targetExitId: string | null;
  targetExitName: string;
  viaStairLabel?: string | null;
  blocked: boolean;
  blockedReason?: string;
  path: Point2D[];
  path3D?: Point3D[];
  floorDistanceM?: number;
  stairDescentDistM?: number;
  groundDischargeDistM?: number;
  distanceM: number;
  estimatedTimeSec: number;
  walkingSpeedMps: number;
  bottleneckCount: number;
}

export interface FixNarration {
  headlineEn: string;
  headlineBn: string;
  summaryEn: string;
  summaryBn: string;
  bulletChanges: { en: string; bn: string }[];
  source: 'gemini' | 'template';
}

export interface FloorAuditSummary {
  floorIndex: number;
  floorLabel: string;
  floorName: string;
  failCount: number;
  warnCount: number;
  passedCount: number;
  worstEscapeSec: number;
  trappedRoomCount: number;
  occupantLoad?: number;
}

export interface ZoningAndCapacityMetrics {
  plotAreaSqM: number;
  groundFootprintSqM: number;
  totalBuildingAreaSqM: number;
  mgcPercent: number;
  maxAllowedMgcPercent: number;
  achievedFar: number;
  maxAllowedFar: number;
  travelLimitM: number;
  totalOccupantLoad: number;
  peakFloorLoad: number;
  groundExitCapacityPersons: number;
  stairCapacityPersons: number;
  sprinklered: boolean;
}

export interface ComplianceAudit {
  violations: Violation[];
  passedCount: number;
  failCount: number;
  warnCount: number;
  escapePaths: Record<string, EscapePathResult>;
  worstEscapeSec: number;
  trappedRoomCount: number;
  floorSummaries?: FloorAuditSummary[];
  metrics?: ZoningAndCapacityMetrics;
  /** Checks that were skipped because the drawing or the reviewer did not supply the data. */
  notChecked?: { item: string; reason: string; floorLabel?: string }[];
}

export interface RagClauseCitation {
  id: string;
  docId: string;
  clause: string;
  title: string;
  excerpt: string;
  score: number;
  basis?: 'verified' | 'screening' | 'drawing';
}

export interface RagQueryResponse {
  answerEn: string;
  answerBn: string;
  citations: RagClauseCitation[];
  source: 'gemini-rag' | 'lexical-rag';
  retrievalMode: 'hybrid-embedding' | 'bm25-lexical';
}

export interface DeficiencyMemo {
  subjectEn: string;
  subjectBn: string;
  decisionStatus: 'OBJECTION_RAISED' | 'CONDITIONAL_REVIEW' | 'CLEARED_FOR_FILING';
  memoBodyEn: string;
  memoBodyBn: string;
  citedClauses: string[];
  source: 'gemini-rag' | 'template';
}

export interface PermitChecklistItem {
  id: string;
  category: 'Zoning & Site' | 'Architectural & Code' | 'Fire & Life Safety' | 'Authority NOCs & Filing';
  title: string;
  requirement: string;
  citation: string;
  basis: 'verified' | 'screening' | 'drawing' | 'procedural';
  status: 'pass' | 'action_needed' | 'verify';
  measuredNote?: string;
}

export interface CorrectionResponseItem {
  itemNumber: string;
  objectionSummary: string;
  category: 'Zoning & Setback' | 'Fire & Egress' | 'Habitability & Space' | 'Stair Safety' | 'Documentation';
  resolutionStatus: 'resolved_in_copy' | 'linked_to_cad_finding' | 'needs_designer_action' | 'procedural_document';
  citedClause: string;
  cadEvidence: string;
  recommendedResponse: string;
}

export interface CorrectionPackage {
  authorityName: string;
  projectSummary: string;
  source: 'gemini-rag' | 'deterministic';
  items: CorrectionResponseItem[];
  responseLetter: string;
}

export type AppStep =
  | 'landing'
  | 'upload'
  | 'review'
  | 'report'
  | 'compare'
  | 'simulate'
  | 'permits'
  | 'export';

