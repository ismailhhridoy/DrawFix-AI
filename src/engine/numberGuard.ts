import { fromBnDigits } from '../i18n/digits';

/**
 * Number guard for AI-written text (English or Bangla).
 *
 * The design rule is that Gemini never produces a measurement, limit or clause number of its own.
 * Prompts ask for that; this guard enforces it. Every number in the AI text (Bangla digits are
 * converted first) must appear in the data the text was written from, or the text is rejected
 * and the fixed template is shown instead.
 *
 * Limits: numbers written as words ("দুই", "two") are not caught.
 */

type Source = string | number | null | undefined;

// Dotted tokens like 1.13.8.2 are clause numbers and must match exactly; plain numbers may be rounded.
const TOKEN_RE = /\d+(?:\.\d+)*/g;

export function extractNumberTokens(text: string): string[] {
  return fromBnDigits(text).replace(/(\d),(\d{3})/g, '$1$2').match(TOKEN_RE) || [];
}

function decimals(tok: string): number {
  const i = tok.indexOf('.');
  return i < 0 ? 0 : tok.length - i - 1;
}

export interface GuardResult {
  ok: boolean;
  offending: string[];
}

export function checkNumbers(text: string, sources: Source[]): GuardResult {
  const allowedValues: number[] = [];
  const allowedTokens = new Set<string>();
  for (const src of sources) {
    if (src === null || src === undefined) continue;
    if (typeof src === 'number') {
      if (Number.isFinite(src)) allowedValues.push(src);
      continue;
    }
    for (const tok of extractNumberTokens(src)) {
      allowedTokens.add(tok);
      if ((tok.match(/\./g) || []).length <= 1) allowedValues.push(Number(tok));
    }
  }
  const offending: string[] = [];
  for (const tok of extractNumberTokens(text)) {
    if (allowedTokens.has(tok)) continue;
    const dots = (tok.match(/\./g) || []).length;
    if (dots > 1) {
      offending.push(tok);
      continue;
    }
    const x = Number(tok);
    // A number written with d decimals may be the source value rounded to d decimals.
    const tol = 0.5 * Math.pow(10, -decimals(tok)) + 1e-9;
    if (!allowedValues.some((a) => Math.abs(a - x) <= tol)) offending.push(tok);
  }
  return { ok: offending.length === 0, offending };
}

/** Returns the AI text when every number in it is backed by the sources, otherwise the fallback. */
export function guardText(aiText: string | undefined | null, fallback: string, sources: Source[]): string {
  if (!aiText) return fallback;
  return checkNumbers(aiText, sources).ok ? aiText : fallback;
}
