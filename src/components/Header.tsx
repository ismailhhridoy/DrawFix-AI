import type { AppStep } from '../types/plan';

interface HeaderProps {
  activeStep: AppStep;
  hasPlan: boolean;
  onSelectStep: (step: AppStep) => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
}

const WORKSPACE_STEPS: { id: AppStep; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'review', label: 'Review' },
  { id: 'report', label: 'Report' },
  { id: 'compare', label: 'Compare' },
  { id: 'simulate', label: '3D Escape' },
  { id: 'export', label: 'Export' },
];

export function Header({
  activeStep,
  hasPlan,
  onSelectStep,
  onPrimaryAction,
  primaryActionLabel,
}: HeaderProps) {
  const isLanding = activeStep === 'landing';

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200/90 px-6 h-16 flex items-center justify-between gap-8">
      {/* Zone 1: Single text element wordmark */}
      <button
        type="button"
        onClick={() => onSelectStep('landing')}
        className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
      >
        PlanCheck AI
      </button>

      {/* Zone 2: Concise single-line navigation links */}
      {isLanding ? (
        <nav
          aria-label="Overview sections"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          <a
            href="#capabilities"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('capabilities');
            }}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Capabilities
          </a>
          <a
            href="#benchmarks"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('benchmarks');
            }}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Case Benchmarks
          </a>
          <a
            href="#scope"
            onClick={(e) => {
              e.preventDefault();
              scrollToSection('scope');
            }}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Code Scope
          </a>
          <button
            type="button"
            onClick={() => onSelectStep('upload')}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            CAD Upload
          </button>
        </nav>
      ) : (
        <nav
          aria-label="Workflow steps"
          className="hidden md:flex items-center gap-6 text-sm font-medium overflow-x-auto"
        >
          {WORKSPACE_STEPS.map((step, index) => {
            const disabled = !hasPlan && step.id !== 'upload';
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelectStep(step.id)}
                className={`h-16 inline-flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-700 ${
                  active
                    ? 'border-blue-700 text-slate-900 font-semibold'
                    : disabled
                      ? 'border-transparent text-slate-300 cursor-not-allowed'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  0{index + 1}
                </span>
                <span>{step.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Zone 3: Single Primary Action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onPrimaryAction}
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {primaryActionLabel}
        </button>
      </div>
    </header>
  );
}
