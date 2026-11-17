/**
 * Rule registry: one entry per check the engine can raise.
 *
 * `basis` tells the reader how far to trust the threshold:
 *  - 'verified'  : the number was read in the BNBC 2012 source text (law.resource.org copy of Part 3, Ch. 1).
 *  - 'screening' : a prototype threshold. The governing clause (mostly BNBC Part 4, Ch. 3 or the Dhaka
 *                  Imarat Nirman Bidhimala 2008 schedules) has NOT been checked against the gazette text.
 *  - 'drawing'   : not a code rule; an internal consistency check on the drawing itself.
 */
export type RuleBasis = 'verified' | 'screening' | 'drawing';

export interface RuleDef {
  name: string;
  citation: string;
  basis: RuleBasis;
  note: string;
}

export const BNBC_P3_SOURCE_URL =
  'https://law.resource.org/pub/bd/bnbc.2012/gov.bd.bnbc.2012.03.01.pdf';

const P4_NOTE =
  'Prototype screening threshold. The governing BNBC Part 4, Ch. 3 (Means of Escape) clause has not been verified against the gazette text.';
const IMARAT_NOTE =
  'Simplified screening schedule. Confirm FAR, ground coverage and setbacks against the Dhaka Imarat Nirman Bidhimala 2008 tables for the actual plot size and use.';

export const RULES: Record<string, RuleDef> = {
  'bnbc_1.13.8.2_travel_distance': {
    name: 'Cabin Farther Than 16 m From an Exit',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.8.2',
    basis: 'verified',
    note: 'Sec 1.13.8.2: the means of exit shall in no case be further than 16 m from any cabin.',
  },
  screen_travel_distance: {
    name: 'Long Travel Distance to Exit',
    citation: 'Screening threshold (BNBC Part 4, Ch. 3 travel-distance table not verified)',
    basis: 'screening',
    note: 'The 16 m cabin limit of BNBC 2012 Part 3 Sec 1.13.8.2 is used as a conservative reference for other rooms (22.5 m when sprinklers are declared). Occupancy-specific limits must be confirmed by the reviewer.',
  },
  egress_no_route: {
    name: 'No Walking Route to Any Open Exit',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape), general requirement',
    basis: 'screening',
    note: 'Geometric finding: the path search found no route from this room to an unlocked exit. Clause number not individually verified.',
  },
  'bnbc_1.13.8.2_passage_width': {
    name: 'Passage Clear Width Below 0.75 m',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.8.2',
    basis: 'verified',
    note: 'Sec 1.13.8.2 requires clear passages at least 0.75 m wide between cabins. Applied here as the minimum for any escape passage.',
  },
  'bnbc_1.13.5_stair_headroom': {
    name: 'Staircase Clear Headroom Below 2.15 m',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.5.4',
    basis: 'verified',
    note: 'Minimum clear headroom between flights is 2.15 m (2.03 m is allowed for not more than three flights).',
  },
  'bnbc_1.13.5_stair_handrail': {
    name: 'Staircase Handrail Height Below 0.90 m',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.5.6',
    basis: 'verified',
    note: 'Handrail height is at least 0.9 m measured from the stair nosing.',
  },
  'bnbc_1.13.5_stair_proportion': {
    name: 'Stair Riser/Tread Proportion Out of Range',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.5.2',
    basis: 'verified',
    note: 'The sum of two risers and one tread shall be between 610 mm and 648 mm.',
  },
  'bnbc_3.12_habitable_area': {
    name: 'Sleeping Room Below 9.5 m²',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.2.2',
    basis: 'verified',
    note: 'Sleeping room size shall not be less than 9.5 m² of net floor area with a minimum width of 2.9 m.',
  },
  bnbc_bedroom_width: {
    name: 'Sleeping Room Narrower Than 2.9 m',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.2.2',
    basis: 'verified',
    note: 'Sleeping room size shall not be less than 9.5 m² of net floor area with a minimum width of 2.9 m.',
  },
  'bnbc_3.16_daylight_ventilation': {
    name: 'No Window Found on a Habitable Room',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.17.6 / Table 3.1.12',
    basis: 'verified',
    note: 'Habitable rooms need openings totalling 15% of net floor area. The prototype only detects whether any window touches the room, so this is raised as a warning for the reviewer.',
  },
  'bnbc_4.4.1_highrise': {
    name: 'High-Rise Building (Above 20 m)',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.2 (definition of high-rise)',
    basis: 'verified',
    note: 'A building more than 20 m above the adjacent road level is a high-rise, which brings in the additional fire provisions of Part 4. Height here is floors × declared storey height.',
  },
  bnbc_p4_exit_unobstructed: {
    name: 'Locked or Obstructed Exit Door',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape), general requirement',
    basis: 'screening',
    note: 'The drawing marks this exit as locked or blocked. Clause number not individually verified.',
  },
  bnbc_p4_exit_door_width: {
    name: 'Exit Door Narrower Than 0.90 m',
    citation: 'Screening threshold 0.90 m (BNBC Part 4, Ch. 3 not verified)',
    basis: 'screening',
    note: P4_NOTE,
  },
  bnbc_p4_dual_exit_count: {
    name: 'Fewer Than Two Independent Exits',
    citation: 'Screening threshold: 2 exits (BNBC Part 4, Ch. 3 not verified)',
    basis: 'screening',
    note: P4_NOTE,
  },
  bnbc_p4_stair_continuity: {
    name: 'Stair Does Not Continue to Ground Floor',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape), general requirement',
    basis: 'screening',
    note: 'Geometric finding: no stair on the floor below lines up with this stair. Clause number not individually verified.',
  },
  bnbc_p4_stair_discharge: {
    name: 'Stair Has No Open Route to the Street',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape), general requirement',
    basis: 'screening',
    note: 'Geometric finding: from the foot of this stair no unlocked ground-floor exit can be reached. Clause number not individually verified.',
  },
  'bnbc_4.3.9_exit_capacity': {
    name: 'Ground Exit Width Low for Occupant Load',
    citation: 'Screening estimate (occupant-load and exit-capacity factors not verified)',
    basis: 'screening',
    note: 'Uses assumed factors: 2.8 m²/person workfloor, 9.3 office, 18.6 residential, 5 mm of door width per person. ' + P4_NOTE,
  },
  'bnbc_4.3.9_stair_capacity': {
    name: 'Stair Width Low for Upper-Floor Load',
    citation: 'Screening estimate (occupant-load and stair-capacity factors not verified)',
    basis: 'screening',
    note: 'Uses an assumed 7.5 mm of stair width per person. ' + P4_NOTE,
  },
  imarat_rule16_mgc: {
    name: 'Ground Coverage Above Screening Limit',
    citation: 'Dhaka Imarat Nirman Bidhimala 2008 (ground coverage), simplified',
    basis: 'screening',
    note: IMARAT_NOTE,
  },
  imarat_rule16_far: {
    name: 'FAR Above Screening Limit',
    citation: 'Dhaka Imarat Nirman Bidhimala 2008 (FAR), simplified',
    basis: 'screening',
    note: IMARAT_NOTE,
  },
  imarat_rule17_setback: {
    name: 'Setback Below Screening Minimum',
    citation: 'Dhaka Imarat Nirman Bidhimala 2008 (setbacks), simplified',
    basis: 'screening',
    note: IMARAT_NOTE,
  },
  cad_dimension_override_mismatch: {
    name: 'Dimension Text Does Not Match the Geometry',
    citation: 'Drawing consistency check (DIMENSION text vs. measured endpoints)',
    basis: 'drawing',
    note: 'Not a code clause. The typed dimension differs from the distance between the dimension points.',
  },
  input_exits_unidentified: {
    name: 'No Exit Could Be Identified on This Floor',
    citation: 'Reviewer input needed',
    basis: 'drawing',
    note: 'The parser found no door marked as an exit and none on the outer wall. Mark the exits in Review, then travel distances will be measured.',
  },
};

export function ruleDef(ruleId: string): RuleDef {
  return (
    RULES[ruleId] || {
      name: ruleId,
      citation: 'Unlisted rule',
      basis: 'screening',
      note: 'No registry entry.',
    }
  );
}
