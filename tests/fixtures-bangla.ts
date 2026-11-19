/** Minimal DXF: two 4 x 4 m rooms, TEXT/MTEXT labels given by the caller. Metres. */
export function twoRoomDxf(labelA: string, labelB: string, mtextB = false): string {
  const L = (x1: number, y1: number, x2: number, y2: number) =>
    ['0', 'LINE', '8', 'A-WALL', '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2)];
  const T = (x: number, y: number, s: string) => ['0', 'TEXT', '8', 'A-TEXT', '10', String(x), '20', String(y), '40', '0.3', '1', s];
  const M = (x: number, y: number, s: string) => ['0', 'MTEXT', '8', 'A-TEXT', '10', String(x), '20', String(y), '40', '0.3', '1', s];
  const ents = [
    // outer walls, with a 1.0 m gap in the bottom wall of room A (exit) at x 1..2
    ...L(0, 0, 1, 0), ...L(2, 0, 8, 0), ...L(8, 0, 8, 4), ...L(8, 4, 0, 4), ...L(0, 4, 0, 0),
    // partition at x=4 with a 0.9 m door gap at y 1.5..2.4
    ...L(4, 0, 4, 1.5), ...L(4, 2.4, 4, 4),
    ...T(1.5, 2, labelA),
    ...(mtextB ? M(5.5, 2, labelB) : T(5.5, 2, labelB)),
  ];
  return [
    '0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...ents, '0', 'ENDSEC', '0', 'EOF', '',
  ].join('\n');
}
