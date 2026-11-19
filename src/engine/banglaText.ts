import type { RoomTaxonomy } from '../types/plan';

/**
 * Bangla text in DXF drawings.
 *
 * AutoCAD writes non-ASCII characters in TEXT/MTEXT as \U+XXXX escapes when the file is saved in
 * an older or ANSI code page. We decode those, strip MTEXT formatting codes, and match room labels
 * against a Bangla room dictionary.
 *
 * Not handled: legacy Bijoy / SutonnyMJ text (ASCII bytes drawn with a Bangla font). Add a
 * converter only after a real submitted DXF shows that encoding.
 */

/** Decodes AutoCAD \U+XXXX escapes (4 or 5 hex digits) into Unicode characters. */
export function decodeDxfUnicode(raw: string): string {
  return raw.replace(/\\U\+([0-9A-Fa-f]{4,5})/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

/** Removes MTEXT formatting codes and keeps the visible text. */
export function cleanDxfText(raw: string): string {
  let s = decodeDxfUnicode(raw);
  s = s
    .replace(/\\\\/g, '\u0000BS\u0000') // literal backslash
    .replace(/\\\{/g, '\u0000LB\u0000')
    .replace(/\\\}/g, '\u0000RB\u0000')
    .replace(/\\[Pp]/g, ' ') // paragraph break
    .replace(/\\~/g, ' ') // non-breaking space
    .replace(/\\S([^;]*);/g, (_, f: string) => f.replace(/[#^]/g, '/')) // stacked fraction
    .replace(/\\[ACcFfHhQqTtWw][^;\\]*;/g, '') // codes with an argument
    .replace(/\\p[^;\\]*;/g, '') // paragraph properties
    .replace(/\\[LlOoKkNX]/g, '') // toggles without an argument
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%%/g, '%')
    .replace(/\u0000BS\u0000/g, '\\')
    .replace(/\u0000LB\u0000/g, '{')
    .replace(/\u0000RB\u0000/g, '}');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Bangla words for room types, as they might be typed on a Bangladeshi drawing.
 * Machine-drafted list; extend it from real drawings.
 */
export const BANGLA_ROOM_WORDS: Record<RoomTaxonomy, string[]> = {
  stair: ['সিঁড়ি', 'সিড়ি', 'সোপান', 'সিঁড়িঘর'],
  exit: ['বহির্গমন', 'জরুরি বহির্গমন', 'জরুরি নির্গমন', 'বাহির', 'নির্গমন'],
  corridor: ['করিডোর', 'বারান্দা', 'প্যাসেজ', 'চলাচলের পথ', 'হলওয়ে'],
  lobby: ['লবি', 'লিফট', 'লিফট লবি', 'অভ্যর্থনা', 'রিসেপশন', 'প্রবেশ', 'ফয়ার'],
  bedroom: ['শয়নকক্ষ', 'শয়ন কক্ষ', 'শয়ন', 'শোবার ঘর', 'শোবার', 'বেডরুম', 'বেড রুম', 'মাস্টার বেড', 'গেস্ট রুম', 'অতিথি কক্ষ'],
  habitable: ['বসার ঘর', 'ড্রয়িং', 'ড্রইং', 'ডাইনিং', 'খাবার ঘর', 'রান্নাঘর', 'রান্না ঘর', 'রান্না', 'কিচেন', 'লিভিং', 'ফ্যামিলি', 'পারিবারিক', 'পড়ার ঘর', 'স্টাডি'],
  utility: ['টয়লেট', 'শৌচাগার', 'বাথরুম', 'বাথ', 'স্নানাগার', 'গোসলখানা', 'ওয়াশরুম', 'স্টোর', 'গুদাম', 'ভাণ্ডার', 'সার্ভিস', 'বৈদ্যুতিক', 'জেনারেটর', 'পাম্প', 'লন্ড্রি'],
  cabin: ['কেবিন', 'অফিস', 'দপ্তর', 'ম্যানেজার', 'চেম্বার'],
  workfloor: ['ক্যান্টিন', 'কারখানা', 'গার্মেন্ট', 'সেলাই', 'উৎপাদন', 'কাটিং', 'প্যাকিং', 'ফিনিশিং', 'কাজের ফ্লোর'],
};

// NFC turns precomposed য় / ড় / ঢ় into base + nukta, so both sides compare the same way.
const norm = (s: string) => s.normalize('NFC').toLowerCase();

const DICT: { word: string; taxonomy: RoomTaxonomy }[] = Object.entries(BANGLA_ROOM_WORDS).flatMap(
  ([taxonomy, words]) => words.map((w) => ({ word: norm(w), taxonomy: taxonomy as RoomTaxonomy }))
);

export function hasBangla(s: string): boolean {
  return /[ঀ-৿]/.test(s);
}

/** Longest Bangla dictionary word found in the label, or null. */
export function matchBanglaRoom(label: string): { taxonomy: RoomTaxonomy; word: string } | null {
  if (!hasBangla(label)) return null;
  const s = norm(label);
  let best: { taxonomy: RoomTaxonomy; word: string } | null = null;
  for (const d of DICT) {
    if (s.includes(d.word) && (!best || d.word.length > best.word.length)) best = d;
  }
  return best;
}

/**
 * Bangla question words mapped to the English terms the reference notes use.
 * Shared by the server and the offline question box. No /g flag: RegExp.test with /g is stateful.
 */
export const BANGLA_QUERY_SYNONYMS: [RegExp, string][] = [
  [/দরজা|ফটক/, 'door exit'],
  [/তালা|তালাবদ্ধ|বন্ধ/, 'locked obstructed'],
  [/সিঁড়ি|সিড়ি|সোপান/, 'stair staircase'],
  [/দূরত্ব|হাঁটার/, 'travel distance'],
  [/করিডোর|বারান্দা|চলাচলের পথ/, 'corridor passage width'],
  [/জানালা|আলো|বাতাস/, 'window daylight ventilation'],
  [/শয়ন|শোবার|বেডরুম/, 'bedroom sleeping habitable'],
  [/স্প্রিংকলার/, 'sprinkler'],
  [/উচ্চতা|বহুতল|লিফট/, 'high rise height'],
  [/সেটব্যাক|ছাড়/, 'setback'],
  [/এফএআর|ফার|রাস্তা/, 'far road width'],
  [/এমজিসি|জমি|আচ্ছাদন/, 'mgc ground coverage'],
  [/রাজউক|অনুমোদন|বিধিমালা/, 'rajuk imarat bidhimala'],
  [/রাইজার|ট্রেড|ধাপ/, 'riser tread'],
  [/হাতল|রেলিং/, 'handrail'],
  [/কেবিন/, 'cabin'],
  [/প্রস্থ|চওড়া/, 'width'],
  [/বহির্গমন|বের হওয়ার/, 'exit escape'],
  [/মাপ|ডাইমেনশন/, 'dimension'],
  [/ধারণক্ষমতা|লোক|মানুষ/, 'occupant load capacity'],
];

/** Adds English search terms for any Bangla words in the question. */
export function expandBanglaQuery(question: string): string {
  const q = question.normalize('NFC');
  let out = question;
  for (const [rx, add] of BANGLA_QUERY_SYNONYMS) {
    if (rx.test(q) || rx.test(question)) out += ` ${add}`;
  }
  return out;
}

/** Score a reference note's Bangla keywords and title against a Bangla question. */
export function banglaNoteScore(
  question: string,
  note: { keywordsBn: string[]; titleBn: string; textBn: string }
): number {
  if (!hasBangla(question)) return 0;
  const q = norm(question);
  let s = 0;
  for (const k of note.keywordsBn) {
    const kn = norm(k);
    if (q.includes(kn)) s += 2 + Math.min(3, kn.length / 4);
  }
  const title = norm(note.titleBn);
  const words = q.split(/[\s?।,!]+/).filter((w) => w.length >= 3 && hasBangla(w));
  for (const w of words) if (title.includes(w)) s += 1.5;
  return s;
}
