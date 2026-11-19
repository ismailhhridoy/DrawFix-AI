import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 8190;
let child: ChildProcess;

async function waitUp(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

beforeAll(async () => {
  child = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: String(PORT), GEMINI_API_KEY: '', NODE_ENV: 'development' },
    stdio: 'ignore',
    // Own process group, so afterAll can stop npx *and* the tsx/node children it starts.
    detached: true,
  });
  await waitUp();
}, 30_000);

afterAll(() => {
  // Killing only npx left the real server running on the port; a later run then tested stale code.
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill();
    }
  }
});

describe('rate limiter behind a proxy', () => {
  it('limits per client address (X-Forwarded-For), not per proxy', async () => {
    const codes: number[] = [];
    for (let i = 1; i <= 45; i++) {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
        headers: { 'X-Forwarded-For': `10.1.0.${i}` },
      });
      codes.push(r.status);
    }
    expect(codes.filter((c) => c === 429)).toHaveLength(0);
  }, 30_000);

  it('still blocks one client that exceeds 40 requests a minute', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 45; i++) {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
        headers: { 'X-Forwarded-For': '10.2.0.1' },
      });
      codes.push(r.status);
    }
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  }, 30_000);
});

describe('question box on the server without Gemini (Bangla)', () => {
  const ask = async (question: string, ip: string) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({ question }),
    });
    return r.json() as Promise<{ citations: { id: string }[]; answerEn: string; answerBn: string }>;
  };

  it('answers a Bangla question the same way every time and in Bangla', async () => {
    const q = 'বের হওয়ার পথের সর্বোচ্চ দূরত্ব কত?';
    const a = await ask(q, '10.3.0.1');
    const b = await ask(q, '10.3.0.1');
    expect(a.citations.length).toBeGreaterThan(0);
    expect(a.citations.map((c) => c.id)).toEqual(b.citations.map((c) => c.id));
    expect(a.citations.map((c) => c.id)).toContain('bnbc-2012-1.13.8.2-cabins');
    expect(/[ঀ-৿]/.test(a.answerBn)).toBe(true);
  }, 15_000);

  it('says no note matched instead of returning an unrelated one', async () => {
    const a = await ask('qwxz zzyv', '10.3.0.2');
    expect(a.citations).toEqual([]);
    expect(a.answerEn).toMatch(/no indexed reference note/i);
  }, 15_000);
});
