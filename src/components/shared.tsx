import { useEffect, useState } from 'react';
import { BadgeCheck, FileSearch, Ruler } from 'lucide-react';
import type { Violation } from '../types/plan';

export interface AiStatus {
  checked: boolean;
  aiConfigured: boolean;
  model: string;
}

let cached: AiStatus | null = null;

/** Asks the server once whether Gemini is configured, so the interface never claims AI that is not running. */
export function useAiStatus(): AiStatus {
  const [status, setStatus] = useState<AiStatus>(
    cached || { checked: false, aiConfigured: false, model: '' }
  );
  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        cached = {
          checked: true,
          aiConfigured: Boolean(d?.aiConfigured),
          model: typeof d?.model === 'string' ? d.model : '',
        };
        if (alive) setStatus(cached);
      })
      .catch(() => {
        cached = { checked: true, aiConfigured: false, model: '' };
        if (alive) setStatus(cached);
      });
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

const BASIS_META = {
  verified: {
    label: 'Verified threshold',
    title: 'The limit was read in the BNBC 2012 text (Part 3, Chapter 1).',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Icon: BadgeCheck,
  },
  screening: {
    label: 'Screening threshold',
    title: 'An advisory screening limit. Confirm the governing gazette clause before formal filing.',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
    Icon: FileSearch,
  },
  drawing: {
    label: 'Drawing check',
    title: 'Not a code rule. A consistency check on the drawing itself.',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: Ruler,
  },
} as const;

export function BasisBadge({ basis }: { basis: Violation['basis'] }) {
  const meta = BASIS_META[basis || 'screening'];
  const Icon = meta.Icon;
  return (
    <span
      title={meta.title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${meta.cls}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function measuredText(v: Violation): string {
  return v.blocked ? 'No route' : `${v.measuredValue} ${v.unit}`;
}
