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
  });
  await waitUp();
}, 30_000);

afterAll(() => {
  child?.kill();
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
