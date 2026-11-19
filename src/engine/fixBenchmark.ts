/**
 * Benchmark for proposed layout fixes, built from the four synthetic demo buildings.
 *
 * Set A: each finding that has a hand-written fix (the fixed rules' own proposals).
 * Set B: each finding with no hand-written fix (travel distance, exit count...).
 * Set C: "a door was deleted" — start from the fully fixed demo building, remove one ground-floor
 *        exit door (the opening is walled up), and fix everything that then fails.
 *
 * Both proposers (hand-written rules and Gemini) are judged by the same code: `verifyCandidate`.
 */
import type { BuildingProject, ComplianceAudit, Violation } from '../types/plan';
import { SAMPLE_BUILDINGS } from './sampleDxf';
import { DEFAULT_CONVENTIONS, parseDxfString } from './dxfParser';
import { applyBuildingRemediationFixes, runBuildingAudit } from './ruleEngine';
import { closeGapAt, fixSpecToEdits, isProblem, verifyCandidate, isOuterWall, type LayoutEdit } from './layoutEdits';

export function loadSampleProject(id: string): BuildingProject {
  const s = SAMPLE_BUILDINGS.find((b) => b.id === id);
  if (!s) throw new Error(`unknown sample ${id}`);
  return {
    id: s.id,
    name: s.name,
    subtitle: s.subtitle,
    occupancyClass: s.occupancyClass,
    storyHeightM: s.storyHeightM,
    siteContext: { ...s.siteContext },
    floors: s.floors.map((fl) =>
      parseDxfString(fl.dxfContent, {
        id: `${s.id}-f${fl.floorIndex}`,
        name: s.name,
        subtitle: s.subtitle,
        fileName: fl.fileName,
        occupancyClass: s.occupancyClass,
        conventions: DEFAULT_CONVENTIONS,
        floorIndex: fl.floorIndex,
        floorLabel: fl.floorLabel,
        floorName: fl.floorName,
      })
    ),
  };
}

export interface BenchmarkCase {
  id: string;
  set: 'A' | 'B' | 'C';
  buildingId: string;
  project: BuildingProject;
  audit: ComplianceAudit;
  targets: Violation[];
  /** True when the fixed rules have a fix for every target. */
  handWrittenAvailable: boolean;
}

export function buildBenchmarkCases(sets: ('A' | 'B' | 'C')[] = ['A', 'B', 'C']): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  for (const s of SAMPLE_BUILDINGS) {
    const project = loadSampleProject(s.id);
    const audit = runBuildingAudit(project);
    for (const v of audit.violations.filter(isProblem)) {
      const hasFix = Boolean(fixSpecToEdits(v, project));
      const set = hasFix ? 'A' : 'B';
      if (!sets.includes(set)) continue;
      cases.push({ id: `${set}:${s.id}:${v.id}`, set, buildingId: s.id, project, audit, targets: [v], handWrittenAvailable: hasFix });
    }
    if (!sets.includes('C')) continue;
    const { fixedProject } = applyBuildingRemediationFixes(project, audit);
    const exits = fixedProject.floors[0].doors.filter((d) => d.isExit);
    for (const door of exits) {
      const variant: BuildingProject = JSON.parse(JSON.stringify(fixedProject));
      const gf = variant.floors[0];
      if (!closeGapAt(gf, door.position)) continue;
      gf.doors = gf.doors.filter((d) => d.id !== door.id);
      const vAudit = runBuildingAudit(variant);
      const targets = vAudit.violations.filter(isProblem);
      if (targets.length === 0) continue;
      cases.push({
        id: `C:${s.id}:minus-${door.blockName}`,
        set: 'C',
        buildingId: s.id,
        project: variant,
        audit: vAudit,
        targets,
        handWrittenAvailable: targets.every((t) => Boolean(fixSpecToEdits(t, variant))),
      });
    }
  }
  return cases;
}

/**
 * Non-AI baseline: brute-force search over a fixed candidate list, judged by the same verifier.
 * Order: the hand-written fixes, unlocking any locked exit, then a 1.2 m exit door at five
 * positions on every outer ground-floor wall. Returns the first candidate that passes.
 */
export function searchBaseline(c: BenchmarkCase, maxTries = 200): { passed: boolean; tries: number; edits: LayoutEdit[] | null } {
  const cands: LayoutEdit[][] = [];
  const hw = c.targets.map((t) => fixSpecToEdits(t, c.project));
  if (hw.every(Boolean)) cands.push(hw.flat() as LayoutEdit[]);
  c.project.floors.forEach((f, fi) =>
    f.doors.filter((d) => d.isLocked).forEach((d) => cands.push([{ kind: 'unlock_door', floorIndex: fi, doorId: d.id }]))
  );
  for (const w of c.project.floors[0].walls.filter((x) => isOuterWall(x, c.project.floors[0]))) {
    for (const along of [0.1, 0.3, 0.5, 0.7, 0.9]) cands.push([{ kind: 'add_exit_door', floorIndex: 0, wallId: w.id, along, widthM: 1.2 }]);
  }
  let tries = 0;
  for (const edits of cands.slice(0, maxTries)) {
    tries++;
    if (verifyCandidate(c.project, c.audit, edits, c.targets, 'rule').accepted) return { passed: true, tries, edits };
  }
  return { passed: false, tries, edits: null };
}
