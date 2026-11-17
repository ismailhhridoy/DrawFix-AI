export type RoomTaxonomy =
  | 'bedroom'
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
    | 'egress_capacity';
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
}

export interface RagClauseCitation {
  id: string;
  docId: string;
  clause: string;
  title: string;
  excerpt: string;
  score: number;
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

export type AppStep =
  | 'landing'
  | 'upload'
  | 'review'
  | 'report'
  | 'compare'
  | 'simulate'
  | 'export';
