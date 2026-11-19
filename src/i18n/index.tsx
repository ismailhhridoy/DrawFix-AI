import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type MsgKey } from './en';
import { bnStrings } from './bn';
import { toBnDigits } from './digits';

export { toBnDigits, fromBnDigits } from './digits';

/**
 * Display language.
 * - 'en': English interface, English findings.
 * - 'bn': Bangla interface, Bangla findings (English shown only where no Bangla exists).
 * - 'both': English interface, every finding shown in English and Bangla.
 * Numbers never change between languages: only digits are rewritten.
 */
export type Lang = 'en' | 'bn' | 'both';

const STORAGE_KEY = 'drawfix.lang';
export function readStoredLang(): Lang {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'bn' || v === 'both') return v;
  } catch {
    // storage blocked: fall through to default
  }
  return 'en';
}

function storeLang(lang: Lang) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore: the choice just won't be remembered
  }
}

type Vars = Record<string, string | number>;

/** Pure translator, usable outside React (PDF builders, tests). */
export function translate(uiLang: 'en' | 'bn', key: MsgKey, vars?: Vars): string {
  const table = uiLang === 'bn' ? bnStrings : en;
  let s: string = table[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      const shown = uiLang === 'bn' && typeof v === 'number' ? toBnDigits(v) : String(v);
      s = s.split(`{${k}}`).join(shown);
    }
  }
  return s;
}

export interface LangApi {
  lang: Lang;
  /** Language of interface chrome: Bangla only in 'bn' mode. */
  uiLang: 'en' | 'bn';
  setLang: (l: Lang) => void;
  t: (key: MsgKey, vars?: Vars) => string;
  /** Format an engine number for the interface language (digits only). */
  num: (value: number | string, decimals?: number) => string;
  showEn: boolean;
  showBn: boolean;
}

function makeApi(lang: Lang, setLang: (l: Lang) => void): LangApi {
  const uiLang = lang === 'bn' ? 'bn' : 'en';
  return {
    lang,
    uiLang,
    setLang,
    t: (key, vars) => translate(uiLang, key, vars),
    num: (value, decimals) =>
      uiLang === 'bn'
        ? toBnDigits(value, decimals)
        : typeof value === 'number' && decimals !== undefined
          ? value.toFixed(decimals)
          : String(value),
    showEn: lang !== 'bn',
    showBn: lang !== 'en',
  };
}

const LangContext = createContext<LangApi>(makeApi('en', () => {}));

export function LangProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? readStoredLang());
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storeLang(l);
  }, []);
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
    }
  }, [lang]);
  const api = useMemo(() => makeApi(lang, setLang), [lang, setLang]);
  return <LangContext.Provider value={api}>{children}</LangContext.Provider>;
}

export function useLang(): LangApi {
  return useContext(LangContext);
}

/**
 * Shows a piece of content in the chosen language(s).
 * In Bangla mode, falls back to English when no Bangla text exists, and says so.
 */
export function Bi({
  en: enText,
  bn: bnText,
  className,
  bnClassName,
  as: Tag = 'p',
}: {
  en: ReactNode;
  bn?: ReactNode;
  className?: string;
  bnClassName?: string;
  as?: 'p' | 'div' | 'span';
}) {
  const { showEn, showBn, lang, t } = useLang();
  const hasBn = bnText !== undefined && bnText !== null && bnText !== '';
  if (lang === 'bn' && !hasBn) {
    return (
      <Tag className={className} lang="en">
        {enText}
        <span className="ml-1 text-[10px] text-slate-400">({t('lang.noBangla')})</span>
      </Tag>
    );
  }
  return (
    <>
      {showEn && (
        <Tag className={className} lang="en">
          {enText}
        </Tag>
      )}
      {showBn && hasBn && (
        <Tag className={bnClassName ?? className} lang="bn">
          {bnText}
        </Tag>
      )}
    </>
  );
}

export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useLang();
  const options: { id: Lang; label: string }[] = [
    { id: 'en', label: 'EN' },
    { id: 'bn', label: 'বাংলা' },
    { id: 'both', label: t('lang.both') },
  ];
  return (
    <div role="group" aria-label={t('lang.switchLabel')} className={`inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold ${className}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={lang === o.id}
          onClick={() => setLang(o.id)}
          className={`px-2.5 py-1.5 rounded-md cursor-pointer transition-colors whitespace-nowrap ${
            lang === o.id ? 'bg-[#12111A] text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
