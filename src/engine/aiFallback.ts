import type {
  BuildingProject,
  ComplianceAudit,
  DeficiencyMemo,
  FixNarration,
  LayerConventions,
  RagClauseCitation,
  RagQueryResponse,
  RemediationDelta,
  RoomEntity,
  RoomTaxonomy,
  Violation,
  ViolationExplanation,
} from '../types/plan';
import { REGULATORY_CORPUS } from './bnbcCorpus';

export function buildTemplateExplanation(v: Violation): ViolationExplanation {
  if (v.ruleId === 'bnbc_p4_exit_unobstructed') {
    return {
      en: `Exit "${v.roomName}" is locked (0 m effective egress), blocking emergency escape under ${v.citation}.`,
      bn: `জরুরি বহির্গমন পথ "${v.roomName}" তালাবদ্ধ থাকায় (${v.measuredValue} m কার্যকর প্রস্থ) অগ্নিকাণ্ডের সময় মানুষ আটকা পড়ার ঝুঁকি তৈরি হয়েছে (${v.citation})।`,
      actionEn: v.fixSpec?.summary || 'Unlock exit door and keep egress path clear at all times.',
      actionBn: 'জরুরি বহির্গমন দরজার তালা খুলে দিন এবং সর্বদা বাধামুক্ত রাখুন (ন্যূনতম ১.১০ মিটার)।',
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_1.13.8.2_travel_distance') {
    return {
      en: `Measured travel path from "${v.roomName}" is ${v.measuredValue.toFixed(2)} m, exceeding the ${v.limitValue.toFixed(2)} m maximum under ${v.citation}.`,
      bn: `"${v.roomName}" থেকে নিকটতম নিরাপদ বহির্গমন পথের দূরত্ব ${v.measuredValue.toFixed(2)} মিটার, যা বিধি অনুযায়ী সর্বোচ্চ ${v.limitValue.toFixed(2)} মিটার সীমার চেয়ে বেশি (${v.citation})।`,
      actionEn: `Unlock or add a closer remote exit/stair core so travel distance drops within ${v.limitValue.toFixed(2)} m.`,
      actionBn: `নিকটবর্তী বিকল্প বহির্গমন পথ সচল করুন যাতে হাঁটার দূরত্ব ${v.limitValue.toFixed(2)} মিটারের নিচে থাকে।`,
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_1.13.8.2_passage_width') {
    return {
      en: `Corridor clear width measures ${v.measuredValue.toFixed(2)} m, below the ${v.limitValue.toFixed(2)} m minimum (${v.citation}).`,
      bn: `করিডোরের পরিষ্কার প্রস্থ ${v.measuredValue.toFixed(2)} মিটার, যা ন্যূনতম ${v.limitValue.toFixed(2)} মিটার মানদণ্ডের কম (${v.citation})।`,
      actionEn: v.fixSpec?.summary || 'Widen the passage to at least 0.75 m (1.20 m recommended).',
      actionBn: 'পার্টিশন দেয়াল সরিয়ে করিডোরের প্রস্থ অন্তত ০.৭৫ মিটার (সুপারিশকৃত ১.২০ মিটার) প্রশস্ত করুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_1.13.5_stair_headroom') {
    return {
      en: `Stair headroom at "${v.roomName}" is ${v.measuredValue.toFixed(2)} m, under the ${v.limitValue.toFixed(2)} m requirement (${v.citation}).`,
      bn: `"${v.roomName}" সিঁড়ির ওপর পরিষ্কার উচ্চতা ${v.measuredValue.toFixed(2)} মিটার, যা ন্যূনতম ${v.limitValue.toFixed(2)} মিটারের কম (${v.citation})।`,
      actionEn: v.fixSpec?.summary || 'Increase staircase clear headroom to at least 2.15 m.',
      actionBn: 'সিঁড়ির ওপরের স্ল্যাব/সফিট ক্লিয়ারেন্স কমপক্ষে ২.১৫ মিটারে উন্নীত করুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_1.13.5_stair_handrail') {
    return {
      en: `Handrail height at "${v.roomName}" measures ${v.measuredValue.toFixed(2)} m, below the ${v.limitValue.toFixed(2)} m minimum (${v.citation}).`,
      bn: `"${v.roomName}" সিঁড়ির হ্যান্ড্রেইলের উচ্চতা ${v.measuredValue.toFixed(2)} মিটার, যা ন্যূনতম ০.৯০ মিটারের চেয়ে কম (${v.citation})।`,
      actionEn: v.fixSpec?.summary || 'Raise handrail height to at least 0.90 m.',
      actionBn: 'সিঁড়ির হ্যান্ড্রেইলের উচ্চতা কমপক্ষে ০.৯০ মিটারে (০.৯৫ মিটার সুপারিশকৃত) বৃদ্ধি করুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'cad_dimension_override_mismatch') {
    return {
      en: `DXF dimension label claims ${v.limitValue.toFixed(2)} m, but actual CAD geometry measures ${v.measuredValue.toFixed(2)} m.`,
      bn: `অটোক্যাড ড্রয়িংয়ের টেক্সট লেবেলে ${v.limitValue.toFixed(2)} মিটার লেখা থাকলেও প্রকৃত জ্যামিতিক পরিমাপ ${v.measuredValue.toFixed(2)} মিটার।`,
      actionEn: v.fixSpec?.summary || 'Remove stale dimension text override so drawing reflects true geometry.',
      actionBn: 'ড্রয়িংয়ের পুরোনো/ভুল ডাইমেনশন টেক্সট সংশোধন করে প্রকৃত পরিমাপের সাথে মিলিয়ে নিন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'imarat_rule16_mgc') {
    return {
      en: `Ground coverage (MGC) reaches ${v.measuredValue.toFixed(1)}%, above the ${v.limitValue}% maximum under ${v.citation}.`,
      bn: `ভবনের নিচতলার আচ্ছাদন (MGC) ${v.measuredValue.toFixed(1)}%, যা বিধি অনুযায়ী সর্বোচ্চ ${v.limitValue}% সীমার চেয়ে বেশি (${v.citation})।`,
      actionEn: 'Reduce ground footprint or increase declared plot area so MGC falls within limit.',
      actionBn: 'নিচতলার বিল্ট ফুটপ্রিন্ট কমিয়ে নির্ধারিত MGC সীমার মধ্যে আনুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'imarat_rule16_far') {
    return {
      en: `Achieved Floor Area Ratio (FAR) is ${v.measuredValue.toFixed(2)}, exceeding the ${v.limitValue.toFixed(2)} road-width allowance (${v.citation}).`,
      bn: `অর্জিত FAR ${v.measuredValue.toFixed(2)}, যা রাস্তার প্রস্থ অনুযায়ী অনুমোদিত ${v.limitValue.toFixed(2)} FAR-এর চেয়ে বেশি (${v.citation})।`,
      actionEn: 'Reduce floor area/stories or verify wider abutting road width for higher FAR.',
      actionBn: 'মোট ফ্লোর এরিয়া/তলা কমান অথবা রাস্তার প্রস্থ ও প্লট অনুযায়ী FAR সমন্বয় করুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'imarat_rule17_setback') {
    return {
      en: `${v.roomName} setback is ${v.measuredValue.toFixed(2)} m, below the ${v.limitValue.toFixed(2)} m minimum (${v.citation}).`,
      bn: `${v.roomName} সেটব্যাক ${v.measuredValue.toFixed(2)} মিটার, যা ন্যূনতম ${v.limitValue.toFixed(2)} মিটার সীমার চেয়ে কম (${v.citation})।`,
      actionEn: `Pull building envelope back to provide at least ${v.limitValue.toFixed(2)} m open setback.`,
      actionBn: `ভবনের প্রান্ত কমপক্ষে ${v.limitValue.toFixed(2)} মিটার ভেতরে সরিয়ে বাধ্যতামূলক খোলা জায়গা রাখুন।`,
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_3.12_habitable_area') {
    return {
      en: `Habitable bedroom "${v.roomName}" measures ${v.measuredValue.toFixed(1)} m², below the ${v.limitValue.toFixed(1)} m² BNBC minimum.`,
      bn: `"${v.roomName}" বেডরুমের আয়তন ${v.measuredValue.toFixed(1)} বর্গমিটার, যা বি.এন.বি.সি ন্যূনতম ${v.limitValue.toFixed(1)} বর্গমিটারের কম।`,
      actionEn: 'Enlarge bedroom polygon to at least 9.5 m² or reclassify room usage.',
      actionBn: 'বেডরুমের আয়তন কমপক্ষে ৯.৫ বর্গমিটারে উন্নীত করুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_3.16_daylight_ventilation') {
    return {
      en: `Habitable room "${v.roomName}" lacks a perimeter window opening for natural daylight & ventilation (${v.citation}).`,
      bn: `"${v.roomName}" কক্ষের দেয়াল বরাবর প্রাকৃতিক আলো ও বাতাস চলাচলের জন্য কোনো জানালা শনাক্ত হয়নি (${v.citation})।`,
      actionEn: 'Provide an exterior operable window opening (>= 10% of floor area).',
      actionBn: 'কক্ষের বহিঃদেয়ালে মেঝের ক্ষেত্রফলের কমপক্ষে ১০% পরিমাণ জানালা যুক্ত করুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_4.3.9_exit_capacity') {
    return {
      en: `Unlocked ground exits handle ${v.measuredValue} persons at 5 mm/person, below the ${v.limitValue} person peak floor load (${v.citation}).`,
      bn: `নিচতলার খোলা বহির্গমন দরজাগুলো সর্বোচ্চ ${v.measuredValue} জনের ধারণক্ষমতা দেয়, যা ফ্লোরের ${v.limitValue} জন লোডের তুলনায় কম (${v.citation})।`,
      actionEn: 'Unlock blocked exit doors or widen exit leaf openings to meet peak occupant capacity.',
      actionBn: 'তালাবদ্ধ দরজা খুলে দিন অথবা বহির্গমন দরজার মোট প্রস্থ বৃদ্ধি করুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_4.3.9_stair_capacity') {
    return {
      en: `Staircase clear width accommodates ${v.measuredValue} persons (7.5 mm/person), below the ${v.limitValue} upper-floor occupant load.`,
      bn: `সিঁড়ির সম্মিলিত প্রস্থ ${v.measuredValue} জনের উপযোগী, যা উপরের তলার ${v.limitValue} জন অকুপ্যান্ট লোডের তুলনায় অপ্রতুল।`,
      actionEn: 'Widen stair flights or add an additional fire-rated stair core.',
      actionBn: 'সিঁড়ির প্রস্থ বৃদ্ধি করুন অথবা অতিরিক্ত ফায়ার-রেটেড সিঁড়ি যুক্ত করুন।',
      source: 'template',
    };
  }
  if (v.ruleId === 'bnbc_4.4.1_highrise') {
    return {
      en: `Building height (${v.measuredValue.toFixed(1)} m) exceeds 20.0 m, triggering FSCD high-rise NOC, fire lift, and pressurized stairs.`,
      bn: `ভবনের মোট উচ্চতা ${v.measuredValue.toFixed(1)} মিটার হওয়ায় (> ২০ মিটার) ফায়ার সার্ভিস এনওসি, ফায়ার লিফট ও প্রেসারাইজড সিঁড়ি বাধ্যতামূলক।`,
      actionEn: 'Include FSCD NOC package, dedicated fireman lift, and wet-riser standpipes.',
      actionBn: 'ফায়ার সার্ভিস (FSCD) অনুমোদন, ফায়ার লিফট ও প্রেসারাইজড সিঁড়ি নকশায় অন্তর্ভুক্ত করুন।',
      source: 'template',
    };
  }
  return {
    en: v.description,
    bn: `${v.ruleName}: পরিমাপ ${v.measuredValue} ${v.unit} (বিধি সীমা: ${v.limitValue} ${v.unit}) — ${v.citation}।`,
    actionEn: v.fixSpec?.summary || 'Review geometry against cited BNBC clause.',
    actionBn: 'উল্লিখিত বি.এন.বি.সি ধারা অনুযায়ী নকশা সংশোধন করুন।',
    source: 'template',
  };
}

export function buildTemplateNarration(
  planName: string,
  deltas: RemediationDelta[],
  beforeAudit: ComplianceAudit,
  afterAudit: ComplianceAudit
): FixNarration {
  return {
    headlineEn: `${beforeAudit.failCount} critical/high failures resolved in JSON geometry simulation`,
    headlineBn: `সংশোধিত জ্যামিতি সিমুলেশনে ${beforeAudit.failCount}টি অগ্নি-নিরাপত্তা ত্রুটি সমাধান হয়েছে`,
    summaryEn: `On "${planName}", applying ${deltas.length} targeted geometric adjustments reduced maximum escape time from ${
      Number.isFinite(beforeAudit.worstEscapeSec) ? `${beforeAudit.worstEscapeSec.toFixed(1)} s` : 'Blocked'
    } to ${afterAudit.worstEscapeSec.toFixed(1)} s (source DXF remains untouched).`,
    summaryBn: `"${planName}" ফ্লোর প্ল্যানে ${deltas.length}টি নির্দিষ্ট জ্যামিতিক পরিবর্তনের ফলে সর্বোচ্চ বহির্গমন সময় ${
      Number.isFinite(beforeAudit.worstEscapeSec) ? `${beforeAudit.worstEscapeSec.toFixed(1)} সেকেন্ড` : 'অবরুদ্ধ অবস্থা'
    } থেকে কমে ${afterAudit.worstEscapeSec.toFixed(1)} সেকেন্ডে নেমে এসেছে (মূল DXF ফাইল অপরিবর্তিত)।`,
    bulletChanges: deltas.map((d) => ({
      en: d.summary,
      bn: d.summary,
    })),
    source: 'template',
  };
}

export async function requestAiLabelReconciliation(
  rooms: RoomEntity[]
): Promise<{
  source: 'gemini' | 'heuristic';
  updates: { id: string; taxonomy: RoomTaxonomy; confidence: number; reason: string }[];
}> {
  try {
    const res = await fetch('/api/ai/reconcile-labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        labels: rooms.map((r) => ({ id: r.id, originalLabel: r.originalLabel })),
      }),
    });
    if (!res.ok) return { source: 'heuristic', updates: [] };
    const data = await res.json();
    if (data.source === 'gemini' && Array.isArray(data.mappings) && data.mappings.length > 0) {
      return { source: 'gemini', updates: data.mappings };
    }
    return { source: 'heuristic', updates: [] };
  } catch {
    return { source: 'heuristic', updates: [] };
  }
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
          roomName: v.roomName,
          measuredValue: v.measuredValue,
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
      for (const item of data.explanations) {
        if (item && item.id && item.en && item.bn) {
          out[item.id] = {
            en: item.en,
            bn: item.bn,
            actionEn: item.actionEn || out[item.id]?.actionEn || '',
            actionBn: item.actionBn || out[item.id]?.actionBn || '',
            source: 'gemini',
          };
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
      return { ...data.narration, source: 'gemini' };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function localLexicalRagSearch(question: string): RagClauseCitation[] {
  const tokens = question
    .toLowerCase()
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
  }));
}

export async function requestRagQuery(
  question: string,
  project: BuildingProject,
  audit: ComplianceAudit
): Promise<RagQueryResponse> {
  const localCitations = localLexicalRagSearch(question);
  const top = localCitations[0];
  const fallback: RagQueryResponse = {
    answerEn: top
      ? `According to ${top.clause}: ${top.excerpt}`
      : 'No matching BNBC or Imarat Bidhimala clause was retrieved.',
    answerBn: top
      ? `${top.clause} (${top.title}) অনুযায়ী প্রযোজ্য বিধি নিচের উদ্ধৃত অংশে দেখুন।`
      : 'সংশ্লিষ্ট কোনো ধারা পাওয়া যায়নি।',
    citations: localCitations,
    source: 'lexical-rag',
    retrievalMode: 'bm25-lexical',
  };

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
      return {
        answerEn: data.answerEn,
        answerBn: data.answerBn || fallback.answerBn,
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
    ? `Zoning & Capacity Summary: Plot ${m.plotAreaSqM} m², MGC ${m.mgcPercent}% (limit ${m.maxAllowedMgcPercent}%), Achieved FAR ${m.achievedFar} (limit ${m.maxAllowedFar}), Peak Floor Load ${m.peakFloorLoad} persons, Ground Exit Cap ${m.groundExitCapacityPersons} persons.`
    : '';
  const zoningLineBn = m
    ? `জোনিং ও ধারণক্ষমতা: প্লট ${m.plotAreaSqM} m², MGC ${m.mgcPercent}% (সীমা ${m.maxAllowedMgcPercent}%), অর্জিত FAR ${m.achievedFar} (সীমা ${m.maxAllowedFar}), সর্বোচ্চ ফ্লোর লোড ${m.peakFloorLoad} জন।`
    : '';

  const topFindingsEn = beforeAudit.violations
    .slice(0, 8)
    .map(
      (v, i) =>
        `${i + 1}. [${v.floorLabel || 'GF'}] ${v.status} — ${v.ruleName} (${v.roomName}): Measured ${
          v.measuredValue >= 99 ? 'BLOCKED' : `${v.measuredValue} ${v.unit}`
        } vs. ${v.comparator} ${v.limitValue} ${v.unit} [${v.citation}].`
    )
    .join('\n');

  const topFindingsBn = beforeAudit.violations
    .slice(0, 8)
    .map(
      (v, i) =>
        `${i + 1}. [${v.floorLabel || 'GF'}] ${v.ruleName} (${v.roomName}): পরিমাপ ${
          v.measuredValue >= 99 ? 'অবরুদ্ধ' : `${v.measuredValue} ${v.unit}`
        }, বিধি সীমা ${v.comparator} ${v.limitValue} ${v.unit} [${v.citation}]।`
    )
    .join('\n');

  return {
    subjectEn: `Pre-Submission Plan Scrutiny Deficiency Memo — ${project.name}`,
    subjectBn: `নকশা যাচাই ও ত্রুটি-বিচ্যুতি স্মারক — ${project.name}`,
    decisionStatus,
    memoBodyEn: `Status: ${decisionStatus.replace(/_/g, ' ')}\nProject: ${project.name} (${project.floors.length} Floors, ${(project.floors.length * project.storyHeightM).toFixed(1)} m height)\n${zoningLineEn}\n\nDeterministic Scrutiny Findings (${beforeAudit.failCount} FAIL, ${beforeAudit.warnCount} WARN):\n${topFindingsEn || 'No violations detected.'}\n\nPost-Remediation Simulation: ${afterAudit.failCount} FAIL, ${afterAudit.warnCount} WARN.\nNote: Automated pre-scrutiny memo grounded in deterministic PlanCheck geometry measurements; final regulatory clearance requires RAJUK/FSCD officer sign-off.`,
    memoBodyBn: `অবস্থা: ${decisionStatus === 'OBJECTION_RAISED' ? 'আপত্তি উত্থাপিত (সংশোধন আবশ্যক)' : decisionStatus === 'CONDITIONAL_REVIEW' ? 'শর্তসাপেক্ষ পর্যালোচনা' : 'দাখিলের জন্য উপযুক্ত'}\nপ্রকল্প: ${project.name} (${project.floors.length} তলা)\n${zoningLineBn}\n\nশনাক্তকৃত ত্রুটিসমূহ (${beforeAudit.failCount} FAIL, ${beforeAudit.warnCount} WARN):\n${topFindingsBn || 'কোনো ত্রুটি পাওয়া যায়নি।'}\n\nসংশোধন-পরবর্তী সিমুলেশন: ${afterAudit.failCount} FAIL।\nবিঃদ্রঃ এটি প্রি-সাবমিশন যাচাই স্মারক; চূড়ান্ত অনুমোদন রাজউক ও ফায়ার সার্ভিসের কর্মকর্তার স্বাক্ষরসাপেক্ষ।`,
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
      return {
        subjectEn: data.subjectEn || fallback.subjectEn,
        subjectBn: data.subjectBn || fallback.subjectBn,
        decisionStatus: data.decisionStatus || fallback.decisionStatus,
        memoBodyEn: data.memoBodyEn,
        memoBodyBn: data.memoBodyBn || fallback.memoBodyBn,
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
