/**
 * Where the browser (or a measurement script in Node) finds the DrawFix server.
 * In the browser this is the same origin; scripts call setApiBase('http://localhost:3000').
 */
let base = '';

export function setApiBase(url: string) {
  base = url.replace(/\/$/, '');
}

export async function postJson<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
