import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBenchmarkCases, loadSampleProject } from '../src/engine/fixBenchmark';
import { runBuildingAudit } from '../src/engine/ruleEngine';
import { fixSpecToEdits, normalizeEdit, verifyCandidate, isProblem, applyLayoutEdits } from '../src/engine/layoutEdits';
import { proposeAndVerify } from '../src/engine/aiLayoutProposer';
import { applyApprovedChanges, runFixAgent } from '../src/engine/fixAgent';

function stubServer(handler: (path: string, body: any) => unknown) {
  vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
    const out = handler(String(url), init?.body ? JSON.parse(init.body) : {});
    return { ok: true, json: async () => out } as Response;
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('layout edits: validation', () => {
  const p = loadSampleProject('mirpur-rmg');
  it('refuses unknown ids, out-of-range values and exits in inner walls', () => {
    expect(normalizeEdit({ kind: 'unlock_door', floorIndex: 0, doorId: 'nope' }, p).error).toMatch(/not on floor/);
    expect(normalizeEdit({ kind: 'widen_door', floorIndex: 0, doorId: 'f0-door-1', widthM: 9 }, p).error).toMatch(/range/);
    const inner = p.floors[0].walls.find((w) => !w.isExterior)!;
    expect(normalizeEdit({ kind: 'add_exit_door', floorIndex: 0, wallId: inner.id, along: 0.5, widthM: 1.2 }, p).error).toMatch(/outer wall/);
    expect(normalizeEdit({ kind: 'teleport', floorIndex: 0 }, p).error).toMatch(/unknown kind/);
    expect(normalizeEdit({ kind: 'add_stair', x: 5, y: 5, widthM: 1, depthM: 3 }, p).error).toMatch(/stair sides/);
  });
  it('does not change the input project', () => {
    const before = JSON.stringify(p);
    applyLayoutEdits(p, [{ kind: 'unlock_door', floorIndex: 0, doorId: 'f0-door-2' }]);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('verifier', () => {
  it('accepts every hand-written fix on its own (set A)', () => {
    const cases = buildBenchmarkCases(['A']);
    expect(cases.length).toBe(26);
    const passed = cases.filter((c) => verifyCandidate(c.project, c.audit, fixSpecToEdits(c.targets[0], c.project)!, c.targets, 'rule').accepted);
    expect(passed.length).toBe(26);
  }, 60_000);

  it('a new exit door in the outer wall fixes a deleted main exit; a door in the wrong place is rejected', () => {
    const c = buildBenchmarkCases(['C']).find((x) => x.id === 'C:mirpur-rmg:minus-EXIT_MAIN_1200')!;
    const good = verifyCandidate(c.project, c.audit, [{ kind: 'add_exit_door', floorIndex: 0, wallId: 'f0-wall-2', along: 0.1, widthM: 1.2 }], c.targets);
    expect(good.accepted).toBe(true);
    expect(good.after!.fail).toBe(0);
    const bad = verifyCandidate(c.project, c.audit, [{ kind: 'add_exit_door', floorIndex: 0, wallId: 'f0-wall-5', along: 0.9, widthM: 1.2 }], c.targets);
    expect(bad.accepted).toBe(false);
    expect(bad.stillFailing.length).toBeGreaterThan(0);
  }, 30_000);

  it('a new stair core needs clear floor space', () => {
    const p = loadSampleProject('mirpur-rmg');
    const a = runBuildingAudit(p);
    const r = verifyCandidate(p, a, [{ kind: 'add_stair', x: 13, y: 8, widthM: 3, depthM: 3, label: 'NEW' }], a.violations.filter(isProblem).slice(0, 1));
    expect(r.accepted).toBe(false);
    expect(r.applyError).toMatch(/cut wall|too close|outside/);
  });
});

describe('Gemini proposals are re-measured (stubbed Gemini)', () => {
  it('drops invalid edits, strips numbers from the reason, ranks passing candidates first', async () => {
    const c = buildBenchmarkCases(['C']).find((x) => x.id === 'C:mirpur-rmg:minus-EXIT_MAIN_1200')!;
    stubServer(() => ({
      source: 'gemini',
      candidates: [
        { targetIds: c.targets.map((t) => t.id), edits: [{ kind: 'add_exit_door', floorIndex: 0, wallId: 'f0-wall-99', along: 0.5, widthM: 1.2 }], rationaleEn: 'Reopen the south side.' },
        { targetIds: c.targets.map((t) => t.id), edits: [{ kind: 'add_exit_door', floorIndex: 0, wallId: 'f0-wall-2', along: 0.1, widthM: 1.2 }], rationaleEn: 'This is 3.2 m closer.' },
      ],
    }));
    const res = await proposeAndVerify(c.project, c.audit, c.targets, { rounds: 1 });
    expect(res.source).toBe('gemini');
    expect(res.all[0].verdict.accepted).toBe(true);
    expect(res.all[0].rationaleEn).toBe(''); // had a number Gemini made up
    expect(res.all[1].verdict.accepted).toBe(false);
    expect(res.all[1].verdict.reason).toMatch(/Refused before the check/);
  }, 30_000);
});

describe('fix agent', () => {
  it('without Gemini runs the fixed policy and the approval gate re-checks', async () => {
    stubServer(() => ({ source: 'none' }));
    const p = loadSampleProject('dhanmondi-res');
    const run = await runFixAgent(p);
    expect(run.policy).toBe('rules');
    expect(run.staged.length).toBeGreaterThan(0);
    // Nothing counts until approved.
    const none = applyApprovedChanges(p, run.staged, []);
    expect(none.audit.failCount).toBe(run.baseAudit.failCount);
    const all = applyApprovedChanges(p, run.staged, run.staged.map((s) => s.tryId));
    expect(all.skipped).toHaveLength(0);
    expect(all.audit.failCount).toBe(run.stagedAudit.failCount);
    expect(all.audit.failCount).toBeLessThan(run.baseAudit.failCount);
  }, 60_000);

  it('with a scripted Gemini: refused edits and rejected tries cannot be staged', async () => {
    const c = buildBenchmarkCases(['C']).find((x) => x.id === 'C:mirpur-rmg:minus-EXIT_MAIN_1200')!;
    const ids = c.targets.map((t) => t.id);
    const script = [
      { thought: 'Look first.', tool: 'run_audit' },
      { thought: 'Try a wall that does not exist.', tool: 'try_edits', targetIds: ids, edits: [{ kind: 'add_exit_door', floorIndex: 0, wallId: 'nope', along: 0.5 }] },
      { thought: 'Wrong side.', tool: 'try_edits', targetIds: ids, edits: [{ kind: 'add_exit_door', floorIndex: 0, wallId: 'f0-wall-5', along: 0.9, widthM: 1.2 }] },
      { thought: 'Stage it anyway.', tool: 'stage', tryId: 'try-2' },
      { thought: 'Near the old exit.', tool: 'try_edits', targetIds: ids, edits: [{ kind: 'add_exit_door', floorIndex: 0, wallId: 'f0-wall-2', along: 0.1, widthM: 1.2 }] },
      { thought: 'Keep it.', tool: 'stage', tryId: 'try-3' },
      { thought: 'Done, 99 problems left.', tool: 'finish', summary: 'One exit added.' },
    ];
    let i = 0;
    stubServer((path) => (path.endsWith('/api/ai/agent-step') ? { source: 'gemini', step: script[i++] } : {}));
    const run = await runFixAgent(c.project);
    expect(run.policy).toBe('gemini');
    expect(run.steps.map((s) => s.ok)).toEqual([true, false, false, false, true, true, true]);
    expect(run.staged.map((s) => s.tryId)).toEqual(['try-3']);
    expect(run.stagedAudit.failCount).toBe(0);
    expect(run.steps[6].thought).toMatch(/withheld/); // "99" was never reported by a tool
  }, 60_000);
});
