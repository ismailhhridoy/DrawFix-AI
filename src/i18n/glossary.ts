/**
 * Bangla glossary for building-code terms.
 *
 * One place for the Bangla word used for each code concept, shared by the interface strings,
 * the fixed Bangla templates, the reference notes and the Gemini prompt, so the same idea is
 * always called the same thing.
 *
 * STATUS: machine draft. A native Bangla speaker with building-code context (ideally someone
 * who reads RAJUK / FSCD documents) must review every entry before this Bangla is presented as
 * anything more than a prototype translation. `avoid` lists spellings or synonyms that the
 * tests reject in our own Bangla text, to keep wording consistent.
 */
export interface GlossaryEntry {
  id: string;
  en: string;
  bn: string;
  /** Other words with the same meaning that our text should not use. */
  avoid?: string[];
  note?: string;
}

export const GLOSSARY_STATUS = 'machine-draft' as const;

export const GLOSSARY: GlossaryEntry[] = [
  { id: 'exit', en: 'exit', bn: 'বহির্গমন', avoid: ['নির্গমন পথ', 'এক্সিট'], note: 'Means of escape to outside or to a protected stair.' },
  { id: 'exit_door', en: 'exit door', bn: 'বহির্গমন দরজা' },
  { id: 'travel_distance', en: 'travel distance', bn: 'হাঁটার দূরত্ব', avoid: ['ভ্রমণ দূরত্ব'], note: 'Walking distance along the route, not straight-line.' },
  { id: 'escape_route', en: 'escape route', bn: 'বহির্গমন পথ', avoid: ['পালানোর পথ'] },
  { id: 'stair', en: 'stair / staircase', bn: 'সিঁড়ি', avoid: ['সিড়ি'] },
  { id: 'headroom', en: 'headroom', bn: 'মাথার উপরের ফাঁকা উচ্চতা' },
  { id: 'handrail', en: 'handrail', bn: 'হাতল' },
  { id: 'riser', en: 'riser', bn: 'রাইজার', note: 'Kept as a loanword; Bangla drawings commonly use it.' },
  { id: 'tread', en: 'tread', bn: 'ট্রেড', note: 'Kept as a loanword.' },
  { id: 'corridor', en: 'corridor / passage', bn: 'চলাচলের পথ', note: 'করিডোর is also understood; used in room-type labels.' },
  { id: 'clear_width', en: 'clear width', bn: 'খোলা প্রস্থ' },
  { id: 'locked', en: 'locked', bn: 'তালাবদ্ধ' },
  { id: 'obstructed', en: 'obstructed', bn: 'অবরুদ্ধ' },
  { id: 'bedroom', en: 'sleeping room / bedroom', bn: 'শয়নকক্ষ' },
  { id: 'habitable', en: 'habitable room', bn: 'বাসযোগ্য কক্ষ' },
  { id: 'cabin', en: 'cabin', bn: 'কেবিন' },
  { id: 'ventilation', en: 'light and ventilation opening', bn: 'আলো ও বাতাস চলাচলের খোলা অংশ' },
  { id: 'high_rise', en: 'high-rise building', bn: 'বহুতল ভবন' },
  { id: 'sprinkler', en: 'sprinkler', bn: 'স্প্রিংকলার' },
  { id: 'occupant_load', en: 'occupant load', bn: 'ব্যবহারকারীর সংখ্যা' },
  { id: 'setback', en: 'setback', bn: 'সেটব্যাক', note: 'Loanword used in RAJUK practice.' },
  { id: 'far', en: 'FAR (floor area ratio)', bn: 'এফএআর', avoid: ['ফার '] },
  { id: 'mgc', en: 'MGC (ground coverage)', bn: 'ভূমি-আচ্ছাদন' },
  { id: 'plot', en: 'plot', bn: 'প্লট' },
  { id: 'road_width', en: 'road width', bn: 'রাস্তার প্রস্থ' },
  { id: 'finding', en: 'finding', bn: 'পর্যবেক্ষণ' },
  { id: 'fail', en: 'fail', bn: 'ত্রুটি' },
  { id: 'warn', en: 'warning', bn: 'সতর্কতা' },
  { id: 'verified', en: 'verified (limit read in BNBC 2012 text)', bn: 'যাচাই করা' },
  { id: 'screening', en: 'screening (not checked against the gazette)', bn: 'স্ক্রিনিং', note: 'Kept as a loanword so it is not mistaken for a legal limit.' },
  { id: 'not_checked', en: 'not checked', bn: 'যাচাই করা হয়নি' },
  { id: 'reviewer', en: 'reviewer', bn: 'পর্যালোচক' },
  { id: 'drawing', en: 'drawing / plan', bn: 'নকশা' },
  { id: 'ground_floor', en: 'ground floor', bn: 'নিচতলা' },
  { id: 'bnbc', en: 'BNBC', bn: 'বিএনবিসি', note: 'Clause numbers stay in Latin form, e.g. Sec 1.13.8.2.' },
  { id: 'rajuk', en: 'RAJUK', bn: 'রাজউক' },
  { id: 'fire_service', en: 'Fire Service (FSCD)', bn: 'ফায়ার সার্ভিস' },
];

/** Glossary as prompt lines for Gemini: "English = Bangla". */
export function glossaryPromptLines(): string {
  return GLOSSARY.map((g) => `${g.en} = ${g.bn}`).join('; ');
}

export function term(id: string): string {
  const g = GLOSSARY.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown glossary term: ${id}`);
  return g.bn;
}
