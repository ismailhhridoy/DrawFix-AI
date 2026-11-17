import type { SiteContext } from '../types/plan';

export interface SamplePlanMeta {
  id: 'gazipur-complex' | 'mirpur-rmg' | 'dhanmondi-res';
  name: string;
  subtitle: string;
  fileName: string;
  occupancyClass: 'industrial_rmg' | 'residential';
  summary: string;
  dxfContent: string;
}

function buildDxf(
  insunits: 4 | 6,
  entities: string[]
): string {
  return [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1024',
    '9',
    '$INSUNITS',
    '70',
    String(insunits),
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
    ...entities,
    '0',
    'ENDSEC',
    '0',
    'EOF',
    '',
  ].join('\n');
}

function dxfLine(layer: string, x1: number, y1: number, x2: number, y2: number): string {
  return [
    '0', 'LINE',
    '8', layer,
    '10', String(x1),
    '20', String(y1),
    '11', String(x2),
    '21', String(y2),
  ].join('\n');
}

function dxfClosedPoly(layer: string, pts: [number, number][]): string {
  const lines = [
    '0', 'LWPOLYLINE',
    '8', layer,
    '90', String(pts.length),
    '70', '1',
  ];
  for (const [x, y] of pts) {
    lines.push('10', String(x), '20', String(y));
  }
  return lines.join('\n');
}

function dxfInsert(
  layer: string,
  blockName: string,
  x: number,
  y: number,
  rotationDeg = 0,
  scaleX = 1,
  scaleY = 1
): string {
  return [
    '0', 'INSERT',
    '8', layer,
    '2', blockName,
    '10', String(x),
    '20', String(y),
    '41', String(scaleX),
    '42', String(scaleY),
    '50', String(rotationDeg),
  ].join('\n');
}

function dxfText(layer: string, x: number, y: number, text: string, height = 350): string {
  return [
    '0', 'TEXT',
    '8', layer,
    '10', String(x),
    '20', String(y),
    '40', String(height),
    '1', text,
  ].join('\n');
}

function dxfDimension(
  layer: string,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  actualMeasurement: number,
  overrideText: string
): string {
  const mx = (p1x + p2x) / 2;
  const my = (p1y + p2y) / 2;
  return [
    '0', 'DIMENSION',
    '8', layer,
    '10', String(p2x),
    '20', String(p2y),
    '11', String(mx),
    '21', String(my),
    '13', String(p1x),
    '23', String(p1y),
    '14', String(p2x),
    '24', String(p2y),
    '42', String(actualMeasurement),
    '1', overrideText,
  ].join('\n');
}

/**
 * Generates a realistic 26m x 16m AutoCAD DXF (millimeters, $INSUNITS=4)
 * for a garment production + supervisor cabin floor plan with documented BNBC violations.
 */
export function generateMirpurRmgDxf(): string {
  const entities: string[] = [
    // Perimeter walls (26000 x 16000 mm)
    // Bottom wall with South Main Exit gap at x=6800..8000 (1200mm)
    dxfLine('A-WALL-EXT', 0, 0, 6800, 0),
    dxfLine('A-WALL-EXT', 8000, 0, 26000, 0),
    // Right wall with East Roof-Stair Exit gap at y=7750..8700 (950mm, LOCKED in Before state)
    dxfLine('A-WALL-EXT', 26000, 0, 26000, 7750),
    dxfLine('A-WALL-EXT', 26000, 8700, 26000, 16000),
    // Top wall
    dxfLine('A-WALL-EXT', 26000, 16000, 0, 16000),
    // Left wall
    dxfLine('A-WALL-EXT', 0, 16000, 0, 0),

    // West / East structural partition at x=11500 with corridor door gap y=6800..8000
    dxfLine('A-WALL', 11500, 0, 11500, 6800),
    dxfLine('A-WALL', 11500, 8000, 11500, 16000),

    // SEW-LINE-A north wall (y=10000) with door to LOBBY-W at x=9600..10700
    dxfLine('A-WALL', 0, 10000, 9600, 10000),
    dxfLine('A-WALL', 10700, 10000, 11500, 10000),

    // STAIR-N enclosure (0..5000, 10000..16000) with door to LOBBY-W at x=5000, y=11200..12300
    dxfLine('A-WALL', 5000, 10000, 5000, 11200),
    dxfLine('A-WALL', 5000, 12300, 5000, 16000),

    // South-East bays: PACKING-BAY (11500..18500, 0..6500) & STORE-CHEM (18500..26000, 0..6500)
    dxfLine('A-WALL', 11500, 6500, 14500, 6500),
    dxfLine('A-WALL', 15500, 6500, 21400, 6500),
    dxfLine('A-WALL', 22350, 6500, 26000, 6500),
    dxfLine('A-WALL', 18500, 0, 18500, 6500),

    // North-East rooms: সার্ভিস কক্ষ (11500..18000, 9000..16000) & CBN-14 (18000..24000, 7120..16000)
    // Door to সার্ভিস কক্ষ at y=9000, x=11800..12800
    dxfLine('A-WALL', 11500, 9000, 11800, 9000),
    dxfLine('A-WALL', 12800, 9000, 18000, 9000),
    // Partition between সার্ভিস কক্ষ and CBN-14
    dxfLine('A-WALL', 18000, 7120, 18000, 16000),
    // Pinch wall of CBN-14 protruding south to y=7120 (leaving 620mm corridor vs y=6500!)
    // Door to CBN-14 south corridor at x=20400..21250
    dxfLine('A-WALL', 18000, 7120, 20400, 7120),
    dxfLine('A-WALL', 21250, 7120, 24000, 7120),
    // East wall of CBN-14 at x=24000 with door to East Vestibule at y=11000..11900
    dxfLine('A-WALL', 24000, 7120, 24000, 11000),
    dxfLine('A-WALL', 24000, 11900, 24000, 16000),

    // Closed room boundary polygons on A-AREA-POLY for exact room detection
    dxfClosedPoly('A-AREA-POLY', [[0, 0], [11500, 0], [11500, 10000], [0, 10000]]),
    dxfClosedPoly('A-AREA-POLY', [[0, 10000], [5000, 10000], [5000, 16000], [0, 16000]]),
    dxfClosedPoly('A-AREA-POLY', [[5000, 10000], [11500, 10000], [11500, 16000], [5000, 16000]]),
    dxfClosedPoly('A-AREA-POLY', [[11500, 0], [18500, 0], [18500, 6500], [11500, 6500]]),
    dxfClosedPoly('A-AREA-POLY', [[18500, 0], [26000, 0], [26000, 6500], [18500, 6500]]),
    dxfClosedPoly('A-AREA-POLY', [[11500, 9000], [18000, 9000], [18000, 16000], [11500, 16000]]),
    dxfClosedPoly('A-AREA-POLY', [[18000, 7120], [24000, 7120], [24000, 16000], [18000, 16000]]),
    dxfClosedPoly('A-AREA-POLY', [
      [11500, 6500], [26000, 6500], [26000, 16000], [24000, 16000],
      [24000, 7120], [18000, 7120], [18000, 9000], [11500, 9000],
    ]),

    // Doors (INSERT entities with block names indicating width/exit/locked state)
    dxfInsert('A-DOOR', 'EXIT_MAIN_1200', 7400, 0, 0),
    dxfInsert('A-DOOR', 'EXIT_ROOF_LOCKED_950', 26000, 8225, 90),
    dxfInsert('A-DOOR', 'DOOR_1200', 11500, 7400, 90),
    dxfInsert('A-DOOR', 'DOOR_1100', 10150, 10000, 0),
    dxfInsert('A-DOOR', 'DOOR_1100', 5000, 11750, 90),
    dxfInsert('A-DOOR', 'DOOR_1000', 15000, 6500, 0),
    dxfInsert('A-DOOR', 'DOOR_950', 21875, 6500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 12300, 9000, 0),
    dxfInsert('A-DOOR', 'DOOR_850', 20825, 7120, 0),
    dxfInsert('A-DOOR', 'DOOR_900', 24000, 11450, 90),

    // Windows
    dxfInsert('A-GLAZ', 'WIN_2400', 2400, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 15000, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2000', 22200, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2000', 14800, 16000, 0),
    dxfInsert('A-GLAZ', 'WIN_2000', 21000, 16000, 0),

    // Stair geometry & BNBC stair inspection metadata
    dxfClosedPoly('A-STAIR', [[500, 10800], [4500, 10800], [4500, 15200], [500, 15200]]),
    dxfText('A-STAIR', 2500, 13000, 'STAIR-N HEADROOM=1.95 HANDRAIL=0.82 RISER=178 TREAD=255 WIDTH=1.05', 220),

    // Room labels (abbreviated + Bangla CAD conventions)
    dxfText('A-TEXT', 5700, 5000, 'SEW-LINE-A', 420),
    dxfText('A-TEXT', 2500, 13600, 'STAIR-N', 340),
    dxfText('A-TEXT', 8200, 13000, 'LOBBY-W', 360),
    dxfText('A-TEXT', 15000, 3200, 'PACKING-BAY', 360),
    dxfText('A-TEXT', 22200, 3200, 'STORE-CHEM', 360),
    dxfText('A-TEXT', 14750, 12500, 'সার্ভিস কক্ষ', 360),
    dxfText('A-TEXT', 21000, 11800, 'CBN-14', 380),
    dxfText('A-TEXT', 15500, 7750, 'CORR-MAIN', 320),

    // Dimension across pinch corridor (actual 620mm, stale override text "1.20m")
    dxfDimension('A-DIM', 19500, 6500, 19500, 7120, 620, '1.20m'),
    // Accurate dimension across main corridor (actual 2500mm)
    dxfDimension('A-DIM', 13200, 6500, 13200, 9000, 2500, '2.50m'),
  ];

  return buildDxf(4, entities);
}

/**
 * Generates a realistic 20m x 14m AutoCAD DXF (meters, $INSUNITS=6)
 * for a 4-unit Dhaka residential apartment floor.
 */
export function generateDhanmondiResidentialDxf(): string {
  const entities: string[] = [
    // Perimeter walls (20m x 14m)
    dxfLine('WALL', 0, 0, 20, 0),
    // East Fire Exit gap at y=6.05..6.85 (0.80m, LOCKED in Before state)
    dxfLine('WALL', 20, 0, 20, 6.05),
    dxfLine('WALL', 20, 6.85, 20, 14),
    // North exit gap at x=3.2..3.98 (0.78m narrow exit!)
    dxfLine('WALL', 20, 14, 3.98, 14),
    dxfLine('WALL', 3.2, 14, 0, 14),
    dxfLine('WALL', 0, 14, 0, 0),

    // Central horizontal corridor (y=6.0 to y=7.6; narrows near east wing!)
    // South corridor wall (y=6.0) with doors to Unit A (x=4.5..5.4) and Unit B (x=14.0..14.9)
    dxfLine('WALL', 0, 6.0, 4.5, 6.0),
    dxfLine('WALL', 5.4, 6.0, 14.0, 6.0),
    dxfLine('WALL', 14.9, 6.0, 20, 6.0),
    dxfLine('WALL', 10, 0, 10, 6.0),

    // North corridor wall (y=7.6 west of x=14.5, narrows to y=6.68 east of x=14.5 => 0.68m pinch!)
    // Stair core x=0..4.5, y=7.6..14
    dxfLine('WALL', 4.5, 7.6, 4.5, 14),
    // Door from corridor to stair core at x=3.1..4.0, y=7.6
    dxfLine('WALL', 0, 7.6, 3.1, 7.6),
    dxfLine('WALL', 4.0, 7.6, 5.0, 7.6),
    // Door to BR-1 at x=5.0..5.85
    dxfLine('WALL', 5.85, 7.6, 14.5, 7.6),
    dxfLine('WALL', 14.5, 6.68, 14.5, 14),
    // Pinch wall for শয়নকক্ষ ২ at y=6.68 with door at x=16.8..17.65
    dxfLine('WALL', 14.5, 6.68, 16.8, 6.68),
    dxfLine('WALL', 17.65, 6.68, 20, 6.68),

    // Room boundary polygons
    dxfClosedPoly('ROOM-POLY', [[0, 0], [10, 0], [10, 6.0], [0, 6.0]]),
    dxfClosedPoly('ROOM-POLY', [[10, 0], [20, 0], [20, 6.0], [10, 6.0]]),
    dxfClosedPoly('ROOM-POLY', [[0, 7.6], [4.5, 7.6], [4.5, 14], [0, 14]]),
    dxfClosedPoly('ROOM-POLY', [[4.5, 7.6], [14.5, 7.6], [14.5, 14], [4.5, 14]]),
    dxfClosedPoly('ROOM-POLY', [[14.5, 6.68], [20, 6.68], [20, 14], [14.5, 14]]),
    dxfClosedPoly('ROOM-POLY', [
      [0, 6.0], [20, 6.0], [20, 6.68], [14.5, 6.68], [14.5, 7.6], [0, 7.6],
    ]),

    // Doors
    dxfInsert('DOOR', 'EXIT_FIRE_780', 3.59, 14, 180),
    dxfInsert('DOOR', 'EXIT_EAST_LOCKED_800', 20, 6.45, 90),
    dxfInsert('DOOR', 'DOOR_900', 3.55, 7.6, 0),
    dxfInsert('DOOR', 'DOOR_900', 4.95, 6.0, 0),
    dxfInsert('DOOR', 'DOOR_900', 14.45, 6.0, 0),
    dxfInsert('DOOR', 'DOOR_850', 5.42, 7.6, 0),
    dxfInsert('DOOR', 'DOOR_850', 17.22, 6.68, 0),

    // Windows
    dxfInsert('WINDOW', 'WIN_1800', 5.0, 0, 0),
    dxfInsert('WINDOW', 'WIN_1800', 15.0, 0, 0),
    dxfInsert('WINDOW', 'WIN_1600', 9.5, 14, 0),
    dxfInsert('WINDOW', 'WIN_1600', 17.2, 14, 0),

    // Stair
    dxfClosedPoly('STAIR', [[0.5, 8.2], [4.0, 8.2], [4.0, 13.4], [0.5, 13.4]]),
    dxfText('STAIR', 2.2, 10.5, 'STAIR-CORE HEADROOM=2.05 HANDRAIL=0.86 RISER=172 TREAD=266 WIDTH=1.15', 0.2),

    // Room labels
    dxfText('TEXT', 5.0, 3.0, 'LIVING-UNIT-A', 0.35),
    dxfText('TEXT', 15.0, 3.0, 'UNIT-B-EAST', 0.35),
    dxfText('TEXT', 2.25, 11.4, 'STAIR-CORE', 0.3),
    dxfText('TEXT', 9.5, 10.8, 'BR-1', 0.38),
    dxfText('TEXT', 17.2, 10.4, 'শয়নকক্ষ ২', 0.35),
    dxfText('TEXT', 7.5, 6.8, 'CORR-CENTRAL', 0.3),

    // Dimension across east pinch corridor (0.68m actual vs 1.10m stale override)
    dxfDimension('DIM', 15.8, 6.0, 15.8, 6.68, 0.68, '1.10m'),
  ];

  return buildDxf(6, entities);
}

/**
 * Generates a complex 38.0m x 22.0m H-shaped multi-wing industrial & admin floor DXF
 * ($INSUNITS=4, millimeters) with 16 rooms, an indented open courtyard, 2 staircases,
 * 4 exterior exits (1 locked, 1 narrow), a 0.65m pinch corridor, and stale dimension override.
 */
export function generateGazipurComplexDxf(): string {
  const entities: string[] = [
    // Perimeter envelope (38000 x 22000 mm) with North Courtyard setback (x=14000..26000, y=18000..22000)
    // Bottom wall (y=0) with EXIT_SOUTH_MAIN_1500 at x=19200..20700
    dxfLine('A-WALL-EXT', 0, 0, 19200, 0),
    dxfLine('A-WALL-EXT', 20700, 0, 38000, 0),
    // Right wall (x=38000) with EXIT_EAST_LOCKED_850 at y=11350..12200
    dxfLine('A-WALL-EXT', 38000, 0, 38000, 11350),
    dxfLine('A-WALL-EXT', 38000, 12200, 38000, 22000),
    // Top East Wing roof wall (x=26000..38000, y=22000)
    dxfLine('A-WALL-EXT', 38000, 22000, 26000, 22000),
    // Courtyard East wall (x=26000, y=18000..22000)
    dxfLine('A-WALL-EXT', 26000, 22000, 26000, 18000),
    // Courtyard South wall (y=18000, x=14000..26000) with EXIT_NORTH_780 at x=19920..20700
    dxfLine('A-WALL-EXT', 26000, 18000, 20700, 18000),
    dxfLine('A-WALL-EXT', 19920, 18000, 14000, 18000),
    // Courtyard West wall (x=14000, y=18000..22000)
    dxfLine('A-WALL-EXT', 14000, 18000, 14000, 22000),
    // Top West Wing roof wall (x=0..14000, y=22000)
    dxfLine('A-WALL-EXT', 14000, 22000, 0, 22000),
    // Left wall (x=0) with EXIT_WEST_1200 at y=11400..12600
    dxfLine('A-WALL-EXT', 0, 22000, 0, 12600),
    dxfLine('A-WALL-EXT', 0, 11400, 0, 0),

    // === WEST WING PARTITIONS (x=0..14000) ===
    // Divider CUTTING-HALL-1 (0..7500) | SEW-LINE-1 (7500..14000)
    dxfLine('A-WALL', 7500, 0, 7500, 10500),
    // Divider SEW-LINE-2 (0..8500) | QC-INSPECT (8500..14000)
    dxfLine('A-WALL', 8500, 13000, 8500, 22000),
    // South spine wall y=10500 (doors at x=4200..5400 & x=7900..9100)
    dxfLine('A-WALL', 0, 10500, 4200, 10500),
    dxfLine('A-WALL', 5400, 10500, 7900, 10500),
    dxfLine('A-WALL', 9100, 10500, 14000, 10500),
    // North spine wall y=13000 (doors at x=4200..5400 & x=8800..9800)
    dxfLine('A-WALL', 0, 13000, 4200, 13000),
    dxfLine('A-WALL', 5400, 13000, 8800, 13000),
    dxfLine('A-WALL', 9800, 13000, 14000, 13000),

    // === CENTRAL CORE PARTITIONS (x=14000..26000) ===
    // North core rooms (y=13000..18000): STAIR-CORE-A (14..18.5), LIFT-LOBBY (18.5..22), চিকিৎসা কক্ষ (22..26)
    dxfLine('A-WALL', 14000, 13000, 14000, 18000),
    dxfLine('A-WALL', 18500, 13000, 18500, 18000),
    dxfLine('A-WALL', 22000, 13000, 22000, 18000),
    dxfLine('A-WALL', 26000, 13000, 26000, 18000),
    // Central North spine wall y=13000
    dxfLine('A-WALL', 14000, 13000, 15800, 13000),
    dxfLine('A-WALL', 17000, 13000, 19500, 13000),
    dxfLine('A-WALL', 21000, 13000, 23200, 13000),
    dxfLine('A-WALL', 24200, 13000, 26000, 13000),

    // South core rooms (y=0..10500): ELEC-SWITCHGEAR (14..18.5), MAIN-ATRIUM (18.5..22), PRAYER-HALL (22..26)
    dxfLine('A-WALL', 14000, 0, 14000, 10500),
    dxfLine('A-WALL', 18500, 0, 18500, 10500),
    dxfLine('A-WALL', 22000, 0, 22000, 5000),
    dxfLine('A-WALL', 22000, 6200, 22000, 10500),
    dxfLine('A-WALL', 26000, 0, 26000, 10500),
    // Central South spine wall y=10500
    dxfLine('A-WALL', 14000, 10500, 15800, 10500),
    dxfLine('A-WALL', 16800, 10500, 19200, 10500),
    dxfLine('A-WALL', 21200, 10500, 23400, 10500),
    dxfLine('A-WALL', 24400, 10500, 26000, 10500),

    // === EAST WING PARTITIONS (x=26000..38000) ===
    // South bays (y=0..10500): IRON-FINISHING (26000..32000), PACKING-BAY (32000..38000)
    dxfLine('A-WALL', 32000, 0, 32000, 10500),
    dxfLine('A-WALL', 26000, 10500, 28400, 10500),
    dxfLine('A-WALL', 29600, 10500, 35800, 10500),
    dxfLine('A-WALL', 36800, 10500, 38000, 10500),

    // North-East wing (y=11150..22000):
    // CHEM-STORE (26000..31000, 13000..22000)
    dxfLine('A-WALL', 26000, 13000, 29700, 13000),
    dxfLine('A-WALL', 30700, 13000, 31000, 13000),
    dxfLine('A-WALL', 31000, 11150, 31000, 22000),
    // CBN-12-SUPV (31000..34000, 11150..22000) & CBN-14-QA (34000..36000, 11150..22000)
    // Pinch wall at y=11150 leaves 650mm corridor vs y=10500!
    dxfLine('A-WALL', 31000, 11150, 32800, 11150),
    dxfLine('A-WALL', 33700, 11150, 36000, 11150),
    dxfLine('A-WALL', 34000, 11150, 34000, 22000),
    // STAIR-CORE-B (36000..38000, 13000..22000) + East Vestibule opening south to EXIT_EAST_LOCKED_850
    dxfLine('A-WALL', 36000, 11150, 36000, 15000),
    dxfLine('A-WALL', 36000, 16000, 36000, 22000),
    dxfLine('A-WALL', 36000, 13000, 36500, 13000),
    dxfLine('A-WALL', 37600, 13000, 38000, 13000),

    // === CLOSED ROOM POLYGONS ===
    dxfClosedPoly('A-AREA-POLY', [[0, 0], [7500, 0], [7500, 10500], [0, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[7500, 0], [14000, 0], [14000, 10500], [7500, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[0, 13000], [8500, 13000], [8500, 22000], [0, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[8500, 13000], [14000, 13000], [14000, 22000], [8500, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[14000, 13000], [18500, 13000], [18500, 18000], [14000, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[18500, 13000], [22000, 13000], [22000, 18000], [18500, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[22000, 13000], [26000, 13000], [26000, 18000], [22000, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[14000, 0], [18500, 0], [18500, 10500], [14000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[18500, 0], [22000, 0], [22000, 10500], [18500, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[22000, 0], [26000, 0], [26000, 10500], [22000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[26000, 0], [32000, 0], [32000, 10500], [26000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[32000, 0], [38000, 0], [38000, 10500], [32000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[26000, 13000], [31000, 13000], [31000, 22000], [26000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[31000, 11150], [34000, 11150], [34000, 22000], [31000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[34000, 11150], [36000, 11150], [36000, 22000], [34000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[36000, 13000], [38000, 13000], [38000, 22000], [36000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [
      [0, 10500], [38000, 10500], [38000, 13000], [36000, 13000],
      [36000, 11150], [31000, 11150], [31000, 13000], [0, 13000],
    ]),

    // === DOORS & EXITS ===
    dxfInsert('A-DOOR', 'EXIT_WEST_1200', 0, 12000, 90),
    dxfInsert('A-DOOR', 'EXIT_SOUTH_MAIN_1500', 19950, 0, 0),
    dxfInsert('A-DOOR', 'EXIT_NORTH_780', 20310, 18000, 180),
    dxfInsert('A-DOOR', 'EXIT_EAST_LOCKED_850', 38000, 11775, 90),

    dxfInsert('A-DOOR', 'DOOR_1200', 4800, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 8500, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 4800, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 9300, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 16400, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1500', 20250, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 23700, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 16300, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_2000', 20200, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 22000, 5600, 90),
    dxfInsert('A-DOOR', 'DOOR_1000', 23900, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 29000, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 36300, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 30200, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_900', 33250, 11150, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 36000, 15500, 90),
    dxfInsert('A-DOOR', 'DOOR_1100', 37050, 13000, 0),

    // === WINDOWS ===
    dxfInsert('A-GLAZ', 'WIN_2400', 3750, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 10750, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 29000, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 35000, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 4250, 22000, 0),
    dxfInsert('A-GLAZ', 'WIN_2000', 11250, 22000, 0),
    dxfInsert('A-GLAZ', 'WIN_2000', 28500, 22000, 0),
    dxfInsert('A-GLAZ', 'WIN_2000', 32600, 22000, 0),

    // === STAIR CORES ===
    dxfClosedPoly('A-STAIR', [[14600, 13600], [17900, 13600], [17900, 17400], [14600, 17400]]),
    dxfText('A-STAIR', 16250, 15200, 'STAIR-CORE-A HEADROOM=2.02 HANDRAIL=0.84 RISER=176 TREAD=260 WIDTH=1.20', 200),
    dxfClosedPoly('A-STAIR', [[36500, 13800], [37700, 13800], [37700, 21200], [36500, 21200]]),
    dxfText('A-STAIR', 37100, 17500, 'STAIR-CORE-B HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),

    // === ROOM LABELS ===
    dxfText('A-TEXT', 3750, 5200, 'CUTTING-HALL-1', 420),
    dxfText('A-TEXT', 10750, 5200, 'SEW-LINE-1', 420),
    dxfText('A-TEXT', 4250, 17500, 'SEW-LINE-2', 420),
    dxfText('A-TEXT', 11250, 17500, 'QC-INSPECT', 380),
    dxfText('A-TEXT', 16250, 15800, 'STAIR-CORE-A', 320),
    dxfText('A-TEXT', 20250, 15500, 'LIFT-LOBBY', 340),
    dxfText('A-TEXT', 24000, 15500, 'চিকিৎসা কক্ষ', 340),
    dxfText('A-TEXT', 16250, 5200, 'ELEC-SWITCHGEAR', 340),
    dxfText('A-TEXT', 20250, 5200, 'MAIN-ATRIUM', 360),
    dxfText('A-TEXT', 24000, 5200, 'PRAYER-HALL', 340),
    dxfText('A-TEXT', 29000, 5200, 'IRON-FINISHING', 380),
    dxfText('A-TEXT', 35000, 5200, 'PACKING-BAY', 380),
    dxfText('A-TEXT', 28500, 17500, 'CHEM-STORE', 360),
    dxfText('A-TEXT', 32600, 16600, 'CBN-12-SUPV', 320),
    dxfText('A-TEXT', 35200, 16600, 'CBN-14-QA', 300),
    dxfText('A-TEXT', 37100, 18200, 'STAIR-CORE-B', 260),
    dxfText('A-TEXT', 18000, 11750, 'CENTRAL-SPINE', 360),

    // === DIMENSIONS ===
    dxfDimension('A-DIM', 35200, 10500, 35200, 11150, 650, '1.20m'),
    dxfDimension('A-DIM', 17500, 10500, 17500, 13000, 2500, '2.50m'),
  ];

  return buildDxf(4, entities);
}

export const SAMPLE_PLANS: SamplePlanMeta[] = [
  {
    id: 'gazipur-complex',
    name: 'Gazipur Multi-Wing RMG Complex — Floor 2 (17 Zones)',
    subtitle: '38.0 m × 22.0 m · H-Shaped Industrial + Courtyard · Millimeters ($INSUNITS=4)',
    fileName: 'gazipur_multiwing_complex_f2.dxf',
    occupancyClass: 'industrial_rmg',
    summary:
      '17-zone multi-wing garment complex with open courtyard setback, 2 stair cores, Bangla clinic label (চিকিৎসা কক্ষ), locked east exit, narrow north exit, 0.65 m pinch corridor, and stale dimension override.',
    dxfContent: generateGazipurComplexDxf(),
  },
  {
    id: 'mirpur-rmg',
    name: 'Mirpur RMG Floor 4 — Garment & Cabin Annex',
    subtitle: '26.0 m × 16.0 m · Industrial / Mixed · Millimeters ($INSUNITS=4)',
    fileName: 'mirpur_rmg_floor4_audit.dxf',
    occupancyClass: 'industrial_rmg',
    summary:
      'Sewing line, packing bay, chemical store, supervisor cabin (CBN-14), Bangla utility room label, locked roof exit, 0.62 m corridor pinch point, and stair clearance deficit.',
    dxfContent: generateMirpurRmgDxf(),
  },
  {
    id: 'dhanmondi-res',
    name: 'Dhanmondi Residential Level 3 — 4-Unit Floor',
    subtitle: '20.0 m × 14.0 m · Residential · Meters ($INSUNITS=6)',
    fileName: 'dhanmondi_res_level3.dxf',
    occupancyClass: 'residential',
    summary:
      'Multi-unit apartment floor with bilingual bedroom labels (BR-1, শয়নকক্ষ ২), narrow 0.78 m north fire exit, 0.68 m east wing pinch corridor, and > 16 m travel path.',
    dxfContent: generateDhanmondiResidentialDxf(),
  },
];

export function generateGazipurGroundDxf(): string {
  const entities: string[] = [
    // Perimeter envelope (38000 x 22000 mm) with North Courtyard setback (14000..26000, 18000..22000)
    dxfLine('A-WALL-EXT', 0, 0, 19200, 0),
    dxfLine('A-WALL-EXT', 20700, 0, 38000, 0),
    dxfLine('A-WALL-EXT', 38000, 0, 38000, 11350),
    dxfLine('A-WALL-EXT', 38000, 12200, 38000, 22000),
    dxfLine('A-WALL-EXT', 38000, 22000, 26000, 22000),
    dxfLine('A-WALL-EXT', 26000, 22000, 26000, 18000),
    dxfLine('A-WALL-EXT', 26000, 18000, 20700, 18000),
    dxfLine('A-WALL-EXT', 19920, 18000, 14000, 18000),
    dxfLine('A-WALL-EXT', 14000, 18000, 14000, 22000),
    dxfLine('A-WALL-EXT', 14000, 22000, 0, 22000),
    dxfLine('A-WALL-EXT', 0, 22000, 0, 12600),
    dxfLine('A-WALL-EXT', 0, 11400, 0, 0),

    // West Wing (0..14000) with STAIR-CORE-W (0..4000, 13000..22000)
    dxfLine('A-WALL', 7500, 0, 7500, 10500),
    dxfLine('A-WALL', 0, 10500, 4200, 10500),
    dxfLine('A-WALL', 5400, 10500, 7900, 10500),
    dxfLine('A-WALL', 9100, 10500, 14000, 10500),
    dxfLine('A-WALL', 4000, 13000, 4000, 22000),
    dxfLine('A-WALL', 0, 13000, 1400, 13000),
    dxfLine('A-WALL', 2600, 13000, 7400, 13000),
    dxfLine('A-WALL', 8600, 13000, 14000, 13000),

    // Central Core (14000..26000)
    dxfLine('A-WALL', 14000, 13000, 14000, 18000),
    dxfLine('A-WALL', 18500, 13000, 18500, 18000),
    dxfLine('A-WALL', 22000, 13000, 22000, 18000),
    dxfLine('A-WALL', 26000, 13000, 26000, 18000),
    dxfLine('A-WALL', 14000, 13000, 15800, 13000),
    dxfLine('A-WALL', 17000, 13000, 19400, 13000),
    dxfLine('A-WALL', 21000, 13000, 23400, 13000),
    dxfLine('A-WALL', 24400, 13000, 26000, 13000),

    dxfLine('A-WALL', 14000, 0, 14000, 10500),
    dxfLine('A-WALL', 18500, 0, 18500, 10500),
    dxfLine('A-WALL', 22000, 0, 22000, 10500),
    dxfLine('A-WALL', 26000, 0, 26000, 10500),
    dxfLine('A-WALL', 14000, 10500, 15800, 10500),
    dxfLine('A-WALL', 16800, 10500, 19100, 10500),
    dxfLine('A-WALL', 21200, 10500, 23500, 10500),
    dxfLine('A-WALL', 24500, 10500, 26000, 10500),

    // East Wing (26000..38000) with STAIR-CORE-B (35000..38000, 13000..22000)
    dxfLine('A-WALL', 32000, 0, 32000, 10500),
    dxfLine('A-WALL', 26000, 10500, 28400, 10500),
    dxfLine('A-WALL', 29600, 10500, 35400, 10500),
    dxfLine('A-WALL', 36400, 10500, 38000, 10500),
    dxfLine('A-WALL', 26000, 13000, 30000, 13000),
    dxfLine('A-WALL', 31000, 13000, 35000, 13000),
    dxfLine('A-WALL', 35000, 13000, 35000, 22000),
    dxfLine('A-WALL', 35000, 13000, 35900, 13000),
    dxfLine('A-WALL', 37100, 13000, 38000, 13000),

    // Room polygons
    dxfClosedPoly('A-AREA-POLY', [[0, 0], [7500, 0], [7500, 10500], [0, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[7500, 0], [14000, 0], [14000, 10500], [7500, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[0, 13000], [4000, 13000], [4000, 22000], [0, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[4000, 13000], [14000, 13000], [14000, 22000], [4000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[14000, 13000], [18500, 13000], [18500, 18000], [14000, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[18500, 13000], [22000, 13000], [22000, 18000], [18500, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[22000, 13000], [26000, 13000], [26000, 18000], [22000, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[14000, 0], [18500, 0], [18500, 10500], [14000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[18500, 0], [22000, 0], [22000, 10500], [18500, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[22000, 0], [26000, 0], [26000, 10500], [22000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[26000, 0], [32000, 0], [32000, 10500], [26000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[32000, 0], [38000, 0], [38000, 10500], [32000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[26000, 13000], [35000, 13000], [35000, 22000], [26000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[35000, 13000], [38000, 13000], [38000, 22000], [35000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[0, 10500], [38000, 10500], [38000, 13000], [0, 13000]]),

    // Street Exits & Doors
    dxfInsert('A-DOOR', 'EXIT_WEST_1200', 0, 12000, 90),
    dxfInsert('A-DOOR', 'EXIT_SOUTH_MAIN_1500', 19950, 0, 0),
    dxfInsert('A-DOOR', 'EXIT_NORTH_780', 20310, 18000, 180),
    dxfInsert('A-DOOR', 'EXIT_EAST_LOCKED_850', 38000, 11775, 90),

    dxfInsert('A-DOOR', 'DOOR_1200', 4800, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 8500, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 2000, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 8000, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 16400, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1600', 20200, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 23900, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 16300, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_2100', 20150, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 24000, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 29000, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 35900, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 30500, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 36500, 13000, 0),

    // Windows
    dxfInsert('A-GLAZ', 'WIN_2400', 3750, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 10750, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 29000, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 35000, 0, 0),

    // 3 Aligned Stair Cores matching L2 & L3
    dxfClosedPoly('A-STAIR', [[500, 13600], [3500, 13600], [3500, 18400], [500, 18400]]),
    dxfText('A-STAIR', 2000, 16000, 'STAIR-CORE-W HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),
    dxfClosedPoly('A-STAIR', [[14600, 13600], [17900, 13600], [17900, 17400], [14600, 17400]]),
    dxfText('A-STAIR', 16250, 15200, 'STAIR-CORE-A HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),
    dxfClosedPoly('A-STAIR', [[35400, 13400], [37600, 13400], [37600, 16200], [35400, 16200]]),
    dxfText('A-STAIR', 36500, 14800, 'STAIR-CORE-B HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),

    // Labels
    dxfText('A-TEXT', 3750, 5200, 'LOADING-DOCK', 380),
    dxfText('A-TEXT', 10750, 5200, 'GROUND-SEW', 380),
    dxfText('A-TEXT', 2000, 17000, 'STAIR-CORE-W', 280),
    dxfText('A-TEXT', 9000, 17500, 'RAW-STORE', 380),
    dxfText('A-TEXT', 16250, 15800, 'STAIR-CORE-A', 300),
    dxfText('A-TEXT', 20250, 15500, 'RECEPTION-LOBBY', 320),
    dxfText('A-TEXT', 24000, 15500, 'FIRE-CONTROL', 320),
    dxfText('A-TEXT', 16250, 5200, 'ELEC-SWITCHGEAR', 320),
    dxfText('A-TEXT', 20250, 5200, 'MAIN-ATRIUM', 360),
    dxfText('A-TEXT', 24000, 5200, 'SECURITY-DESK', 320),
    dxfText('A-TEXT', 29000, 5200, 'FINISH-PACK-GF', 360),
    dxfText('A-TEXT', 35000, 5200, 'DISPATCH-BAY', 360),
    dxfText('A-TEXT', 30500, 17500, 'BULK-LOGISTICS', 380),
    dxfText('A-TEXT', 36500, 17200, 'STAIR-CORE-B', 260),
    dxfText('A-TEXT', 18000, 11750, 'GF-SPINE', 360),
  ];

  return buildDxf(4, entities);
}

export function generateGazipurLevel2UpperDxf(): string {
  const entities: string[] = [
    // Upper-floor perimeter envelope (38000 x 22000 mm) with North Courtyard setback
    dxfLine('A-WALL-EXT', 0, 0, 38000, 0),
    dxfLine('A-WALL-EXT', 38000, 0, 38000, 22000),
    dxfLine('A-WALL-EXT', 38000, 22000, 31000, 22000),
    dxfLine('A-WALL-EXT', 31000, 22000, 31000, 19000),
    dxfLine('A-WALL-EXT', 31000, 19000, 26000, 19000),
    dxfLine('A-WALL-EXT', 26000, 19000, 26000, 18000),
    dxfLine('A-WALL-EXT', 26000, 18000, 14000, 18000),
    dxfLine('A-WALL-EXT', 14000, 18000, 14000, 22000),
    dxfLine('A-WALL-EXT', 14000, 22000, 0, 22000),
    dxfLine('A-WALL-EXT', 0, 22000, 0, 0),

    // West Wing (0..14000) with STAIR-CORE-W (0..4000, 13000..22000)
    dxfLine('A-WALL', 7500, 0, 7500, 10500),
    dxfLine('A-WALL', 4000, 13000, 4000, 22000),
    dxfLine('A-WALL', 9000, 13000, 9000, 22000),
    dxfLine('A-WALL', 0, 10500, 4200, 10500),
    dxfLine('A-WALL', 5400, 10500, 11900, 10500),
    dxfLine('A-WALL', 13100, 10500, 14000, 10500),
    dxfLine('A-WALL', 0, 13000, 1400, 13000),
    dxfLine('A-WALL', 2600, 13000, 5800, 13000),
    dxfLine('A-WALL', 7000, 13000, 11000, 13000),
    dxfLine('A-WALL', 12000, 13000, 14000, 13000),

    // Central Core (14000..26000)
    dxfLine('A-WALL', 14000, 13000, 14000, 18000),
    dxfLine('A-WALL', 18500, 13000, 18500, 18000),
    dxfLine('A-WALL', 22000, 13000, 22000, 18000),
    dxfLine('A-WALL', 26000, 13000, 26000, 18000),
    dxfLine('A-WALL', 14000, 13000, 15800, 13000),
    dxfLine('A-WALL', 17000, 13000, 19500, 13000),
    dxfLine('A-WALL', 21000, 13000, 23200, 13000),
    dxfLine('A-WALL', 24200, 13000, 26000, 13000),

    dxfLine('A-WALL', 14000, 0, 14000, 10500),
    dxfLine('A-WALL', 18500, 0, 18500, 10500),
    dxfLine('A-WALL', 22000, 0, 22000, 5000),
    dxfLine('A-WALL', 22000, 6200, 22000, 10500),
    dxfLine('A-WALL', 26000, 0, 26000, 10500),
    dxfLine('A-WALL', 14000, 10500, 15800, 10500),
    dxfLine('A-WALL', 16800, 10500, 19200, 10500),
    dxfLine('A-WALL', 21200, 10500, 23400, 10500),
    dxfLine('A-WALL', 24400, 10500, 26000, 10500),

    // East Wing (26000..38000): 650mm pinch corridor at y=11150 vs y=10500 (x=31000..35000)
    dxfLine('A-WALL', 32000, 0, 32000, 10500),
    dxfLine('A-WALL', 26000, 10500, 30400, 10500),
    dxfLine('A-WALL', 31600, 10500, 35600, 10500),
    dxfLine('A-WALL', 36600, 10500, 38000, 10500),

    dxfLine('A-WALL', 26000, 13000, 29700, 13000),
    dxfLine('A-WALL', 30700, 13000, 31000, 13000),
    dxfLine('A-WALL', 31000, 11150, 31000, 22000),
    dxfLine('A-WALL', 31000, 11150, 32100, 11150),
    dxfLine('A-WALL', 33000, 11150, 35000, 11150),
    dxfLine('A-WALL', 33300, 11150, 33300, 22000),
    // STAIR-CORE-B (35000..38000, 13000..22000)
    dxfLine('A-WALL', 35000, 11150, 35000, 15000),
    dxfLine('A-WALL', 35000, 16000, 35000, 22000),
    dxfLine('A-WALL', 35000, 13000, 35900, 13000),
    dxfLine('A-WALL', 37100, 13000, 38000, 13000),

    // Room polygons
    dxfClosedPoly('A-AREA-POLY', [[0, 0], [7500, 0], [7500, 10500], [0, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[7500, 0], [14000, 0], [14000, 10500], [7500, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[0, 13000], [4000, 13000], [4000, 22000], [0, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[4000, 13000], [9000, 13000], [9000, 22000], [4000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[9000, 13000], [14000, 13000], [14000, 22000], [9000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[14000, 13000], [18500, 13000], [18500, 18000], [14000, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[18500, 13000], [22000, 13000], [22000, 18000], [18500, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[22000, 13000], [26000, 13000], [26000, 18000], [22000, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[14000, 0], [18500, 0], [18500, 10500], [14000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[18500, 0], [22000, 0], [22000, 10500], [18500, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[22000, 0], [26000, 0], [26000, 10500], [22000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[26000, 0], [32000, 0], [32000, 10500], [26000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[32000, 0], [38000, 0], [38000, 10500], [32000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[26000, 13000], [31000, 13000], [31000, 19000], [26000, 19000]]),
    dxfClosedPoly('A-AREA-POLY', [[31000, 11150], [33300, 11150], [33300, 22000], [31000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[33300, 11150], [35000, 11150], [35000, 22000], [33300, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[35000, 13000], [38000, 13000], [38000, 22000], [35000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [
      [0, 10500], [38000, 10500], [38000, 13000], [35000, 13000],
      [35000, 11150], [31000, 11150], [31000, 13000], [0, 13000],
    ]),

    // Doors
    dxfInsert('A-DOOR', 'DOOR_1200', 4800, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 12500, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 2000, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 6400, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 11500, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 16400, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1500', 20250, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 23700, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 16300, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_2000', 20200, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 22000, 5600, 90),
    dxfInsert('A-DOOR', 'DOOR_1000', 23900, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 31000, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 36100, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 30200, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_900', 32550, 11150, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 35000, 15500, 90),
    dxfInsert('A-DOOR', 'DOOR_1200', 36500, 13000, 0),

    // Windows
    dxfInsert('A-GLAZ', 'WIN_2400', 3750, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 10750, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 29000, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 35000, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 6500, 22000, 0),
    dxfInsert('A-GLAZ', 'WIN_2000', 28500, 19000, 0),

    // 3 Aligned Stair Cores (STAIR-CORE-A has headroom & handrail deficits on L2)
    dxfClosedPoly('A-STAIR', [[500, 13600], [3500, 13600], [3500, 18400], [500, 18400]]),
    dxfText('A-STAIR', 2000, 16000, 'STAIR-CORE-W HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),
    dxfClosedPoly('A-STAIR', [[14600, 13600], [17900, 13600], [17900, 17400], [14600, 17400]]),
    dxfText('A-STAIR', 16250, 15200, 'STAIR-CORE-A HEADROOM=2.02 HANDRAIL=0.84 RISER=176 TREAD=260 WIDTH=1.20', 180),
    dxfClosedPoly('A-STAIR', [[35400, 13400], [37600, 13400], [37600, 16200], [35400, 16200]]),
    dxfText('A-STAIR', 36500, 14800, 'STAIR-CORE-B HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),

    // Room labels
    dxfText('A-TEXT', 3750, 5200, 'CUTTING-HALL-1', 380),
    dxfText('A-TEXT', 10750, 5200, 'SEW-LINE-1', 380),
    dxfText('A-TEXT', 2000, 17000, 'STAIR-CORE-W', 260),
    dxfText('A-TEXT', 6500, 17500, 'SEW-LINE-2', 380),
    dxfText('A-TEXT', 11500, 17500, 'QC-INSPECT', 340),
    dxfText('A-TEXT', 16250, 15800, 'STAIR-CORE-A', 300),
    dxfText('A-TEXT', 20250, 15500, 'LIFT-LOBBY', 320),
    dxfText('A-TEXT', 24000, 15500, 'চিকিৎসা কক্ষ', 320),
    dxfText('A-TEXT', 16250, 5200, 'ELEC-SWITCHGEAR', 320),
    dxfText('A-TEXT', 20250, 5200, 'MAIN-ATRIUM', 360),
    dxfText('A-TEXT', 24000, 5200, 'PRAYER-HALL', 320),
    dxfText('A-TEXT', 29000, 5200, 'IRON-FINISHING', 360),
    dxfText('A-TEXT', 35000, 5200, 'PACKING-BAY', 360),
    dxfText('A-TEXT', 28500, 15600, 'CHEM-STORE', 360),
    dxfText('A-TEXT', 32150, 16600, 'CBN-12-SUPV', 280),
    dxfText('A-TEXT', 34150, 16600, 'CBN-14-QA', 260),
    dxfText('A-TEXT', 36500, 17200, 'STAIR-CORE-B', 260),
    dxfText('A-TEXT', 18000, 11750, 'L2-SPINE', 360),

    // Stale dimension override across 650mm pinch corridor
    dxfDimension('A-DIM', 33800, 10500, 33800, 11150, 650, '1.20m'),
  ];

  return buildDxf(4, entities);
}

export function generateGazipurLevel3Dxf(): string {
  const entities: string[] = [
    // Perimeter envelope (38000 x 22000 mm) with North Courtyard setback (14000..28000 at y=17000)
    dxfLine('A-WALL-EXT', 0, 0, 38000, 0),
    dxfLine('A-WALL-EXT', 38000, 0, 38000, 22000),
    dxfLine('A-WALL-EXT', 38000, 22000, 28000, 22000),
    dxfLine('A-WALL-EXT', 28000, 22000, 28000, 17000),
    dxfLine('A-WALL-EXT', 28000, 17000, 26000, 17000),
    dxfLine('A-WALL-EXT', 26000, 17000, 26000, 18000),
    dxfLine('A-WALL-EXT', 26000, 18000, 14000, 18000),
    dxfLine('A-WALL-EXT', 14000, 18000, 14000, 22000),
    dxfLine('A-WALL-EXT', 14000, 22000, 0, 22000),
    dxfLine('A-WALL-EXT', 0, 22000, 0, 0),

    // West Wing with STAIR-CORE-W (0..4000, 13000..22000)
    dxfLine('A-WALL', 7500, 0, 7500, 10500),
    dxfLine('A-WALL', 0, 10500, 4200, 10500),
    dxfLine('A-WALL', 5400, 10500, 11900, 10500),
    dxfLine('A-WALL', 13100, 10500, 14000, 10500),
    dxfLine('A-WALL', 4000, 13000, 4000, 22000),
    dxfLine('A-WALL', 0, 13000, 1400, 13000),
    dxfLine('A-WALL', 2600, 13000, 6400, 13000),
    dxfLine('A-WALL', 7600, 13000, 14000, 13000),

    // Central Core
    dxfLine('A-WALL', 14000, 13000, 14000, 18000),
    dxfLine('A-WALL', 18500, 13000, 18500, 18000),
    dxfLine('A-WALL', 26000, 13000, 26000, 18000),
    dxfLine('A-WALL', 14000, 13000, 15800, 13000),
    dxfLine('A-WALL', 17000, 13000, 21200, 13000),
    dxfLine('A-WALL', 22400, 13000, 26000, 13000),

    dxfLine('A-WALL', 14000, 0, 14000, 10500),
    dxfLine('A-WALL', 20000, 0, 20000, 10500),
    dxfLine('A-WALL', 26000, 0, 26000, 10500),
    dxfLine('A-WALL', 14000, 10500, 16500, 10500),
    dxfLine('A-WALL', 17700, 10500, 22400, 10500),
    dxfLine('A-WALL', 23600, 10500, 26000, 10500),

    // East Wing with 640mm pinch corridor at y=11140 vs y=10500 (x=28000..35000)
    dxfLine('A-WALL', 32000, 0, 32000, 10500),
    dxfLine('A-WALL', 26000, 10500, 30400, 10500),
    dxfLine('A-WALL', 31600, 10500, 35400, 10500),
    dxfLine('A-WALL', 36400, 10500, 38000, 10500),

    dxfLine('A-WALL', 26000, 13000, 26500, 13000),
    dxfLine('A-WALL', 27500, 13000, 28000, 13000),
    dxfLine('A-WALL', 28000, 11140, 28000, 22000),
    dxfLine('A-WALL', 28000, 11140, 29400, 11140),
    dxfLine('A-WALL', 30400, 11140, 33000, 11140),
    dxfLine('A-WALL', 34000, 11140, 35000, 11140),
    dxfLine('A-WALL', 32000, 11140, 32000, 22000),
    // STAIR-CORE-B (35000..38000, 13000..22000) with LOCKED stair entry door at y=13000!
    dxfLine('A-WALL', 35000, 11140, 35000, 22000),
    dxfLine('A-WALL', 35000, 13000, 36100, 13000),
    dxfLine('A-WALL', 36900, 13000, 38000, 13000),

    // Room polygons
    dxfClosedPoly('A-AREA-POLY', [[0, 0], [7500, 0], [7500, 10500], [0, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[7500, 0], [14000, 0], [14000, 10500], [7500, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[0, 13000], [4000, 13000], [4000, 22000], [0, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[4000, 13000], [14000, 13000], [14000, 22000], [4000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[14000, 13000], [18500, 13000], [18500, 18000], [14000, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[18500, 13000], [26000, 13000], [26000, 18000], [18500, 18000]]),
    dxfClosedPoly('A-AREA-POLY', [[14000, 0], [20000, 0], [20000, 10500], [14000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[20000, 0], [26000, 0], [26000, 10500], [20000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[26000, 0], [32000, 0], [32000, 10500], [26000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[32000, 0], [38000, 0], [38000, 10500], [32000, 10500]]),
    dxfClosedPoly('A-AREA-POLY', [[26000, 13000], [28000, 13000], [28000, 17000], [26000, 17000]]),
    dxfClosedPoly('A-AREA-POLY', [[28000, 11140], [32000, 11140], [32000, 22000], [28000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[32000, 11140], [35000, 11140], [35000, 22000], [32000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [[35000, 13000], [38000, 13000], [38000, 22000], [35000, 22000]]),
    dxfClosedPoly('A-AREA-POLY', [
      [0, 10500], [38000, 10500], [38000, 13000], [35000, 13000],
      [35000, 11140], [28000, 11140], [28000, 13000], [0, 13000],
    ]),

    // Doors (note locked STAIR-CORE-B entry door on L3!)
    dxfInsert('A-DOOR', 'DOOR_1200', 4800, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 12500, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 2000, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 7000, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 16400, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 21800, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 17100, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 23000, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1200', 31000, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 35900, 10500, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 27000, 13000, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 29900, 11140, 0),
    dxfInsert('A-DOOR', 'DOOR_1000', 33500, 11140, 0),
    dxfInsert('A-DOOR', 'DOOR_STAIR_B_LOCKED_800', 36500, 13000, 0),

    // Windows
    dxfInsert('A-GLAZ', 'WIN_2400', 3750, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 10750, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 29000, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 35000, 0, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 6500, 22000, 0),
    dxfInsert('A-GLAZ', 'WIN_2400', 30600, 22000, 0),

    // 3 Aligned Stair Cores
    dxfClosedPoly('A-STAIR', [[500, 13600], [3500, 13600], [3500, 18400], [500, 18400]]),
    dxfText('A-STAIR', 2000, 16000, 'STAIR-CORE-W HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),
    dxfClosedPoly('A-STAIR', [[14600, 13600], [17900, 13600], [17900, 17400], [14600, 17400]]),
    dxfText('A-STAIR', 16250, 15200, 'STAIR-CORE-A HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),
    dxfClosedPoly('A-STAIR', [[35400, 13400], [37600, 13400], [37600, 16200], [35400, 16200]]),
    dxfText('A-STAIR', 36500, 14800, 'STAIR-CORE-B HEADROOM=2.25 HANDRAIL=0.95 RISER=170 TREAD=275 WIDTH=1.35', 180),

    // Labels
    dxfText('A-TEXT', 3750, 5200, 'CUTTING-HALL-3', 380),
    dxfText('A-TEXT', 10750, 5200, 'PATTERN-CAD', 360),
    dxfText('A-TEXT', 2000, 17000, 'STAIR-CORE-W', 260),
    dxfText('A-TEXT', 9000, 17500, 'ক্যান্টিন', 380),
    dxfText('A-TEXT', 16250, 15800, 'STAIR-CORE-A', 300),
    dxfText('A-TEXT', 22200, 15500, 'LIFT-LOBBY-3', 320),
    dxfText('A-TEXT', 17000, 5200, 'QA-LAB-3', 360),
    dxfText('A-TEXT', 23000, 5200, 'SAMPLE-ROOM', 360),
    dxfText('A-TEXT', 29000, 5200, 'FINISHING-L3', 360),
    dxfText('A-TEXT', 35000, 5200, 'PACKING-L3', 360),
    dxfText('A-TEXT', 27000, 15200, 'ARCHIVE-3', 260),
    dxfText('A-TEXT', 30000, 16600, 'CBN-EXEC-1', 300),
    dxfText('A-TEXT', 33500, 16600, 'CBN-EXEC-2', 280),
    dxfText('A-TEXT', 36500, 17200, 'STAIR-CORE-B', 260),
    dxfText('A-TEXT', 18000, 11750, 'L3-SPINE', 360),

    // Stale dimension override across 640mm pinch corridor
    dxfDimension('A-DIM', 33500, 10500, 33500, 11140, 640, '1.15m'),
  ];

  return buildDxf(4, entities);
}

export interface SampleBuildingMeta {
  id: 'gazipur-3story' | 'gazipur-complex' | 'mirpur-rmg' | 'dhanmondi-res';
  name: string;
  subtitle: string;
  occupancyClass: 'industrial_rmg' | 'residential';
  storyHeightM: number;
  siteContext: SiteContext;
  summary: string;
  floors: {
    floorIndex: number;
    floorLabel: string;
    floorName: string;
    fileName: string;
    dxfContent: string;
  }[];
}

export const SAMPLE_BUILDINGS: SampleBuildingMeta[] = [
  {
    id: 'gazipur-3story',
    name: 'Gazipur 3-Story RMG Building (GF + L2 + L3)',
    subtitle: '38.0 m × 22.0 m × 9.6 m (3 Floors · 45 Zones) · Millimeters ($INSUNITS=4)',
    occupancyClass: 'industrial_rmg',
    storyHeightM: 3.2,
    siteContext: {
      plotAreaSqM: 1480,
      abuttingRoadWidthM: 12.2,
      frontSetbackM: 3.0,
      rearSetbackM: 2.5,
      sideSetbackM: 1.5,
      sprinklered: false,
      zoneLabel: 'Gazipur Industrial Zone (RMG)',
    },
    summary:
      'Full 3-story factory complex with aligned dual stair shafts, locked ground-floor stair discharge, locked L3 stair vestibule door, corridor pinch points on L2 & L3, and Bangla labels (চিকিৎসা কক্ষ, ক্যান্টিন).',
    floors: [
      {
        floorIndex: 0,
        floorLabel: 'GF',
        floorName: 'Ground Floor (0.0 m)',
        fileName: 'gazipur_gf_ground.dxf',
        dxfContent: generateGazipurGroundDxf(),
      },
      {
        floorIndex: 1,
        floorLabel: 'L2',
        floorName: 'Level 2 — Production (+3.2 m)',
        fileName: 'gazipur_l2_production.dxf',
        dxfContent: generateGazipurLevel2UpperDxf(),
      },
      {
        floorIndex: 2,
        floorLabel: 'L3',
        floorName: 'Level 3 — Cutting & Canteen (+6.4 m)',
        fileName: 'gazipur_l3_cutting.dxf',
        dxfContent: generateGazipurLevel3Dxf(),
      },
    ],
  },
  ...SAMPLE_PLANS.map((s) => {
    const defaultSite: SiteContext =
      s.id === 'gazipur-complex'
        ? {
            plotAreaSqM: 1480,
            abuttingRoadWidthM: 12.2,
            frontSetbackM: 3.0,
            rearSetbackM: 2.5,
            sideSetbackM: 1.5,
            sprinklered: false,
            zoneLabel: 'Gazipur Industrial Zone (RMG)',
          }
        : s.id === 'mirpur-rmg'
          ? {
              plotAreaSqM: 740,
              abuttingRoadWidthM: 9.2,
              frontSetbackM: 2.0,
              rearSetbackM: 2.0,
              sideSetbackM: 1.5,
              sprinklered: false,
              zoneLabel: 'Mirpur Mixed Industrial Zone',
            }
          : {
              plotAreaSqM: 490,
              abuttingRoadWidthM: 7.5,
              frontSetbackM: 1.8,
              rearSetbackM: 1.8,
              sideSetbackM: 1.25,
              sprinklered: false,
              zoneLabel: 'Dhanmondi Residential Zone (R2)',
            };
    return {
      id: s.id,
      name: s.name,
      subtitle: s.subtitle,
      occupancyClass: s.occupancyClass,
      storyHeightM: 3.2,
      siteContext: defaultSite,
      summary: s.summary,
      floors: [
        {
          floorIndex: 0,
          floorLabel: 'GF',
          floorName: 'Single Floor Plan',
          fileName: s.fileName,
          dxfContent: s.dxfContent,
        },
      ],
    };
  }),
];
