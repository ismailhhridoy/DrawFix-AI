// Access rules for /docs. Pure functions only, so the server and the tests share one implementation.
//
// Modes:
//   off        closed to everyone (default)
//   public     open to everyone
//   scheduled  open only between `from` and `to` (ISO 8601)
//   restricted open only to viewers who send the view key (fails closed if no key is configured)

export type DocsMode = 'off' | 'public' | 'scheduled' | 'restricted';

export interface DocsConfig {
  mode: DocsMode;
  from: string | null;
  to: string | null;
  updatedAt: string | null;
}

export type DocsAccess =
  | { state: 'open' }
  | { state: 'locked' }
  | { state: 'closed'; reason: 'off' | 'unscheduled' | 'not-yet' | 'ended'; opensAt: string | null };

// Public by default. An admin can still close it or schedule it with DOCS_ADMIN_TOKEN.
export const DEFAULT_DOCS_CONFIG: DocsConfig = { mode: 'public', from: null, to: null, updatedAt: null };

const MODES: DocsMode[] = ['off', 'public', 'scheduled', 'restricted'];

/** Constant-time string comparison, so the view key cannot be guessed by timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function resolveDocsAccess(
  config: DocsConfig,
  now: Date,
  providedKey: string | undefined,
  viewKey: string | undefined,
): DocsAccess {
  switch (config.mode) {
    case 'public':
      return { state: 'open' };
    case 'off':
      return { state: 'closed', reason: 'off', opensAt: null };
    case 'restricted':
      if (!viewKey) return { state: 'closed', reason: 'off', opensAt: null };
      return providedKey && safeEqual(providedKey, viewKey) ? { state: 'open' } : { state: 'locked' };
    case 'scheduled': {
      if (!config.from || !config.to) return { state: 'closed', reason: 'unscheduled', opensAt: null };
      const from = Date.parse(config.from);
      const to = Date.parse(config.to);
      const t = now.getTime();
      if (t < from) return { state: 'closed', reason: 'not-yet', opensAt: config.from };
      if (t > to) return { state: 'closed', reason: 'ended', opensAt: null };
      return { state: 'open' };
    }
  }
}

export type ConfigCheck = { ok: true; value: DocsConfig } | { ok: false; error: string };

/** Validates an admin update. Unknown fields are dropped; dates must parse and be ordered. */
export function validateDocsConfig(input: unknown, nowIso: string): ConfigCheck {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Body must be a JSON object.' };
  const body = input as Record<string, unknown>;
  const mode = body.mode;
  if (typeof mode !== 'string' || !MODES.includes(mode as DocsMode)) {
    return { ok: false, error: `mode must be one of: ${MODES.join(', ')}.` };
  }
  const parseDate = (v: unknown, label: string): { ok: true; value: string | null } | { ok: false; error: string } => {
    if (v === null || v === undefined || v === '') return { ok: true, value: null };
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return { ok: false, error: `${label} must be an ISO 8601 date.` };
    return { ok: true, value: new Date(v).toISOString() };
  };
  const from = parseDate(body.from, 'from');
  if (!from.ok) return from;
  const to = parseDate(body.to, 'to');
  if (!to.ok) return to;
  if (mode === 'scheduled') {
    if (!from.value || !to.value) return { ok: false, error: 'scheduled mode needs both from and to.' };
    if (Date.parse(from.value) >= Date.parse(to.value)) return { ok: false, error: 'from must be before to.' };
  }
  return { ok: true, value: { mode: mode as DocsMode, from: from.value, to: to.value, updatedAt: nowIso } };
}
