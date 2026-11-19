import type { MsgKey } from './en';

/**
 * Bangla interface strings. Typed as a full record so a missing key fails the type-check.
 * Machine-drafted: needs review by a native Bangla speaker with building-code context.
 */
export const bnStrings: Record<MsgKey, string> = {
  'lang.both': 'EN + বাংলা',
  'lang.switchLabel': 'প্রদর্শনের ভাষা',
  'lang.noBangla': 'বাংলা লেখা এখনও নেই',
};
