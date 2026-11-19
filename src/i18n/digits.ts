const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Latin digits to Bangla digits. Only the glyphs change, never the value. */
export function toBnDigits(value: number | string, decimals?: number): string {
  const str = typeof value === 'number' && decimals !== undefined ? value.toFixed(decimals) : String(value);
  return str.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

/** Bangla digits to Latin digits. */
export function fromBnDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}
