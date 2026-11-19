import type {
  BuildingProject,
  ComplianceAudit,
  DeficiencyMemo,
  FixNarration,
  LayerConventions,
  ParsedFloorPlan,
  RagClauseCitation,
  RagQueryResponse,
  RemediationDelta,
  RoomEntity,
  RoomTaxonomy,
  Violation,
  ViolationExplanation,
} from '../types/plan';
import { REGULATORY_CORPUS } from './bnbcCorpus';
import { toBnDigits } from '../i18n/digits';
import { guardText } from './numberGuard';
import { classifyRoomWithGeometry, queryLocalCorpus } from './localIntelligence';

/** Bangla numerals for numbers that come from the rule engine. */
export function bn(value: number | string, decimals?: number): string {
  return toBnDigits(value, decimals);
}

const BASIS_BN: Record<string, string> = {
  verified: 'বিএনবিসি-র মূল পাঠ থেকে যাচাই করা সীমা',
  screening: 'প্রাথমিক স্ক্রিনিং সীমা; গেজেটের সঙ্গে মিলিয়ে নিতে হবে',
  drawing: 'নকশার অভ্যন্তরীণ সামঞ্জস্য পরীক্ষা',
};

/**
 * Fixed-wording explanation built only from the rule engine's numbers.
 * Used whenever Gemini is not configured or does not answer.
 */
export function buildTemplateExplanation(v: Violation): ViolationExplanation {
  const m = v.measuredValue;
  const lim = v.limitValue;
  const where = v.floorLabel ? `${v.floorLabel}: ` : '';
  const basisBn = BASIS_BN[v.basis || 'screening'];
  const t = (en: string, bnText: string, actionEn: string, actionBn: string): ViolationExplanation => ({
    en,
    bn: `${bnText} (${basisBn}।)`,
    actionEn,
    actionBn,
    source: 'template',
  });

  switch (v.ruleId) {
    case 'bnbc_p4_exit_unobstructed':
      return t(
        `${where}exit "${v.roomName}" is drawn as locked or blocked, so nobody can leave through it in a fire.`,
        `"${v.roomName}" বহির্গমন দরজাটি নকশায় তালাবদ্ধ বা অবরুদ্ধ দেখানো হয়েছে, তাই আগুন লাগলে এই পথে কেউ বের হতে পারবে না`,
        v.fixSpec?.summary || 'Keep this exit unlocked and clear whenever the building is occupied.',
        'ভবন ব্যবহারের সময় এই দরজা সবসময় তালামুক্ত ও বাধামুক্ত রাখুন।'
      );
    case 'bnbc_p4_exit_door_width':
      return t(
        `${where}exit door "${v.roomName}" is ${m.toFixed(2)} m wide; the screening minimum is ${lim.toFixed(2)} m.`,
        `"${v.roomName}" বহির্গমন দরজার প্রস্থ ${bn(m, 2)} মিটার; প্রাথমিক ন্যূনতম সীমা ${bn(lim, 2)} মিটার`,
        v.fixSpec?.summary || `Widen the door to at least ${lim.toFixed(2)} m.`,
        `দরজার প্রস্থ কমপক্ষে ${bn(lim, 2)} মিটার করুন।`
      );
    case 'bnbc_p4_dual_exit_count':
      return t(
        `${where}only ${m} usable ${v.unit} found; ${lim} is the screening expectation, so one fire could cut off everyone.`,
        `এই তলায় ব্যবহারযোগ্য বহির্গমন পথ মাত্র ${bn(m)}টি; প্রত্যাশিত ন্যূনতম ${bn(lim)}টি, ফলে একটি আগুনেই সবার পথ বন্ধ হতে পারে`,
        'Provide a second exit or stair, well separated from the first.',
        'প্রথমটি থেকে দূরে আরেকটি বহির্গমন পথ বা সিঁড়ি রাখুন।'
      );
    case 'bnbc_p4_stair_continuity':
      return t(
        `${where}stair "${v.roomName}" has no stair below it, so it does not reach the ground floor.`,
        `"${v.roomName}" সিঁড়ির ঠিক নিচের তলায় কোনো সিঁড়ি নেই, তাই এটি নিচতলা পর্যন্ত পৌঁছায় না`,
        'Align the stair so it runs continuously down to the ground floor.',
        'সিঁড়িটি নিচতলা পর্যন্ত একটানা রাখুন।'
      );
    case 'bnbc_p4_stair_discharge':
      return t(
        `${where}from the foot of "${v.roomName}" no unlocked ground-floor exit can be reached.`,
        `"${v.roomName}"-এর নিচ থেকে নিচতলার কোনো খোলা বহির্গমন দরজায় পৌঁছানো যায় না`,
        'Open a route from the foot of the stair to a ground-floor exit.',
        'সিঁড়ির নিচ থেকে নিচতলার বহির্গমন দরজা পর্যন্ত পথ খোলা রাখুন।'
      );
    case 'egress_no_route':
      return t(
        `${where}no walking route was found from "${v.roomName}" to any open exit. People in this room would be trapped.`,
        `"${v.roomName}" থেকে কোনো খোলা বহির্গমন পথে হেঁটে যাওয়ার রাস্তা পাওয়া যায়নি; এই কক্ষের মানুষ আটকা পড়বে`,
        'Unlock the blocked exit or open a route out of this room.',
        'বন্ধ বহির্গমন দরজা খুলে দিন অথবা এই কক্ষ থেকে বের হওয়ার পথ তৈরি করুন।'
      );
    case 'bnbc_1.13.8.2_travel_distance':
      return t(
        `${where}the walking route from cabin "${v.roomName}" to the nearest exit is ${m.toFixed(2)} m; the limit is ${lim.toFixed(0)} m.`,
        `"${v.roomName}" কেবিন থেকে নিকটতম বহির্গমন পথের হাঁটা দূরত্ব ${bn(m, 2)} মিটার; সীমা ${bn(lim, 0)} মিটার`,
        `Open a nearer exit or move the cabin so the route is ${lim.toFixed(0)} m or less.`,
        `কাছাকাছি বহির্গমন পথ চালু করুন অথবা কেবিন সরান, যাতে দূরত্ব ${bn(lim, 0)} মিটারের মধ্যে থাকে।`
      );
    case 'screen_travel_distance':
      return t(
        `${where}the walking route from "${v.roomName}" to the nearest exit is ${m.toFixed(2)} m, over the ${lim.toFixed(1)} m screening reference. A reviewer should check the limit for this occupancy.`,
        `"${v.roomName}" থেকে নিকটতম বহির্গমন পথের হাঁটা দূরত্ব ${bn(m, 2)} মিটার, যা ${bn(lim, 1)} মিটার স্ক্রিনিং সীমার বেশি; এই ব্যবহারের জন্য প্রযোজ্য সীমা পর্যালোচককে মিলিয়ে দেখতে হবে`,
        'Check the travel-distance limit for this occupancy; consider a nearer exit.',
        'এই ব্যবহারের জন্য প্রযোজ্য দূরত্বসীমা যাচাই করুন; প্রয়োজনে কাছাকাছি বহির্গমন পথ রাখুন।'
      );
    case 'bnbc_1.13.8.2_passage_width':
      return t(
        `${where}a passage is only ${m.toFixed(2)} m wide; the minimum is ${lim.toFixed(2)} m.`,
        `একটি চলাচলের পথ মাত্র ${bn(m, 2)} মিটার চওড়া; ন্যূনতম ${bn(lim, 2)} মিটার দরকার`,
        v.fixSpec?.summary || `Widen the passage to at least ${lim.toFixed(2)} m.`,
        `পার্টিশন দেয়াল সরিয়ে পথটি কমপক্ষে ${bn(lim, 2)} মিটার চওড়া করুন।`
      );
    case 'bnbc_1.13.5_stair_headroom':
      return t(
        `${where}"${v.roomName}" has ${m.toFixed(2)} m headroom; the minimum is ${lim.toFixed(2)} m.`,
        `"${v.roomName}" সিঁড়ির ওপরে ফাঁকা উচ্চতা ${bn(m, 2)} মিটার; ন্যূনতম ${bn(lim, 2)} মিটার দরকার`,
        v.fixSpec?.summary || `Raise the headroom to at least ${lim.toFixed(2)} m.`,
        `সিঁড়ির ওপরের ফাঁকা উচ্চতা কমপক্ষে ${bn(lim, 2)} মিটার করুন।`
      );
    case 'bnbc_1.13.5_stair_handrail':
      return t(
        `${where}"${v.roomName}" has a ${m.toFixed(2)} m handrail; the minimum is ${lim.toFixed(2)} m.`,
        `"${v.roomName}" সিঁড়ির হাতলের উচ্চতা ${bn(m, 2)} মিটার; ন্যূনতম ${bn(lim, 2)} মিটার দরকার`,
        v.fixSpec?.summary || `Raise the handrail to at least ${lim.toFixed(2)} m.`,
        `হাতলের উচ্চতা কমপক্ষে ${bn(lim, 2)} মিটার করুন।`
      );
    case 'bnbc_1.13.5_stair_proportion':
      return t(
        `${where}on "${v.roomName}", two risers plus one tread come to ${m} mm; the allowed range is 610–648 mm.`,
        `"${v.roomName}" সিঁড়িতে দুই রাইজার ও এক ট্রেডের যোগফল ${bn(m)} মিলিমিটার; অনুমোদিত সীমা ৬১০–৬৪৮ মিলিমিটার`,
        'Adjust the riser or tread so that 2R + T falls between 610 and 648 mm.',
        'রাইজার বা ট্রেড এমনভাবে ঠিক করুন যাতে যোগফল ৬১০–৬৪৮ মিলিমিটারের মধ্যে থাকে।'
      );
    case 'cad_dimension_override_mismatch':
      return t(
        `${where}a dimension is typed as ${lim.toFixed(2)} m but the drawing measures ${m.toFixed(2)} m between its points.`,
        `নকশায় মাপ লেখা আছে ${bn(lim, 2)} মিটার, কিন্তু দুই বিন্দুর প্রকৃত দূরত্ব ${bn(m, 2)} মিটার`,
        v.fixSpec?.summary || 'Correct the dimension text to the real distance.',
        'মাপের লেখাটি প্রকৃত দূরত্ব অনুযায়ী সংশোধন করুন।'
      );
    case 'bnbc_3.12_habitable_area':
      return t(
        `${where}sleeping room "${v.roomName}" is ${m.toFixed(1)} m²; the minimum is ${lim.toFixed(1)} m².`,
        `"${v.roomName}" শয়নকক্ষের আয়তন ${bn(m, 1)} বর্গমিটার; ন্যূনতম ${bn(lim, 1)} বর্গমিটার দরকার`,
        `Enlarge the room to at least ${lim.toFixed(1)} m².`,
        `কক্ষের আয়তন কমপক্ষে ${bn(lim, 1)} বর্গমিটার করুন।`
      );
    case 'bnbc_bedroom_width':
      return t(
        `${where}sleeping room "${v.roomName}" is ${m.toFixed(2)} m wide; the minimum width is ${lim.toFixed(1)} m.`,
        `"${v.roomName}" শয়নকক্ষের প্রস্থ ${bn(m, 2)} মিটার; ন্যূনতম ${bn(lim, 1)} মিটার দরকার`,
        `Widen the room to at least ${lim.toFixed(1)} m.`,
        `কক্ষের প্রস্থ কমপক্ষে ${bn(lim, 1)} মিটার করুন।`
      );
    case 'bnbc_3.16_daylight_ventilation':
      return t(
        `${where}no window was found on "${v.roomName}". Habitable rooms need openings equal to 15% of the floor area.`,
        `"${v.roomName}" কক্ষের দেয়ালে কোনো জানালা পাওয়া যায়নি; বাসযোগ্য কক্ষে মেঝের ক্ষেত্রফলের ১৫% পরিমাণ খোলা অংশ দরকার`,
        'Add a window, or confirm that the room has one that the drawing does not show as a block.',
        'জানালা যোগ করুন, অথবা নকশায় জানালা থাকলে তা নিশ্চিত করুন।'
      );
    case 'bnbc_4.3.9_exit_capacity':
    case 'bnbc_4.3.9_stair_capacity':
      return t(
        `${where}${v.roomName.toLowerCase()} can pass about ${m} persons, but about ${lim} are estimated on the busiest floor. Both figures use assumed factors.`,
        `${v.ruleId === 'bnbc_4.3.9_exit_capacity' ? 'নিচতলার বহির্গমন দরজা' : 'সিঁড়ি'} দিয়ে আনুমানিক ${bn(m)} জন বের হতে পারে, অথচ ব্যস্ততম তলায় আনুমানিক ${bn(lim)} জন থাকে; দুটি সংখ্যাই অনুমিত হারের ভিত্তিতে`,
        'Check the occupant load, then widen or add exits and stairs if needed.',
        'লোকসংখ্যা যাচাই করুন, প্রয়োজনে দরজা বা সিঁড়ি চওড়া করুন বা বাড়ান।'
      );
    case 'imarat_rule16_mgc':
      return t(
        `The ground floor covers ${m.toFixed(1)}% of the plot; the screening limit is ${lim}%.`,
        `নিচতলা প্লটের ${bn(m, 1)}% জুড়ে আছে; স্ক্রিনিং সীমা ${bn(lim)}%`,
        'Check the ground-coverage schedule for this plot, then reduce the footprint if needed.',
        'এই প্লটের জন্য প্রযোজ্য ভূমি-আচ্ছাদন সীমা যাচাই করুন; প্রয়োজনে নিচতলার আয়তন কমান।'
      );
    case 'imarat_rule16_far':
      return t(
        `FAR is ${m.toFixed(2)}; the screening limit for this road width is ${lim.toFixed(2)}.`,
        `এফএআর ${bn(m, 2)}; এই রাস্তার প্রস্থের জন্য স্ক্রিনিং সীমা ${bn(lim, 2)}`,
        'Check the FAR schedule for this plot and road, then reduce floor area if needed.',
        'এই প্লট ও রাস্তার জন্য প্রযোজ্য এফএআর যাচাই করুন; প্রয়োজনে মোট মেঝের আয়তন কমান।'
      );
    case 'imarat_rule17_setback':
      return t(
        `The ${v.roomName.toLowerCase()} is ${m.toFixed(2)} m; the screening minimum is ${lim.toFixed(2)} m.`,
        `ঘোষিত সেটব্যাক ${bn(m, 2)} মিটার; স্ক্রিনিং ন্যূনতম ${bn(lim, 2)} মিটার`,
        `Check the setback schedule, then provide at least ${lim.toFixed(2)} m if it applies.`,
        `সেটব্যাক বিধি যাচাই করুন; প্রযোজ্য হলে কমপক্ষে ${bn(lim, 2)} মিটার রাখুন।`
      );
    case 'bnbc_4.4.1_highrise':
      return t(
        `The building is about ${m.toFixed(1)} m high. Above ${lim.toFixed(0)} m it counts as a high-rise and extra fire provisions apply.`,
        `ভবনের উচ্চতা আনুমানিক ${bn(m, 1)} মিটার; ${bn(lim, 0)} মিটারের বেশি হলে এটি বহুতল ভবন এবং অতিরিক্ত অগ্নি-নিরাপত্তা বিধান প্রযোজ্য`,
        'Review the high-rise fire provisions of BNBC Part 4 for this building.',
        'এই ভবনের জন্য বিএনবিসি চতুর্থ খণ্ডের বহুতল ভবন-সংক্রান্ত বিধান পর্যালোচনা করুন।'
      );
    case 'input_exits_unidentified':
      return {
        en: `${where}no exit door or stair could be identified, so travel distances are not reported. Mark the exits in Review.`,
        bn: 'এই তলায় কোনো বহির্গমন দরজা বা সিঁড়ি শনাক্ত করা যায়নি, তাই হাঁটা দূরত্ব দেখানো হয়নি। রিভিউ ধাপে বহির্গমন দরজা চিহ্নিত করুন।',
        actionEn: 'Open Review and tick "Exit" on the doors that lead outside.',
        actionBn: 'রিভিউ ধাপে যে দরজাগুলো বাইরে যায় সেগুলোতে "Exit" চিহ্ন দিন।',
        source: 'template',
      };
    default:
      return t(
        v.description,
        `${v.ruleName}: পরিমাপ ${bn(m)} ${v.unit}, সীমা ${bn(lim)} ${v.unit}`,
        v.fixSpec?.summary || 'Review this item against the cited source.',
        'উল্লিখিত সূত্রের সঙ্গে মিলিয়ে নকশা পর্যালোচনা করুন।'
      );
  }
}

/** One-line measured value for reports, without inventing a number for blocked rooms. */
export function formatMeasured(v: Violation): string {
  return v.blocked ? 'No route' : `${v.measuredValue} ${v.unit}`;
}

export function buildTemplateNarration(
  planName: string,
  deltas: RemediationDelta[],
  beforeAudit: ComplianceAudit,
  afterAudit: ComplianceAudit
): FixNarration {
  return {
    headlineEn:
      deltas.length === 0
        ? 'No automatic change is proposed for this plan'
        : `${beforeAudit.failCount} failures before, ${afterAudit.failCount} after ${deltas.length} proposed changes`,
    headlineBn:
      deltas.length === 0
        ? 'এই নকশার জন্য কোনো স্বয়ংক্রিয় পরিবর্তন প্রস্তাব করা হয়নি'
        : `${bn(deltas.length)}টি প্রস্তাবিত পরিবর্তনে ত্রুটি ${bn(beforeAudit.failCount)}টি থেকে ${bn(afterAudit.failCount)}টিতে নেমেছে`,
    summaryEn: `On "${planName}", the slowest escape goes from ${
      beforeAudit.worstEscapeSec > 0 ? `${beforeAudit.worstEscapeSec.toFixed(1)} s` : 'not measurable'
    } to ${afterAudit.worstEscapeSec.toFixed(1)} s, and trapped rooms from ${beforeAudit.trappedRoomCount} to ${afterAudit.trappedRoomCount}. The changes are applied to a copy of the geometry; the DXF file is not edited.`,
    summaryBn: `"${planName}" নকশায় সবচেয়ে ধীর বহির্গমন সময় ${
      beforeAudit.worstEscapeSec > 0 ? `${bn(beforeAudit.worstEscapeSec, 1)} সেকেন্ড` : 'পরিমাপযোগ্য নয়'
    } থেকে ${bn(afterAudit.worstEscapeSec, 1)} সেকেন্ডে এসেছে, আর আটকা পড়া কক্ষ ${bn(beforeAudit.trappedRoomCount)}টি থেকে ${bn(afterAudit.trappedRoomCount)}টিতে। পরিবর্তনগুলো জ্যামিতির একটি অনুলিপিতে করা হয়েছে; মূল DXF ফাইল অপরিবর্তিত।`,
    bulletChanges: deltas.map((d) => ({
      en: d.summary,
      bn: d.summaryBn || d.summary,
    })),
    source: 'template',
  };
}

export async function requestAiLabelReconciliation(
  rooms: RoomEntity[],
  floors?: ParsedFloorPlan[]
): Promise<{
  source: 'gemini' | 'heuristic';
  updates: { id: string; taxonomy: RoomTaxonomy; confidence: number; reason: string }[];
}> {
  // First compute geometry + morphological inference locally in the browser
  const localUpdates = rooms
    .filter((r) => r.mappingSource !== 'manual')
    .map((r) => {
      const floor = floors?.find((fl) => fl.floorIndex === r.floorIndex) || floors?.[0] || null;
      const inferred = classifyRoomWithGeometry(r, floor);
      return { id: r.id, ...inferred };
    });

  try {
    const res = await fetch('/api/ai/reconcile-labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labels: rooms.map((r) => ({ id: r.id, originalLabel: r.originalLabel })),
      }),
    });
    if (!res.ok) return { source: 'heuristic', updates: localUpdates };
    const data = await res.json();
    if (data.source === 'gemini' && Array.isArray(data.mappings) && data.mappings.length > 0) {
      const allowed = ['bedroom', 'habitable', 'cabin', 'corridor', 'stair', 'exit', 'workfloor', 'utility', 'lobby'];
      const ids = new Set(rooms.map((r) => r.id));
      // Only accept answers that name a known room and a known category.
      const updates = data.mappings.filter(
        (m: { id?: string; taxonomy?: string }) => m && ids.has(String(m.id)) && allowed.includes(String(m.taxonomy))
      );
      if (updates.length > 0) return { source: 'gemini', updates };
    }
    return { source: 'heuristic', updates: localUpdates };
  } catch {
    return { source: 'heuristic', updates: localUpdates };
  }
}

/** Document names that longer texts (answers, review note) may mention. Not measurements. */
const REFERENCE_NAMES = ['BNBC 2012', 'BNBC 2020', 'Imarat Nirman Bidhimala 2008', 'Part 3', 'Part 4', 'Ch. 1', 'Ch. 3'];

/** Numbers a sentence about this finding may contain: its own data and nothing else. */
export function violationNumberSources(v: Violation): (string | number | undefined)[] {
  return [
    v.blocked ? undefined : v.measuredValue,
    v.limitValue,
    v.roomName,
    v.floorLabel,
    v.citation,
    v.ruleName,
    v.description,
    v.fixSpec?.summary,
    v.fixSpec?.deltaBeforeM,
    v.fixSpec?.deltaAfterM,
  ];
}

export async function requestAiViolationExplanations(
  violations: Violation[]
): Promise<Record<string, ViolationExplanation>> {
  const out: Record<string, ViolationExplanation> = {};
  for (const v of violations) {
    out[v.id] = buildTemplateExplanation(v);
  }
  if (violations.length === 0) return out;

  try {
    const res = await fetch('/api/ai/explain-violations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        violations: violations.map((v) => ({
          id: v.id,
          ruleId: v.ruleId,
          ruleName: v.ruleName,
          citation: v.citation,
          basis: v.basis,
          roomName: v.roomName,
          measuredValue: v.blocked ? null : v.measuredValue,
          limitValue: v.limitValue,
          unit: v.unit,
          comparator: v.comparator,
          description: v.description,
          fixSummary: v.fixSpec?.summary || null,
        })),
      }),
    });
    if (!res.ok) return out;
    const data = await res.json();
    if (data.source === 'gemini' && Array.isArray(data.explanations)) {
      const byId = new Map(violations.map((v) => [v.id, v]));
      for (const item of data.explanations) {
        const v = item && byId.get(String(item.id));
        if (v && item.en && item.bn) {
          // Every number Gemini writes must come from this finding's own data.
          const sources = violationNumberSources(v);
          const tpl = out[v.id];
          const ex: ViolationExplanation = {
            en: guardText(item.en, tpl.en, sources),
            bn: guardText(item.bn, tpl.bn, sources),
            actionEn: guardText(item.actionEn, tpl.actionEn, sources),
            actionBn: guardText(item.actionBn, tpl.actionBn, sources),
            source: 'gemini',
          };
          if (ex.en === tpl.en && ex.bn === tpl.bn && ex.actionEn === tpl.actionEn && ex.actionBn === tpl.actionBn) {
            ex.source = 'template';
          }
          out[v.id] = ex;
        }
      }
    }
  } catch {
    // Keep deterministic template explanations
  }
  return out;
}

export async function requestAiFixNarration(
  planName: string,
  deltas: RemediationDelta[],
  beforeAudit: ComplianceAudit,
  afterAudit: ComplianceAudit
): Promise<FixNarration> {
  const fallback = buildTemplateNarration(planName, deltas, beforeAudit, afterAudit);
  try {
    const res = await fetch('/api/ai/narrate-fixes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planName,
        deltas: deltas.map((d) => ({ summary: d.summary, action: d.action })),
        beforeFailCount: beforeAudit.failCount,
        afterFailCount: afterAudit.failCount,
        beforeWorstSec: Number.isFinite(beforeAudit.worstEscapeSec)
          ? beforeAudit.worstEscapeSec
          : 999,
        afterWorstSec: Number.isFinite(afterAudit.worstEscapeSec)
          ? afterAudit.worstEscapeSec
          : 999,
        beforeTrappedCount: beforeAudit.trappedRoomCount,
        afterTrappedCount: afterAudit.trappedRoomCount,
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    if (data.source === 'gemini' && data.narration && data.narration.headlineEn) {
      const n = data.narration;
      const sources = [
        planName,
        deltas.length,
        beforeAudit.failCount,
        afterAudit.failCount,
        beforeAudit.warnCount,
        afterAudit.warnCount,
        beforeAudit.worstEscapeSec,
        afterAudit.worstEscapeSec,
        beforeAudit.worstEscapeSec - afterAudit.worstEscapeSec,
        beforeAudit.trappedRoomCount,
        afterAudit.trappedRoomCount,
        ...deltas.flatMap((d) => [d.summary, d.deltaBeforeM, d.deltaAfterM]),
      ];
      const bullets = Array.isArray(n.bulletChanges) ? n.bulletChanges : [];
      return {
        headlineEn: guardText(n.headlineEn, fallback.headlineEn, sources),
        headlineBn: guardText(n.headlineBn, fallback.headlineBn, sources),
        summaryEn: guardText(n.summaryEn, fallback.summaryEn, sources),
        summaryBn: guardText(n.summaryBn, fallback.summaryBn, sources),
        bulletChanges:
          bullets.length === fallback.bulletChanges.length
            ? bullets.map((b: { en?: string; bn?: string }, i: number) => ({
                en: guardText(b?.en, fallback.bulletChanges[i].en, sources),
                bn: guardText(b?.bn, fallback.bulletChanges[i].bn, sources),
              }))
            : fallback.bulletChanges,
        source: 'gemini',
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function localLexicalRagSearch(question: string): RagClauseCitation[] {
  const tokens = question
    .toLowerCase()
    .replace(/সিঁড়ি|সিড়ি/g, ' stair ')
    .replace(/রাইজার|ট্রেড/g, ' riser tread ')
    .replace(/শয়ন|বেডরুম|শোবার/g, ' bedroom sleeping ')
    .replace(/জানালা|আলো|বাতাস/g, ' window ventilation ')
    .replace(/দূরত্ব|কেবিন/g, ' cabin travel distance ')
    .replace(/করিডোর|পথ|প্রস্থ/g, ' passage width ')
    .replace(/দরজা|বহির্গমন/g, ' exit door ')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const scored = REGULATORY_CORPUS.map((chunk) => {
    const hay = `${chunk.title} ${chunk.clause} ${chunk.part} ${chunk.keywords.join(' ')} ${chunk.text}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 1;
    }
    return { chunk, score };
  }).sort((a, b) => b.score - a.score);

  const maxScore = Math.max(1, scored[0]?.score || 1);
  return scored.slice(0, 4).map(({ chunk, score }) => ({
    id: chunk.id,
    docId: chunk.docId,
    clause: `${chunk.part} — ${chunk.clause}`,
    title: chunk.title,
    excerpt: chunk.text,
    score: Number((score / maxScore).toFixed(2)),
    basis: chunk.basis,
  }));
}

export async function requestRagQuery(
  question: string,
  project: BuildingProject,
  audit: ComplianceAudit
): Promise<RagQueryResponse> {
  const localCitations = localLexicalRagSearch(question);
  const fallback = queryLocalCorpus(question, project, audit);

  try {
    const res = await fetch('/api/rag/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        occupancyClass: project.occupancyClass,
        projectContext: {
          name: project.name,
          floorCount: project.floors.length,
          totalHeightM: Number((project.floors.length * project.storyHeightM).toFixed(1)),
          metrics: audit.metrics || null,
          failCount: audit.failCount,
          warnCount: audit.warnCount,
          topViolations: audit.violations.slice(0, 6).map((v) => ({
            floor: v.floorLabel || 'GF',
            ruleName: v.ruleName,
            citation: v.citation,
            measured: `${v.measuredValue} ${v.unit}`,
            limit: `${v.comparator} ${v.limitValue} ${v.unit}`,
          })),
        },
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    if (data && data.answerEn) {
      const cites: RagClauseCitation[] = Array.isArray(data.citations) ? data.citations : localCitations;
      const sources = [
        ...REFERENCE_NAMES,
        question,
        project.name,
        project.floors.length,
        project.floors.length * project.storyHeightM,
        ...cites.flatMap((c) => [c.clause, c.title, c.excerpt]),
        ...REGULATORY_CORPUS.filter((c) => cites.some((x) => x.id === c.id)).map((c) => c.textBn),
        ...audit.violations.slice(0, 6).flatMap((v) => violationNumberSources(v)),
        ...(audit.metrics ? Object.values(audit.metrics).filter((x): x is number => typeof x === 'number') : []),
        audit.failCount,
        audit.warnCount,
      ];
      return {
        answerEn: guardText(data.answerEn, fallback.answerEn, sources),
        answerBn: guardText(data.answerBn, fallback.answerBn, sources),
        citations: Array.isArray(data.citations) ? data.citations : localCitations,
        source: data.source || 'lexical-rag',
        retrievalMode: data.retrievalMode || 'bm25-lexical',
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function buildTemplateDeficiencyMemo(
  project: BuildingProject,
  beforeAudit: ComplianceAudit,
  afterAudit: ComplianceAudit
): DeficiencyMemo {
  const decisionStatus: DeficiencyMemo['decisionStatus'] =
    beforeAudit.failCount > 0
      ? 'OBJECTION_RAISED'
      : beforeAudit.warnCount > 0
        ? 'CONDITIONAL_REVIEW'
        : 'CLEARED_FOR_FILING';

  const citedClauses = Array.from(
    new Set(beforeAudit.violations.map((v) => v.citation).filter(Boolean))
  ).slice(0, 10);

  const m = beforeAudit.metrics;
  const zoningLineEn = m
    ? m.plotAreaSqM > 0
      ? `Zoning screening: plot ${m.plotAreaSqM} m², ground coverage ${m.mgcPercent}% (screening limit ${m.maxAllowedMgcPercent}%), FAR ${m.achievedFar} (screening limit ${m.maxAllowedFar}). Estimated peak floor load ${m.peakFloorLoad} persons.`
      : `Zoning not screened: plot data was not entered. Estimated peak floor load ${m.peakFloorLoad} persons.`
    : '';
  const zoningLineBn = m
    ? m.plotAreaSqM > 0
      ? `জোনিং স্ক্রিনিং: প্লট ${bn(m.plotAreaSqM)} m², ভূমি-আচ্ছাদন ${bn(m.mgcPercent)}% (স্ক্রিনিং সীমা ${bn(m.maxAllowedMgcPercent)}%), এফএআর ${bn(m.achievedFar)} (স্ক্রিনিং সীমা ${bn(m.maxAllowedFar)})। এক তলায় আনুমানিক সর্বোচ্চ ${bn(m.peakFloorLoad)} জন।`
      : `জোনিং যাচাই করা হয়নি: প্লটের তথ্য দেওয়া হয়নি। এক তলায় আনুমানিক সর্বোচ্চ ${bn(m.peakFloorLoad)} জন।`
    : '';

  const topFindingsEn = beforeAudit.violations
    .slice(0, 8)
    .map(
      (v, i) =>
        `${i + 1}. [${v.floorLabel || 'GF'}] ${v.status} — ${v.ruleName} (${v.roomName}): Measured ${
          v.blocked ? 'NO ROUTE' : `${v.measuredValue} ${v.unit}`
        } vs. ${v.comparator} ${v.limitValue} ${v.unit} [${v.citation}].`
    )
    .join('\n');

  const topFindingsBn = beforeAudit.violations
    .slice(0, 8)
    .map(
      (v, i) =>
        `${bn(i + 1)}. [${v.floorLabel || 'GF'}] ${v.status === 'FAIL' ? 'ত্রুটি' : 'সতর্কতা'}: ${v.ruleName} (${v.roomName}): পরিমাপ ${
          v.blocked ? 'কোনো পথ নেই' : `${bn(v.measuredValue)} ${v.unit}`
        }, সীমা ${v.comparator} ${bn(v.limitValue)} ${v.unit} [${v.citation}]।`
    )
    .join('\n');

  const statusEn =
    decisionStatus === 'OBJECTION_RAISED'
      ? 'Issues found. Corrections needed before submission'
      : decisionStatus === 'CONDITIONAL_REVIEW'
        ? 'Warnings only. A reviewer should check them'
        : 'No issues found by this screening';
  const statusBn =
    decisionStatus === 'OBJECTION_RAISED'
      ? 'ত্রুটি পাওয়া গেছে; দাখিলের আগে সংশোধন প্রয়োজন'
      : decisionStatus === 'CONDITIONAL_REVIEW'
        ? 'শুধু সতর্কতা; পর্যালোচকের যাচাই প্রয়োজন'
        : 'এই স্ক্রিনিংয়ে কোনো ত্রুটি পাওয়া যায়নি';
  const skippedBn = (beforeAudit.notChecked || []).map((n) => `- ${n.floorLabel ? `[${n.floorLabel}] ` : ''}${n.item}: ${n.reason}`);
  const skipped = (beforeAudit.notChecked || []).map((n) => `- ${n.floorLabel ? `[${n.floorLabel}] ` : ''}${n.item}: ${n.reason}`);
  const verifiedCount = beforeAudit.violations.filter((v) => v.basis === 'verified').length;
  const screeningCount = beforeAudit.violations.filter((v) => v.basis === 'screening').length;

  return {
    subjectEn: `Draft pre-submission review note: ${project.name}`,
    subjectBn: `দাখিলের আগের পর্যালোচনা নোটের খসড়া: ${project.name}`,
    decisionStatus,
    memoBodyEn: `DRAFT, produced by DrawFix Ai. Not a RAJUK or Fire Service document and not an approval.\n\nResult: ${statusEn}\nProject: ${project.name} (${project.floors.length} floor${project.floors.length === 1 ? '' : 's'}, ${(project.floors.length * project.storyHeightM).toFixed(1)} m)\n${zoningLineEn}\n\nFindings (${beforeAudit.failCount} fail, ${beforeAudit.warnCount} warn; ${verifiedCount} on thresholds verified in BNBC 2012 Part 3, ${screeningCount} on screening thresholds):\n${topFindingsEn || 'None.'}\n\nNot checked:\n${skipped.join('\n') || '- Nothing skipped.'}\n\nWith the proposed changes applied to a copy of the geometry: ${afterAudit.failCount} fail, ${afterAudit.warnCount} warn.\n\nEvery number above was measured by code from the drawing. A qualified reviewer must confirm the findings and the screening thresholds before any decision.`,
    memoBodyBn: `খসড়া, DrawFix Ai তৈরি করেছে। এটি রাজউক বা ফায়ার সার্ভিসের নথি নয় এবং কোনো অনুমোদন নয়।\n\nফলাফল: ${statusBn}\nপ্রকল্প: ${project.name} (${bn(project.floors.length)} তলা, ${bn(project.floors.length * project.storyHeightM, 1)} মিটার)\n${zoningLineBn}\n\nপর্যবেক্ষণ (${bn(beforeAudit.failCount)}টি ত্রুটি, ${bn(beforeAudit.warnCount)}টি সতর্কতা; ${bn(verifiedCount)}টি বিএনবিসি ২০১২ খণ্ড ৩-এ যাচাই করা সীমার ওপর, ${bn(screeningCount)}টি স্ক্রিনিং সীমার ওপর):\n${topFindingsBn || 'নেই।'}\n\nযা যাচাই করা হয়নি (কারণ ইংরেজিতে):\n${skippedBn.join('\n') || '- কিছুই বাদ যায়নি।'}\n\nপ্রস্তাবিত পরিবর্তন জ্যামিতির একটি অনুলিপিতে প্রয়োগ করার পর: ${bn(afterAudit.failCount)}টি ত্রুটি, ${bn(afterAudit.warnCount)}টি সতর্কতা।\n\nওপরের প্রতিটি সংখ্যা নকশা থেকে কোড দিয়ে মাপা। যেকোনো সিদ্ধান্তের আগে একজন যোগ্য পর্যালোচককে পর্যবেক্ষণ ও স্ক্রিনিং সীমা নিশ্চিত করতে হবে।`,
    citedClauses,
    source: 'template',
  };
}

export async function requestDeficiencyMemo(
  project: BuildingProject,
  beforeAudit: ComplianceAudit,
  afterAudit: ComplianceAudit
): Promise<DeficiencyMemo> {
  const fallback = buildTemplateDeficiencyMemo(project, beforeAudit, afterAudit);
  try {
    const res = await fetch('/api/ai/deficiency-memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: project.name,
        occupancyClass: project.occupancyClass,
        floorCount: project.floors.length,
        totalHeightM: Number((project.floors.length * project.storyHeightM).toFixed(1)),
        siteContext: project.siteContext || null,
        metrics: beforeAudit.metrics || null,
        beforeFailCount: beforeAudit.failCount,
        beforeWarnCount: beforeAudit.warnCount,
        afterFailCount: afterAudit.failCount,
        violations: beforeAudit.violations.slice(0, 12).map((v) => ({
          id: v.id,
          ruleId: v.ruleId,
          ruleName: v.ruleName,
          citation: v.citation,
          roomName: `${v.floorLabel || 'GF'} ${v.roomName}`,
          measuredValue: v.measuredValue,
          limitValue: v.limitValue,
          unit: v.unit,
          comparator: v.comparator,
          description: v.description,
          fixSummary: v.fixSpec?.summary || null,
        })),
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    if (data && data.source === 'gemini-rag' && data.memoBodyEn) {
      const sources = [
        ...REFERENCE_NAMES,
        fallback.memoBodyEn,
        fallback.memoBodyBn,
        project.name,
        ...beforeAudit.violations.flatMap((v) => violationNumberSources(v)),
        ...(project.siteContext ? Object.values(project.siteContext).filter((x): x is number => typeof x === 'number') : []),
      ];
      return {
        subjectEn: guardText(data.subjectEn, fallback.subjectEn, sources),
        subjectBn: guardText(data.subjectBn, fallback.subjectBn, sources),
        decisionStatus: data.decisionStatus || fallback.decisionStatus,
        memoBodyEn: guardText(data.memoBodyEn, fallback.memoBodyEn, sources),
        memoBodyBn: guardText(data.memoBodyBn, fallback.memoBodyBn, sources),
        citedClauses: Array.isArray(data.citedClauses) ? data.citedClauses : fallback.citedClauses,
        source: 'gemini-rag',
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function heuristicInferConventions(
  layersFound: string[],
  base: LayerConventions
): LayerConventions {
  const pick = (re: RegExp, fallback: string[]) => {
    const matched = layersFound.filter((l) => re.test(l.toUpperCase()));
    return Array.from(new Set([...matched, ...fallback]));
  };
  return {
    ...base,
    wallLayers: pick(/WALL|PART|BRK|MASN|STRUCT/, base.wallLayers),
    doorLayers: pick(/DOOR|DR|EXIT|SHUTTER|GATE/, base.doorLayers),
    windowLayers: pick(/WIN|GLAZ|GLZ|VENT|OPEN/, base.windowLayers),
    stairLayers: pick(/STAIR|STR|STEP|RAMP/, base.stairLayers),
    textLayers: pick(/TEXT|TXT|ANNO|TAG|RM|ROOM|LABEL/, base.textLayers),
    dimLayers: pick(/DIM|MEAS/, base.dimLayers),
  };
}

export async function requestInferredConventions(
  layersFound: string[],
  sampleTexts: string[],
  base: LayerConventions
): Promise<{
  conventions: LayerConventions;
  source: 'gemini' | 'heuristic';
  rationale: string;
}> {
  const local = heuristicInferConventions(layersFound, base);
  try {
    const res = await fetch('/api/ai/infer-conventions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layersFound, sampleTexts }),
    });
    if (!res.ok) {
      return {
        conventions: local,
        source: 'heuristic',
        rationale: 'Matched DXF layers using deterministic architectural token heuristics.',
      };
    }
    const data = await res.json();
    if (data?.source === 'gemini' && data.conventions) {
      const c = data.conventions;
      return {
        source: 'gemini',
        rationale: c.rationale || 'Classified CAD layers with Gemini.',
        conventions: {
          ...base,
          wallLayers: c.wallLayers?.length ? c.wallLayers : local.wallLayers,
          doorLayers: c.doorLayers?.length ? c.doorLayers : local.doorLayers,
          windowLayers: c.windowLayers?.length ? c.windowLayers : local.windowLayers,
          stairLayers: c.stairLayers?.length ? c.stairLayers : local.stairLayers,
          textLayers: c.textLayers?.length ? c.textLayers : local.textLayers,
          dimLayers: c.dimLayers?.length ? c.dimLayers : local.dimLayers,
        },
      };
    }
    return {
      conventions: local,
      source: 'heuristic',
      rationale: 'Matched DXF layers using deterministic architectural token heuristics.',
    };
  } catch {
    return {
      conventions: local,
      source: 'heuristic',
      rationale: 'Matched DXF layers using deterministic architectural token heuristics.',
    };
  }
}
