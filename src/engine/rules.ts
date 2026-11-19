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
  /** Bangla name (machine draft, needs native review). Same limit as the English name. */
  nameBn?: string;
  citation: string;
  basis: RuleBasis;
  note: string;
}

export const BNBC_P3_SOURCE_URL =
  'https://law.resource.org/pub/bd/bnbc.2012/gov.bd.bnbc.2012.03.01.pdf';

const P4_NOTE =
  'Advisory screening threshold. Confirm the governing BNBC Part 4, Ch. 3 (Means of Escape) clause against the gazette text.';
const IMARAT_NOTE =
  'Simplified screening schedule. Confirm FAR, ground coverage and setbacks against the Dhaka Imarat Nirman Bidhimala 2008 tables for the actual plot size and use.';

export const RULES: Record<string, RuleDef> = {
  'bnbc_1.13.8.2_travel_distance': {
    name: 'Cabin Farther Than 16 m From an Exit',
    nameBn: 'কেবিন থেকে বহির্গমন ১৬ মিটারের বেশি দূরে',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.8.2',
    basis: 'verified',
    note: 'Sec 1.13.8.2: the means of exit shall in no case be further than 16 m from any cabin.',
  },
  screen_travel_distance: {
    name: 'Long Travel Distance to Exit',
    nameBn: 'বহির্গমন পর্যন্ত হাঁটার দূরত্ব বেশি',
    citation: 'Screening threshold (BNBC Part 4, Ch. 3 travel-distance table not verified)',
    basis: 'screening',
    note: 'The 16 m cabin limit of BNBC 2012 Part 3 Sec 1.13.8.2 is used as a conservative reference for other rooms (22.5 m when sprinklers are declared). Occupancy-specific limits must be confirmed by the reviewer.',
  },
  egress_no_route: {
    name: 'No Walking Route to Any Open Exit',
    nameBn: 'কোনো খোলা বহির্গমনে হেঁটে যাওয়ার পথ নেই',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape), general requirement',
    basis: 'screening',
    note: 'Geometric finding: the path search found no route from this room to an unlocked exit. Clause number not individually verified.',
  },
  'bnbc_1.13.8.2_passage_width': {
    name: 'Passage Clear Width Below 0.75 m',
    nameBn: 'চলাচলের পথের খোলা প্রস্থ ০.৭৫ মিটারের কম',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.8.2',
    basis: 'verified',
    note: 'Sec 1.13.8.2 requires clear passages at least 0.75 m wide between cabins. Applied here as the minimum for any escape passage.',
  },
  'bnbc_1.13.5_stair_headroom': {
    name: 'Staircase Clear Headroom Below 2.15 m',
    nameBn: 'সিঁড়িতে মাথার উপরের ফাঁকা উচ্চতা ২.১৫ মিটারের কম',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.5.4',
    basis: 'verified',
    note: 'Minimum clear headroom between flights is 2.15 m (2.03 m is allowed for not more than three flights).',
  },
  'bnbc_1.13.5_stair_handrail': {
    name: 'Staircase Handrail Height Below 0.90 m',
    nameBn: 'সিঁড়ির হাতলের উচ্চতা ০.৯০ মিটারের কম',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.5.6',
    basis: 'verified',
    note: 'Handrail height is at least 0.9 m measured from the stair nosing.',
  },
  'bnbc_1.13.5_stair_proportion': {
    name: 'Stair Riser/Tread Proportion Out of Range',
    nameBn: 'সিঁড়ির রাইজার/ট্রেডের অনুপাত সীমার বাইরে',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.5.2',
    basis: 'verified',
    note: 'The sum of two risers and one tread shall be between 610 mm and 648 mm.',
  },
  'bnbc_3.12_habitable_area': {
    name: 'Sleeping Room Below 9.5 m²',
    nameBn: 'শয়নকক্ষ ৯.৫ বর্গমিটারের কম',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.2.2',
    basis: 'verified',
    note: 'Sleeping room size shall not be less than 9.5 m² of net floor area with a minimum width of 2.9 m.',
  },
  bnbc_bedroom_width: {
    name: 'Sleeping Room Narrower Than 2.9 m',
    nameBn: 'শয়নকক্ষ ২.৯ মিটারের চেয়ে সরু',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.2.2',
    basis: 'verified',
    note: 'Sleeping room size shall not be less than 9.5 m² of net floor area with a minimum width of 2.9 m.',
  },
  'bnbc_3.16_daylight_ventilation': {
    name: 'No Window Found on a Habitable Room',
    nameBn: 'বাসযোগ্য কক্ষে কোনো জানালা পাওয়া যায়নি',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.17.6 / Table 3.1.12',
    basis: 'verified',
    note: 'Habitable rooms need openings totalling 15% of net floor area. The geometry parser checks whether any window touches the room, so this is raised as a warning for reviewer verification.',
  },
  'bnbc_4.4.1_highrise': {
    name: 'High-Rise Building (Above 20 m)',
    nameBn: 'বহুতল ভবন (২০ মিটারের বেশি)',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.2 (definition of high-rise)',
    basis: 'verified',
    note: 'A building more than 20 m above the adjacent road level is a high-rise, which brings in the additional fire provisions of Part 4. Height here is floors × declared storey height.',
  },
  bnbc_p4_exit_unobstructed: {
    name: 'Locked or Obstructed Exit Door',
    nameBn: 'তালাবদ্ধ বা অবরুদ্ধ বহির্গমন দরজা',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape), general requirement',
    basis: 'screening',
    note: 'The drawing marks this exit as locked or blocked. Clause number not individually verified.',
  },
  bnbc_p4_exit_door_width: {
    name: 'Exit Door Narrower Than 0.90 m',
    nameBn: 'বহির্গমন দরজা ০.৯০ মিটারের চেয়ে সরু',
    citation: 'Screening threshold 0.90 m (BNBC Part 4, Ch. 3 not verified)',
    basis: 'screening',
    note: P4_NOTE,
  },
  bnbc_p4_dual_exit_count: {
    name: 'Fewer Than Two Independent Exits',
    nameBn: 'দুইটির কম স্বতন্ত্র বহির্গমন',
    citation: 'Screening threshold: 2 exits (BNBC Part 4, Ch. 3 not verified)',
    basis: 'screening',
    note: P4_NOTE,
  },
  bnbc_p4_stair_continuity: {
    name: 'Stair Does Not Continue to Ground Floor',
    nameBn: 'সিঁড়ি নিচতলা পর্যন্ত নামেনি',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape), general requirement',
    basis: 'screening',
    note: 'Geometric finding: no stair on the floor below lines up with this stair. Clause number not individually verified.',
  },
  bnbc_p4_stair_discharge: {
    name: 'Stair Has No Open Route to the Street',
    nameBn: 'সিঁড়ি থেকে রাস্তায় যাওয়ার খোলা পথ নেই',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape), general requirement',
    basis: 'screening',
    note: 'Geometric finding: from the foot of this stair no unlocked ground-floor exit can be reached. Clause number not individually verified.',
  },
  'bnbc_4.3.9_exit_capacity': {
    name: 'Ground Exit Width Low for Occupant Load',
    nameBn: 'ব্যবহারকারীর সংখ্যার তুলনায় নিচতলার বহির্গমন সরু',
    citation: 'Screening estimate (occupant-load and exit-capacity factors not verified)',
    basis: 'screening',
    note: 'Uses assumed factors: 2.8 m²/person workfloor, 9.3 office, 18.6 residential, 5 mm of door width per person. ' + P4_NOTE,
  },
  'bnbc_4.3.9_stair_capacity': {
    name: 'Stair Width Low for Upper-Floor Load',
    nameBn: 'ওপরের তলার মানুষের তুলনায় সিঁড়ি সরু',
    citation: 'Screening estimate (occupant-load and stair-capacity factors not verified)',
    basis: 'screening',
    note: 'Uses an assumed 7.5 mm of stair width per person. ' + P4_NOTE,
  },
  imarat_rule16_mgc: {
    name: 'Ground Coverage Above Screening Limit',
    nameBn: 'ভূমি-আচ্ছাদন স্ক্রিনিং সীমার বেশি',
    citation: 'Dhaka Imarat Nirman Bidhimala 2008 (ground coverage), simplified',
    basis: 'screening',
    note: IMARAT_NOTE,
  },
  imarat_rule16_far: {
    name: 'FAR Above Screening Limit',
    nameBn: 'এফএআর স্ক্রিনিং সীমার বেশি',
    citation: 'Dhaka Imarat Nirman Bidhimala 2008 (FAR), simplified',
    basis: 'screening',
    note: IMARAT_NOTE,
  },
  imarat_rule17_setback: {
    name: 'Setback Below Screening Minimum',
    nameBn: 'সেটব্যাক স্ক্রিনিং ন্যূনতমের কম',
    citation: 'Dhaka Imarat Nirman Bidhimala 2008 (setbacks), simplified',
    basis: 'screening',
    note: IMARAT_NOTE,
  },
  cad_dimension_override_mismatch: {
    name: 'Dimension Text Does Not Match the Geometry',
    nameBn: 'মাপের লেখা আঁকা জ্যামিতির সঙ্গে মেলে না',
    citation: 'Drawing consistency check (DIMENSION text vs. measured endpoints)',
    basis: 'drawing',
    note: 'Not a code clause. The typed dimension differs from the distance between the dimension points.',
  },
  input_exits_unidentified: {
    name: 'No Exit Could Be Identified on This Floor',
    nameBn: 'এই তলায় কোনো বহির্গমন শনাক্ত করা যায়নি',
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

/** Rule name in the interface language; falls back to the English name. */
export function ruleName(ruleId: string, englishName: string, uiLang: 'en' | 'bn'): string {
  if (uiLang !== 'bn') return englishName;
  return RULES[ruleId]?.nameBn || englishName;
}
