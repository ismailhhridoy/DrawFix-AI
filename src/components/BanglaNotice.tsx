import { useState } from 'react';
import { useLang } from '../i18n';
import { GLOSSARY } from '../i18n/glossary';

/**
 * Shown whenever Bangla is on screen: the Bangla is a machine draft until a native speaker with
 * building-code context reviews it. Lists the glossary so a reviewer can check the terms.
 */
export function BanglaNotice() {
  const { showBn, t } = useLang();
  const [open, setOpen] = useState(false);
  if (!showBn) return null;
  return (
    <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-8 py-1.5 text-xs text-slate-600" lang="bn">
      <div className="max-w-[1380px] mx-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{t('bnNotice.text')}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="underline underline-offset-2 cursor-pointer font-semibold"
        >
          {open ? t('bnNotice.hide') : t('bnNotice.show', { n: GLOSSARY.length })}
        </button>
      </div>
      {open && (
        <div className="max-w-[1380px] mx-auto mt-2 overflow-x-auto">
          <table className="min-w-[480px] w-full text-left border-collapse bg-white rounded-lg border border-slate-200">
            <thead>
              <tr className="text-[11px] text-slate-700 border-b border-slate-200">
                <th className="py-1.5 px-3 font-semibold">English</th>
                <th className="py-1.5 px-3 font-semibold">বাংলা</th>
                <th className="py-1.5 px-3 font-semibold">{t('bnNotice.note')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {GLOSSARY.map((g) => (
                <tr key={g.id}>
                  <td className="py-1 px-3" lang="en">{g.en}</td>
                  <td className="py-1 px-3 font-medium">{g.bn}</td>
                  <td className="py-1 px-3 text-slate-500" lang="en">{g.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
