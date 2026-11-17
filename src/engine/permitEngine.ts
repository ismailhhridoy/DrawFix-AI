import { REGULATORY_CORPUS } from './bnbcCorpus';
import type {
  BuildingProject,
  ComplianceAudit,
  CorrectionPackage,
  CorrectionResponseItem,
  OccupancyClass,
  PermitChecklistItem,
  RemediationDelta,
  Violation,
} from '../types/plan';

export type PermitJurisdiction = 'rajuk' | 'cda' | 'city_corp' | 'dife_fscd';

export interface PermitProfileInput {
  jurisdiction: PermitJurisdiction;
  occupancyClass: OccupancyClass;
  floorsCount: number;
  storyHeightM: number;
  plotAreaSqM: number;
  abuttingRoadWidthM: number;
  sprinklered: boolean;
}

export const JURISDICTION_LABELS: Record<PermitJurisdiction, string> = {
  rajuk: 'RAJUK (Dhaka Metropolitan Area)',
  cda: 'CDA (Chattogram Development Authority)',
  city_corp: 'City Corporation / Pourashava Building Desk',
  dife_fscd: 'FSCD & DIFE (Industrial / Factory Licensing)',
};

export const SAMPLE_CORRECTION_LETTERS: {
  id: string;
  title: string;
  authority: string;
  text: string;
}[] = [
  {
    id: 'rajuk-scrutiny',
    title: 'Sample Authority Scrutiny Objection Notice (Multi-Unit / Mixed)',
    authority: 'Plan Scrutiny Cell — Building Approval Office',
    text: `PLAN SCRUTINY OBJECTION NOTICE
Ref: PLAN-2026-4182 / Scrutiny Round 1

1. Bedroom / Sleeping Room Minimum Size: Verify that all sleeping rooms meet the 9.5 m2 minimum net floor area and 2.9 m minimum width requirement under BNBC Part 3.
2. Natural Daylight & Ventilation: Confirm habitable rooms have exterior window openings for daylight and cross-ventilation.
3. Egress & Passage Clear Width: East wing corridor pinch below 0.75 m clear width and stale dimension annotation must be corrected on the revised sheet.
4. Locked or Narrow Exit Doors: One secondary fire exit door is marked locked/obstructed and exit width falls below 0.90 m; restore unobstructed exit discharge.
5. Plot Coverage & FAR Schedule: Submit signed FAR, MGC, and setback computation table matched to abutting road width before backcheck.`,
  },
  {
    id: 'fscd-factory',
    title: 'Sample Industrial & Fire Safety Deficiency Letter (RMG Complex)',
    authority: 'Fire Safety & Factory Compliance Desk',
    text: `FIRE SAFETY & EGRESS DEFICIENCY NOTICE
Ref: FS-INSP-2026-0914

1. Blocked Stair Discharge / Locked Vestibule Door: Ground-floor stair discharge and upper-level vestibule exit doors are drawn locked; all egress doors must remain unlocked from the egress side during occupancy.
2. Corridor Bottleneck: Main evacuation spine narrows to 0.65 m near supervisor cabins while dimension text claims 1.20 m. Widen clear passage to >= 0.75 m (recommended >= 1.20 m for factory floors).
3. Travel Distance Exceeding 16 m: Cabin / production zone travel distance exceeds 16 m threshold; verify exit spacing and add clear pathing.
4. Stair Geometry Verification: Confirm minimum clear headroom (2.15 m), handrail height (0.90 m), and riser/tread proportions on stair detail sheets.
5. Structural & Fire NOC Package: Attach soil investigation report, structural engineer sign-off, and updated floor plans showing revised escape widths.`,
  },
];

export function generatePermitChecklist(
  input: PermitProfileInput,
  project?: BuildingProject | null,
  audit?: ComplianceAudit | null
): PermitChecklistItem[] {
  const totalHeightM = Number((input.floorsCount * input.storyHeightM).toFixed(1));
  const isHighRise = totalHeightM > 20;
  const m = audit?.metrics;

  const findFail = (cat: Violation['category']) =>
    audit?.violations.find((v) => v.category === cat && v.status === 'FAIL');
  const findWarn = (cat: Violation['category']) =>
    audit?.violations.find((v) => v.category === cat);

  const items: PermitChecklistItem[] = [];

  // 1. Zoning & Site
  const farFail = audit?.violations.find((v) => v.ruleId.includes('far'));
  const mgcFail = audit?.violations.find((v) => v.ruleId.includes('mgc'));
  const setbackFail = audit?.violations.find((v) => v.ruleId.includes('setback'));

  items.push({
    id: 'chk-far-mgc',
    category: 'Zoning & Site',
    title: 'FAR & Ground Coverage (MGC) Schedule',
    requirement:
      input.plotAreaSqM > 0 && input.abuttingRoadWidthM > 0
        ? `Verify achieved FAR and MGC for ${input.plotAreaSqM} m² plot on a ${input.abuttingRoadWidthM} m abutting road.`
        : 'Enter plot area and abutting road width to screen FAR and ground coverage ratios.',
    citation: 'Dhaka Imarat Nirman Bidhimala 2008 (Advisory screening)',
    basis: 'screening',
    status: farFail || mgcFail ? 'action_needed' : m && m.plotAreaSqM > 0 ? 'pass' : 'verify',
    measuredNote:
      m && m.plotAreaSqM > 0
        ? `Measured FAR ${m.achievedFar} (limit ${m.maxAllowedFar}) · MGC ${m.mgcPercent}% (limit ${m.maxAllowedMgcPercent}%)`
        : undefined,
  });

  items.push({
    id: 'chk-setbacks',
    category: 'Zoning & Site',
    title: 'Front, Rear & Side Mandatory Setbacks',
    requirement:
      'Confirm perimeter open setbacks satisfy road-width and plot-size minimums on the site layout sheet.',
    citation: 'Dhaka Imarat Nirman Bidhimala 2008 (Advisory screening)',
    basis: 'screening',
    status: setbackFail ? 'action_needed' : project?.siteContext?.declared ? 'pass' : 'verify',
    measuredNote: setbackFail ? setbackFail.description : undefined,
  });

  // 2. Architectural & Code
  const habViolation = audit?.violations.find(
    (v) => v.category === 'habitability_ventilation' && /sleep|bed|area|width/i.test(v.ruleName)
  );
  const ventViolation = audit?.violations.find(
    (v) => v.category === 'habitability_ventilation' && /window|daylight|vent/i.test(v.ruleName)
  );
  if (input.occupancyClass !== 'industrial_rmg') {
    items.push({
      id: 'chk-bedroom-size',
      category: 'Architectural & Code',
      title: 'Sleeping Room Minimum Area (9.5 m²) & Width (2.9 m)',
      requirement:
        'Every residential sleeping room must measure at least 9.5 m² net floor area with minimum width 2.9 m.',
      citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.2.2',
      basis: 'verified',
      status: habViolation?.status === 'FAIL' ? 'action_needed' : audit ? 'pass' : 'verify',
      measuredNote: habViolation ? `${habViolation.roomName}: ${habViolation.measuredValue} ${habViolation.unit}` : undefined,
    });

    items.push({
      id: 'chk-daylight',
      category: 'Architectural & Code',
      title: 'Habitable Room Daylight & Ventilation Openings (15%)',
      requirement:
        'Provide external window openings totaling at least 15% of net floor area (18% for kitchens).',
      citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.17.6 / Table 3.1.12',
      basis: 'verified',
      status: ventViolation ? 'action_needed' : audit ? 'pass' : 'verify',
    });
  }

  const dimViolation = findWarn('dimension_integrity');
  items.push({
    id: 'chk-dim-integrity',
    category: 'Architectural & Code',
    title: 'CAD Dimension Override Consistency',
    requirement:
      'Ensure typed dimension labels match actual drawn wall coordinates across every floor sheet.',
    citation: 'Drawing Consistency Check',
    basis: 'verified',
    status: dimViolation ? 'action_needed' : audit ? 'pass' : 'verify',
    measuredNote: dimViolation ? dimViolation.description : undefined,
  });

  // 3. Fire & Life Safety
  const travelFail = findFail('egress_travel');
  const passageFail = findFail('passage_width');
  const exitFail = findFail('exit_obstruction') || findFail('egress_capacity');
  const stairWarn = findWarn('stair_safety');

  items.push({
    id: 'chk-egress-doors',
    category: 'Fire & Life Safety',
    title: 'Dual Unobstructed Exits & Minimum 0.90 m Exit Width',
    requirement:
      'Maintain at least two remote unlocked exits per floor and unobstructed clear exit door width.',
    citation: 'BNBC Part 4, Ch. 3 (Means of Escape — Advisory screening)',
    basis: 'screening',
    status: exitFail ? 'action_needed' : audit ? 'pass' : 'verify',
    measuredNote: exitFail ? `${exitFail.roomName}: ${exitFail.ruleName}` : undefined,
  });

  items.push({
    id: 'chk-travel-passage',
    category: 'Fire & Life Safety',
    title: `Travel Distance (${input.sprinklered ? '<= 22.5 m Sprinklered' : '<= 16.0 m Cabin Limit'}) & >= 0.75 m Passages`,
    requirement:
      'Keep clear passages >= 0.75 m wide and walking travel paths within occupancy distance limits.',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.8.2',
    basis: 'verified',
    status: travelFail || passageFail ? 'action_needed' : audit ? 'pass' : 'verify',
    measuredNote:
      passageFail
        ? `${passageFail.roomName}: ${passageFail.measuredValue} ${passageFail.unit}`
        : travelFail
          ? `${travelFail.roomName}: ${travelFail.blocked ? 'No route' : `${travelFail.measuredValue} m`}`
          : undefined,
  });

  items.push({
    id: 'chk-stair-details',
    category: 'Fire & Life Safety',
    title: 'Staircase Headroom (>= 2.15 m), Handrail (>= 0.90 m) & 2R+T (610–648 mm)',
    requirement:
      'Annotate stair riser/tread schedule, minimum 2.15 m headroom, and >= 0.90 m handrail height on section drawings.',
    citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.5',
    basis: 'verified',
    status: stairWarn ? 'action_needed' : 'verify',
    measuredNote: stairWarn ? stairWarn.description : 'Confirm if not explicitly labeled in DXF stair notes.',
  });

  // 4. Authority NOCs & Filing
  if (isHighRise) {
    items.push({
      id: 'chk-highrise-noc',
      category: 'Authority NOCs & Filing',
      title: `High-Rise Special Clearances (${totalHeightM} m > 20 m threshold)`,
      requirement:
        'Buildings exceeding 20 m above road level trigger mandatory high-rise fire clearance (FSCD), fire lift / pressurized stair core, and Aviation / Power NOCs.',
      citation: 'BNBC 2012, Part 3, Ch. 1, Sec 1.2 & Part 4',
      basis: 'verified',
      status: 'action_needed',
    });
  }

  if (input.jurisdiction === 'dife_fscd' || input.occupancyClass === 'industrial_rmg') {
    items.push({
      id: 'chk-dife-fscd',
      category: 'Authority NOCs & Filing',
      title: 'DIFE Factory Layout & Fire Service License Package',
      requirement:
        'Include occupant load calculation per floor, emergency lighting schedule, fire hydrant/riser layout, and factory safety committee sign-off.',
      citation: 'Bangladesh Labour Rules & FSCD Filing Requirements',
      basis: 'procedural',
      status: 'verify',
    });
  }

  items.push({
    id: 'chk-prof-seals',
    category: 'Authority NOCs & Filing',
    title: `Signed Architectural, Structural & Soil Reports (${JURISDICTION_LABELS[input.jurisdiction].split(' ')[0]})`,
    requirement:
      'Attach licensed Architect (IAB), Structural Engineer (IEB), and geotechnical soil investigation certificates along with ownership deed / mutation.',
    citation: `${JURISDICTION_LABELS[input.jurisdiction]} Submittal Rules`,
    basis: 'procedural',
    status: 'verify',
  });

  return items;
}

export function buildDeterministicCorrectionPackage(params: {
  letterText: string;
  authorityName?: string;
  project?: BuildingProject | null;
  beforeAudit?: ComplianceAudit | null;
  afterAudit?: ComplianceAudit | null;
  deltas?: RemediationDelta[];
}): CorrectionPackage {
  const authority = params.authorityName?.trim() || 'Building Approval & Plan Scrutiny Desk';
  const rawLines = params.letterText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Group numbered items (1., 2., - , Item 1:) or fall back to non-header lines
  const extractedItems: string[] = [];
  for (const line of rawLines) {
    if (/^(ref|date|subject|plan scrutiny|fire safety|sub:)/i.test(line) && line.length < 70) continue;
    if (/^\d+[.)]\s+/.test(line) || /^[-*]\s+/.test(line)) {
      extractedItems.push(line.replace(/^(\d+[.)]|[-*])\s+/, '').trim());
    } else if (extractedItems.length > 0 && line.length > 20 && !/^[A-Z0-9\s/-]{4,}$/.test(line)) {
      extractedItems[extractedItems.length - 1] += ' ' + line;
    } else if (line.length > 28) {
      extractedItems.push(line);
    }
  }

  const normalizedLines = extractedItems.length > 0 ? extractedItems.slice(0, 12) : [params.letterText.trim()].filter(Boolean);
  const violations = params.beforeAudit?.violations || [];
  const deltas = params.deltas || [];

  const items: CorrectionResponseItem[] = normalizedLines.map((text, idx) => {
    const lower = text.toLowerCase();
    let category: CorrectionResponseItem['category'] = 'Documentation';
    let citedClause = 'Authority Filing Requirement';
    let cadEvidence = params.project
      ? `No matching automated CAD geometry flag found on ${params.project.name}; verify on drawing sheets.`
      : 'No CAD DXF file loaded yet — upload your DXF to cross-check exact measurements.';
    let resolutionStatus: CorrectionResponseItem['resolutionStatus'] = 'procedural_document';
    let recommendedResponse =
      'Prepare and attach the requested signed engineering schedule or supporting statutory document in the resubmission binder.';

    const matchedDelta = deltas.find((d) => {
      const ds = d.summary.toLowerCase();
      if (/lock|obstruct|door/.test(lower) && /unlock|door|exit/.test(ds)) return true;
      if (/corridor|passage|pinch|width|bottleneck/.test(lower) && /corridor|width|widen|pinch/.test(ds)) return true;
      return false;
    });

    const matchedViolation = violations.find((v) => {
      if (/bedroom|sleeping|9\.5|2\.9|habit|window|daylight|ventilation/.test(lower) && v.category === 'habitability_ventilation') return true;
      if (/corridor|passage|width|pinch|bottleneck/.test(lower) && v.category === 'passage_width') return true;
      if (/lock|obstruct|exit/.test(lower) && (v.category === 'exit_obstruction' || v.category === 'egress_capacity')) return true;
      if (/travel|distance|16\s?m/.test(lower) && v.category === 'egress_travel') return true;
      if (/stair|headroom|handrail|riser|tread/.test(lower) && v.category === 'stair_safety') return true;
      if (/far|mgc|coverage|setback|zoning|road/.test(lower) && v.category === 'zoning_far') return true;
      if (/dimension|stale|override/.test(lower) && v.category === 'dimension_integrity') return true;
      return false;
    });

    if (/far|mgc|coverage|setback|road/.test(lower)) {
      category = 'Zoning & Setback';
      citedClause = 'Dhaka Imarat Nirman Bidhimala 2008 (Advisory)';
      if (params.beforeAudit?.metrics && params.beforeAudit.metrics.plotAreaSqM > 0) {
        const m = params.beforeAudit.metrics;
        cadEvidence = `Measured from CAD + site inputs: Plot ${m.plotAreaSqM} m², Footprint ${m.groundFootprintSqM} m², MGC ${m.mgcPercent}% (limit ${m.maxAllowedMgcPercent}%), FAR ${m.achievedFar} (limit ${m.maxAllowedFar}).`;
        resolutionStatus = matchedViolation ? 'needs_designer_action' : 'linked_to_cad_finding';
        recommendedResponse = `Submit updated FAR/MGC calculation table confirming MGC ${m.mgcPercent}% and FAR ${m.achievedFar} comply with plot schedule.`;
      } else {
        resolutionStatus = 'needs_designer_action';
        recommendedResponse = 'Supply verified plot area, road width, and perimeter setbacks in Step 02 Review and attach signed area statement.';
      }
    } else if (/bedroom|sleeping|9\.5|2\.9|window|daylight|ventilation/.test(lower)) {
      category = 'Habitability & Space';
      citedClause = /window|daylight|ventilation/.test(lower)
        ? 'BNBC 2012, Part 3, Ch. 1, Sec 1.17.6'
        : 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.2.2';
      if (matchedViolation) {
        cadEvidence = `Flagged in ${matchedViolation.roomName}: ${matchedViolation.measuredValue} ${matchedViolation.unit} vs. ${matchedViolation.comparator} ${matchedViolation.limitValue} ${matchedViolation.unit}.`;
        resolutionStatus = 'linked_to_cad_finding';
        recommendedResponse = `Revise ${matchedViolation.roomName} partition or window schedule on the CAD sheet so it satisfies ${citedClause}.`;
      }
    } else if (/stair|headroom|handrail|riser|tread/.test(lower)) {
      category = 'Stair Safety';
      citedClause = 'BNBC 2012, Part 3, Ch. 1, Sec 1.13.5';
      if (matchedViolation) {
        cadEvidence = `${matchedViolation.roomName}: ${matchedViolation.description}`;
        resolutionStatus = 'linked_to_cad_finding';
        recommendedResponse = `Update stair section sheet for ${matchedViolation.roomName} to restore compliance with ${citedClause}.`;
      }
    } else if (/lock|exit|corridor|passage|pinch|bottleneck|travel|distance|dimension/.test(lower)) {
      category = 'Fire & Egress';
      const corpusHit = REGULATORY_CORPUS.find((c) =>
        c.keywords.some((k) => lower.includes(k.toLowerCase()))
      );
      citedClause = matchedViolation?.citation || corpusHit?.clause || 'BNBC Part 3 / Part 4 Egress Rules';

      if (matchedDelta) {
        cadEvidence = `Verified in DrawFix Ai remediated copy: ${matchedDelta.summary}`;
        resolutionStatus = 'resolved_in_copy';
        recommendedResponse = `Apply the verified geometric fix (${matchedDelta.summary}) to the master CAD file and reference the updated sheet in resubmittal.`;
      } else if (matchedViolation) {
        cadEvidence = `Measured on CAD (${matchedViolation.floorLabel || 'GF'} — ${matchedViolation.roomName}): ${
          matchedViolation.blocked ? 'No open route' : `${matchedViolation.measuredValue} ${matchedViolation.unit}`
        } vs. limit ${matchedViolation.comparator} ${matchedViolation.limitValue} ${matchedViolation.unit}.`;
        resolutionStatus = 'linked_to_cad_finding';
        recommendedResponse = `Correct ${matchedViolation.roomName} geometry on ${matchedViolation.floorLabel || 'GF'} and re-run pathfinding verification before resubmitting.`;
      }
    }

    return {
      itemNumber: String(idx + 1).padStart(2, '0'),
      objectionSummary: text,
      category,
      resolutionStatus,
      citedClause,
      cadEvidence,
      recommendedResponse,
    };
  });

  const projTitle = params.project?.name || 'Submitted Building Project';
  const letterLines = [
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `To: ${authority}`,
    `Subject: Point-by-Point Resubmission Response — ${projTitle}`,
    '',
    'Dear Plan Scrutiny Team,',
    '',
    `Please find below our itemized technical response and drawing revisions addressing each observation raised for ${projTitle}:`,
    '',
    ...items.map(
      (it) =>
        `${it.itemNumber}. [${it.category} | ${it.citedClause}]\n   Objection: ${it.objectionSummary}\n   CAD Verification: ${it.cadEvidence}\n   Action / Response: ${it.recommendedResponse}`
    ),
    '',
    params.beforeAudit && params.afterAudit
      ? `Pre-Submission Verification Summary (DrawFix Ai): Original geometry showed ${params.beforeAudit.failCount} critical findings and ${params.beforeAudit.warnCount} warnings; after applying ${deltas.length} geometric corrections on a clean copy, critical findings drop to ${params.afterAudit.failCount}.`
      : 'All cited dimensions and compliance schedules are attached for formal review.',
    '',
    'Respectfully,',
    '[Architect / Applicant Name & Registration]',
  ];

  return {
    authorityName: authority,
    projectSummary: projTitle,
    source: 'deterministic',
    items,
    responseLetter: letterLines.join('\n'),
  };
}

export async function requestCorrectionInterpretation(params: {
  letterText: string;
  authorityName?: string;
  project?: BuildingProject | null;
  beforeAudit?: ComplianceAudit | null;
  afterAudit?: ComplianceAudit | null;
  deltas?: RemediationDelta[];
}): Promise<CorrectionPackage> {
  const fallback = buildDeterministicCorrectionPackage(params);
  try {
    const res = await fetch('/api/ai/interpret-corrections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letterText: params.letterText,
        authorityName: params.authorityName || fallback.authorityName,
        projectName: params.project?.name || null,
        occupancyClass: params.project?.occupancyClass || 'residential',
        floorCount: params.project?.floors.length || 0,
        metrics: params.beforeAudit?.metrics || null,
        beforeSummary: params.beforeAudit
          ? {
              failCount: params.beforeAudit.failCount,
              warnCount: params.beforeAudit.warnCount,
              worstEscapeSec: params.beforeAudit.worstEscapeSec,
              violations: params.beforeAudit.violations.slice(0, 15).map((v) => ({
                floor: v.floorLabel || 'GF',
                roomName: v.roomName,
                ruleName: v.ruleName,
                status: v.status,
                measured: v.blocked ? 'NO ROUTE' : `${v.measuredValue} ${v.unit}`,
                limit: `${v.comparator} ${v.limitValue} ${v.unit}`,
                citation: v.citation,
              })),
            }
          : null,
        afterSummary: params.afterAudit
          ? {
              failCount: params.afterAudit.failCount,
              warnCount: params.afterAudit.warnCount,
              deltas: (params.deltas || []).map((d) => d.summary),
            }
          : null,
        fallbackItems: fallback.items,
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    if (data && Array.isArray(data.items) && data.items.length > 0 && data.responseLetter) {
      return {
        authorityName: data.authorityName || fallback.authorityName,
        projectSummary: data.projectSummary || fallback.projectSummary,
        source: data.source || 'gemini-rag',
        items: data.items,
        responseLetter: data.responseLetter,
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
