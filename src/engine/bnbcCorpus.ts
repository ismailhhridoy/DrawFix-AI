/**
 * Reference notes used by the code question box and the review note.
 *
 * Every note states its basis. 'verified' notes restate sentences read in the
 * BNBC 2012 text (Part 3, Chapter 1, law.resource.org copy). 'screening' notes
 * describe thresholds this prototype uses that have NOT been checked against
 * the gazette, and say so in their text, so an answer built from them cannot
 * present them as law.
 */
export interface RegulatoryClauseChunk {
  id: string;
  docId: 'BNBC_2012' | 'PROTOTYPE_SCREENING' | 'DRAWING_CHECK';
  basis: 'verified' | 'screening' | 'drawing';
  part: string;
  clause: string;
  title: string;
  occupancyScope: ('industrial_rmg' | 'residential' | 'mixed' | 'all')[];
  topics: string[];
  keywords: string[];
  text: string;
}

export const REGULATORY_CORPUS: RegulatoryClauseChunk[] = [
  {
    id: 'bnbc-2012-1.13.8.2-cabins',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.13.8.2',
    title: 'Cabins: 0.75 m passages and 16 m to an exit',
    occupancyScope: ['all'],
    topics: ['travel_distance', 'passage_width', 'cabin', 'egress'],
    keywords: ['16m', '16', '0.75m', '0.75', 'cabin', 'chamber', 'partition', 'passage', 'travel distance', 'corridor'],
    text: 'Verified in the source text. Where an open floor is divided into cabins or chambers by partitions, clear passages at least 0.75 m wide shall be maintained between the cabins, leading to a means of exit which shall in no case be further than 16 m from any cabin. The clause is written for cabins; this tool applies the 16 m figure to cabins as a rule and to other rooms only as a screening reference.',
  },
  {
    id: 'bnbc-2012-1.13.5-stairs',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.13.5.2, 1.13.5.4, 1.13.5.6',
    title: 'Stairs: riser and tread, headroom, handrail',
    occupancyScope: ['all'],
    topics: ['stair_safety', 'headroom', 'handrail', 'riser', 'tread'],
    keywords: ['2.15m', '2.15', '2.03', 'headroom', '0.9m', '0.90', 'handrail', '610', '648', '2R+T', 'riser', 'tread', 'stair'],
    text: 'Verified in the source text. The sum of two risers and one tread, excluding nosing, shall not be less than 610 mm and not more than 648 mm (Sec 1.13.5.2). Minimum clear headroom between flights is 2.15 m, which may be reduced to 2.03 m for not more than three flights in a staircase (Sec 1.13.5.4). Handrails shall be at least 0.9 m high measured from the nosing (Sec 1.13.5.6). Minimum stair width is not given here; the section refers to Part 4, Table 4.3.6.',
  },
  {
    id: 'bnbc-2012-1.13.2.2-bedroom',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.13.2.2',
    title: 'Sleeping room: 9.5 m² and 2.9 m wide',
    occupancyScope: ['residential', 'mixed'],
    topics: ['habitability', 'room_area', 'bedroom'],
    keywords: ['bedroom', 'sleeping', '9.5', '2.9', 'habitable', 'minimum area', 'room size', 'width'],
    text: 'Verified in the source text. The sleeping room of a dwelling unit shall not be less than 9.5 m² of net floor area, with a minimum width of 2.9 m.',
  },
  {
    id: 'bnbc-2012-1.17.6-light',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.17.6 / Table 3.1.12',
    title: 'Light and ventilation openings: 15% of floor area',
    occupancyScope: ['residential', 'mixed'],
    topics: ['ventilation', 'daylight', 'windows', 'habitability'],
    keywords: ['window', 'daylight', 'ventilation', '15%', '18%', 'opening', 'kitchen', 'natural light'],
    text: 'Verified in the source text. Habitable rooms used for sleeping, living, study or dining need an aggregate opening area of 15% of net floor area; kitchens need 18%. This tool does not know window heights, so it only reports rooms on which no window was found.',
  },
  {
    id: 'bnbc-2012-1.2-highrise',
    docId: 'BNBC_2012',
    basis: 'verified',
    part: 'BNBC 2012, Part 3, Ch. 1',
    clause: 'Sec 1.2 (definitions)',
    title: 'High-rise: more than 20 m above road level',
    occupancyScope: ['all'],
    topics: ['high_rise', 'height'],
    keywords: ['20m', '20', 'high rise', 'highrise', 'height', 'tall', '80m'],
    text: 'Verified in the source text. A high-rise building is one located more than 20 m above the centre of the adjacent road level. Additional fire provisions in Part 4 apply to high-rise buildings and require reviewer verification.',
  },
  {
    id: 'screen-exit-doors',
    docId: 'PROTOTYPE_SCREENING',
    basis: 'screening',
    part: 'Advisory screening',
    clause: 'Exit doors',
    title: 'Exit door width, locked exits and number of exits',
    occupancyScope: ['all'],
    topics: ['door_width', 'exit_door', 'locked_door', 'dual_exits'],
    keywords: ['0.90', '0.9', 'door width', 'locked', 'two exits', 'dual', 'exit count', 'obstructed'],
    text: 'Not verified against the gazette. This tool flags exit doors narrower than 0.90 m, exits drawn as locked, and floors with fewer than two usable exits or stairs. These are screening thresholds; the governing clauses are in BNBC Part 4, Ch. 3 (Means of Escape), which was not available to verify.',
  },
  {
    id: 'screen-travel',
    docId: 'PROTOTYPE_SCREENING',
    basis: 'screening',
    part: 'Advisory screening',
    clause: 'Travel distance for rooms other than cabins',
    title: 'Travel-distance screening reference (16 m, 22.5 m with sprinklers)',
    occupancyScope: ['all'],
    topics: ['travel_distance', 'sprinkler'],
    keywords: ['travel distance', 'sprinkler', 'sprinklered', '22.5', '16', 'workfloor', 'factory'],
    text: 'Not verified against the gazette. For rooms other than cabins this tool warns when the walking route to an exit exceeds 16 m, or 22.5 m if sprinklers are declared. Occupancy-specific travel-distance limits are set in BNBC Part 4, Ch. 3 and must be confirmed by the reviewer.',
  },
  {
    id: 'screen-capacity',
    docId: 'PROTOTYPE_SCREENING',
    basis: 'screening',
    part: 'Advisory screening',
    clause: 'Occupant load and exit capacity',
    title: 'Occupant-load and capacity estimates',
    occupancyScope: ['all'],
    topics: ['occupant_load', 'exit_capacity', 'stair_capacity'],
    keywords: ['occupant load', 'capacity', '5mm', '7.5mm', 'persons', 'exit width', 'stair width'],
    text: 'Not verified against the gazette. Occupant load is estimated from room areas with assumed factors (workfloor 2.8 m² per person, lobby 1.4, office or cabin 9.3, residential 18.6, utility 28). Exit doors are assumed to pass one person per 5 mm of width and stairs one per 7.5 mm.',
  },
  {
    id: 'screen-zoning',
    docId: 'PROTOTYPE_SCREENING',
    basis: 'screening',
    part: 'Advisory screening',
    clause: 'FAR, ground coverage and setbacks',
    title: 'Zoning screening (Dhaka Imarat Nirman Bidhimala 2008, simplified)',
    occupancyScope: ['all'],
    topics: ['far', 'mgc', 'setback', 'zoning'],
    keywords: ['FAR', 'floor area ratio', 'MGC', 'ground coverage', 'setback', 'road width', 'plot', 'imarat', 'bidhimala', 'rajuk'],
    text: 'Not verified against the gazette. When plot data is entered, this tool compares FAR with a simplified ladder by road width (2.5 below 6 m, 3.0 below 9 m, 3.25 below 12 m, 3.5 below 18 m, 4.25 above), ground coverage with 60% (62.5% for plots up to 335 m²), and setbacks with 1.5 m front, 1.5–2.0 m rear and 1.0–1.25 m side. The real schedules depend on plot size and use and must be read from the Dhaka Imarat Nirman Bidhimala 2008.',
  },
  {
    id: 'drawing-dimension-check',
    docId: 'DRAWING_CHECK',
    basis: 'drawing',
    part: 'Drawing consistency',
    clause: 'Dimension text',
    title: 'Typed dimension differs from the measured distance',
    occupancyScope: ['all'],
    topics: ['dimension_integrity', 'cad_override'],
    keywords: ['dimension', 'override', 'stale', 'mismatch', 'cad', 'dxf', 'text'],
    text: 'Not a code clause. A DXF dimension can carry typed text that replaces the measured value. This tool compares the typed text with the distance between the dimension points and reports a mismatch above 5 cm.',
  },
];
