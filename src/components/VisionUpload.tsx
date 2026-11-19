import { useRef, useState } from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import { useLang } from '../i18n';
import type { OccupancyClass, ParsedFloorPlan } from '../types/plan';
import { requestPlanImageReading } from '../engine/aiApi';
import { buildPlanFromVision } from '../engine/visionPlan';
import { useAiStatus } from './shared';

interface VisionUploadProps {
  occupancyClass: OccupancyClass;
  onPlanRead: (plan: ParsedFloorPlan) => void;
}

/** Upload a plan image or PDF; the AI traces it, code scales it, the reviewer confirms it in Review. */
export function VisionUpload({ occupancyClass, onPlanRead }: VisionUploadProps) {
  const { t } = useLang();
  const ai = useAiStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const [widthM, setWidthM] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const w = Number(widthM);
    if (!Number.isFinite(w) || w <= 0) {
      setError(t('vision.needWidth'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const reading = await requestPlanImageReading(file);
      const plan = buildPlanFromVision(reading, {
        realWidthM: w,
        name: file.name.replace(/\.(png|jpe?g|webp|pdf)$/i, ''),
        fileName: file.name,
        occupancyClass,
        floorIndex: 0,
        floorLabel: 'GF',
      });
      onPlanRead(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <ScanLine className="h-5 w-5 text-indigo-600" /> {t('vision.title')}
      </h2>
      <p className="text-sm text-slate-700 max-w-3xl">{t('vision.lead')}</p>
      {!ai.aiConfigured && ai.checked && <p className="text-xs text-amber-700">{t('vision.needsAi')}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-700">
          <span className="block text-xs text-slate-500 mb-1">{t('vision.width')}</span>
          <input
            type="number"
            min={3}
            max={500}
            step={0.1}
            value={widthM}
            onChange={(e) => setWidthM(e.target.value)}
            className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy || !ai.aiConfigured}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          {busy ? t('vision.reading') : t('vision.choose')}
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">{error}</div>
      )}
    </section>
  );
}
