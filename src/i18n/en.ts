/** English interface strings. Keys are grouped by screen. */
export const en = {
  'lang.both': 'EN + বাংলা',
  'lang.switchLabel': 'Display language',
  'lang.noBangla': 'no Bangla text yet',
} as const;

export type MsgKey = keyof typeof en;
