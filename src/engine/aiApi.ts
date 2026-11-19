/**
 * Where the browser (or a measurement script in Node) finds the DrawFix server.
 * In the browser this is the same origin; scripts call setApiBase('http://localhost:3000').
 */
let base = '';
let minIntervalMs = 0;
let lastCall = 0;

export function setApiBase(url: string) {
  base = url.replace(/\/$/, '');
}

/** Scripts only: space out calls (the public server allows 40 requests a minute per address). */
export function setMinIntervalMs(ms: number) {
  minIntervalMs = Math.max(0, ms);
}

async function pace() {
  if (!minIntervalMs) return;
  const wait = lastCall + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export async function postJson<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T | null> {
  const ctl = new AbortController();
  await pace();
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}

/** Sends base64 image/PDF data to the AI tracer. Throws with a plain message on failure. */
export async function requestPlanReadingBase64(dataBase64: string, mimeType: string): Promise<import('./visionPlan').VisionReading> {
  await pace();
  const res = await fetch(`${base}/api/ai/read-plan-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataBase64, mimeType }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.source !== 'gemini' || !body.reading) {
    throw new Error(body?.error || (body?.source === 'none' ? 'Reading plan images needs Gemini, which is off on this server.' : 'The AI model could not read this plan.'));
  }
  return body.reading;
}

/** Browser helper: sends a plan image or PDF file to the AI tracer. */
export async function requestPlanImageReading(file: File) {
  const mimeType = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(mimeType)) {
    throw new Error('Use a PNG, JPEG, WebP or PDF file.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('The file is over 10 MB. Export a smaller image of one floor.');
  return requestPlanReadingBase64(await fileToBase64(file), mimeType);
}
