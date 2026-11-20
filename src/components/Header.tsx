import type { AppStep } from '../types/plan';
import { DrawFixLogo } from './DrawFixLogo';
import { LanguageSwitch, useLang } from '../i18n';
import type { MsgKey } from '../i18n/en';

interface HeaderProps {
  activeStep: AppStep;
  hasPlan: boolean;
  /** Steps the person has already opened, shown with a tick. */
  visitedSteps?: AppStep[];
  onSelectStep: (step: AppStep) => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
}

/** The numbered review flow, in order. Permit desk is a separate tool, not a step. */
export const WORKSPACE_STEPS: { id: AppStep; label: MsgKey; alwaysEnabled?: boolean }[] = [
  { id: 'upload', label: 'nav.upload', alwaysEnabled: true },
  { id: 'review', label: 'nav.review' },
  { id: 'report', label: 'nav.report' },
  { id: 'compare', label: 'nav.fixes' },
  { id: 'simulate', label: 'nav.3d' },
  { id: 'export', label: 'nav.export' },
];

export function Header({
  activeStep,
  hasPlan,
  visitedSteps = [],
  onSelectStep,
  onPrimaryAction,
  primaryActionLabel,
}: HeaderProps) {
  const { t, num } = useLang();
  const isLanding = activeStep === 'landing';

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-[#12111A]/[0.08] px-4 sm:px-8 h-[80px] flex items-center justify-between gap-4 sm:gap-8 overflow-hidden">
      {/* Zone 1: Prominent Animated Brand Mark + Single-Line Wordmark */}
      <button
        type="button"
        onClick={() => onSelectStep('landing')}
        className="inline-flex items-center gap-3 sm:gap-3.5 font-display text-xl sm:text-[1.65rem] font-extrabold tracking-tight text-[#12111A] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
      >
        <DrawFixLogo size={44} />
        <span>DrawFix AI</span>
      </button>

      {/* Zone 2: Concise single-line navigation links */}
      {isLanding ? (
        <nav
          aria-label="Overview sections"
          className="hidden md:flex items-center gap-7 text-base font-medium text-[#12111A]/70"
        >
          <a
            href="#process"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('process');
            }}
            className="hover:text-[#12111A] transition-colors whitespace-nowrap shrink-0"
          >
            {t('nav.process')}
          </a>
          <a
            href="#workflows"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('workflows');
            }}
            className="hover:text-[#12111A] transition-colors whitespace-nowrap shrink-0"
          >
            {t('nav.workflows')}
          </a>
          <button
            type="button"
            onClick={() => onSelectStep('permits')}
            className="hover:text-[#12111A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('nav.permits')}
          </button>
          <a
            href="#rules"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('rules');
            }}
            className="hover:text-[#12111A] transition-colors whitespace-nowrap shrink-0"
          >
            {t('nav.rules')}
          </a>
          <a
            href="#faq"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('faq');
            }}
            className="hover:text-[#12111A] transition-colors whitespace-nowrap shrink-0"
          >
            {t('nav.faq')}
          </a>
        </nav>
      ) : (
        <nav
          aria-label="Workflow steps"
          className="hidden md:flex items-center gap-5 text-[15px] font-medium overflow-x-auto"
        >
          {WORKSPACE_STEPS.map((step, index) => {
            const disabled = !hasPlan && !step.alwaysEnabled;
            const active = activeStep === step.id;
            const done = !active && hasPlan && visitedSteps.includes(step.id);
            return (
              <button
                key={step.id}
                type="button"
                disabled={disabled}
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelectStep(step.id)}
                className={`h-[80px] inline-flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2563EB] ${
                  active
                    ? 'border-[#2563EB] text-[#12111A] font-semibold'
                    : disabled
                      ? 'border-transparent text-slate-300 cursor-not-allowed'
                      : 'border-transparent text-[#12111A]/60 hover:text-[#12111A] hover:border-slate-300'
                }`}
              >
                {done ? (
                  <span
                    aria-label={t('nav.done')}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] leading-none"
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] leading-none tabular-nums ${
                      active ? 'bg-[#12111A] text-white' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {num(index + 1)}
                  </span>
                )}
                <span>{t(step.label)}</span>
              </button>
            );
          })}
          <span aria-hidden="true" className="h-6 w-px bg-slate-200 shrink-0" />
          <button
            type="button"
            aria-current={activeStep === 'permits' ? 'page' : undefined}
            onClick={() => onSelectStep('permits')}
            className={`h-[80px] inline-flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#2563EB] ${
              activeStep === 'permits'
                ? 'border-[#2563EB] text-[#12111A] font-semibold'
                : 'border-transparent text-[#12111A]/60 hover:text-[#12111A] hover:border-slate-300'
            }`}
          >
            {t('nav.permits')}
          </button>
        </nav>
      )}

      {/* Zone 3: Single Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        {!isLanding && <LanguageSwitch />}
        <button
          type="button"
          onClick={onPrimaryAction}
          className={`${isLanding ? "" : "hidden sm:inline-flex "}px-5 py-2.5 text-sm font-semibold text-white bg-[#12111A] hover:bg-[#2563EB] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]`}
        >
          {primaryActionLabel}
        </button>
      </div>
    </header>
  );
}
