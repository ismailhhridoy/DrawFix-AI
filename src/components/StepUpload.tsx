import { useRef, useState } from 'react';
import { useLang } from '../i18n';
import {
  ArrowRight,
  Upload,
  Download,
  FileCode2,
  SlidersHorizontal,
  Layers,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { DEFAULT_CONVENTIONS } from '../engine/dxfParser';
import { requestInferredConventions } from '../engine/aiFallback';
import { SAMPLE_BUILDINGS, type SampleBuildingMeta } from '../engine/sampleDxf';
import type {
  BuildingProject,
  LayerConventions,
  OccupancyClass,
  ParsedFloorPlan,
} from '../types/plan';
import { VisionUpload } from './VisionUpload';

interface StepUploadProps {
  activeProject: BuildingProject | null;
  onLoadDxfFiles: (params: {
    files: { dxfText: string; fileName: string }[];
    occupancyClass: OccupancyClass;
    conventions: LayerConventions;
    storyHeightM: number;
  }) => void;
  onLoadSampleBuilding: (sample: SampleBuildingMeta) => void;
  onAddFloorDxf: (params: {
    dxfText: string;
    fileName: string;
    conventions: LayerConventions;
  }) => void;
  parseError: string | null;
  onContinueToReview?: () => void;
  /** A plan read by AI from an image, already scaled; goes to Review for confirmation. */
  onLoadVisionPlan?: (plan: ParsedFloorPlan, occupancyClass: OccupancyClass) => void;
}

export function StepUpload({
  activeProject,
  onLoadDxfFiles,
  onLoadSampleBuilding,
  onAddFloorDxf,
  parseError,
  onContinueToReview,
  onLoadVisionPlan,
}: StepUploadProps) {
  const { t, num } = useLang();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFloorInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showConventions, setShowConventions] = useState(false);
  const [occupancyClass, setOccupancyClass] = useState<OccupancyClass>('industrial_rmg');
  const [storyHeightM, setStoryHeightM] = useState<number>(3.2);
  const [wallLayersInput, setWallLayersInput] = useState(
    DEFAULT_CONVENTIONS.wallLayers.join(', ')
  );
  const [doorLayersInput, setDoorLayersInput] = useState(
    DEFAULT_CONVENTIONS.doorLayers.join(', ')
  );
  const [unitMode, setUnitMode] = useState<'auto' | 'meters' | 'millimeters'>('auto');
  const [inferringLayers, setInferringLayers] = useState(false);
  const [layerInferNote, setLayerInferNote] = useState<string | null>(null);

  const getConventions = (): LayerConventions => ({
    ...DEFAULT_CONVENTIONS,
    wallLayers: wallLayersInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    doorLayers: doorLayersInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    unitMode,
  });

  const handleFiles = async (fileList: FileList | File[]) => {
    const dxfFiles = Array.from(fileList).filter((f) =>
      f.name.toLowerCase().endsWith('.dxf')
    );
    const targets = dxfFiles.length > 0 ? dxfFiles : Array.from(fileList);
    if (targets.length === 0) return;

    const loaded = await Promise.all(
      targets.map(async (f) => ({
        dxfText: await f.text(),
        fileName: f.name,
      }))
    );

    onLoadDxfFiles({
      files: loaded,
      occupancyClass,
      conventions: getConventions(),
      storyHeightM,
    });
  };

  const handleAppendFloorFile = async (file: File) => {
    const text = await file.text();
    onAddFloorDxf({
      dxfText: text,
      fileName: file.name,
      conventions: getConventions(),
    });
  };

  const handleAutoMapActiveLayers = async () => {
    if (!activeProject) return;
    setInferringLayers(true);
    setLayerInferNote(null);
    const layersFound = Array.from(
      new Set(activeProject.floors.flatMap((f) => f.layersFound))
    );
    const sampleTexts = Array.from(
      new Set(activeProject.floors.flatMap((f) => f.rooms.map((r) => r.originalLabel)))
    );
    const res = await requestInferredConventions(
      layersFound,
      sampleTexts,
      getConventions()
    );
    setWallLayersInput(res.conventions.wallLayers.join(', '));
    setDoorLayersInput(res.conventions.doorLayers.join(', '));
    setLayerInferNote(`Detected: ${res.rationale}`);
    setInferringLayers(false);
  };

  const downloadSampleBuilding = (sample: SampleBuildingMeta) => {
    sample.floors.forEach((fl, idx) => {
      setTimeout(() => {
        const blob = new Blob([fl.dxfContent], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fl.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }, idx * 180);
    });
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-8">
      {/* Clean Step Header */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-200/90 pb-6">
        <div className="space-y-1.5 max-w-2xl">
          <p className="text-xs font-mono text-slate-500">{t('upload.kicker')}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            {t('upload.title')}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {t('upload.lead')}
          </p>
        </div>

        <div className="text-xs text-slate-500 space-y-1 lg:text-right shrink-0">
          <div className="font-semibold text-slate-700">{t('upload.format')}</div>
          <div>{t('upload.formatNote')}</div>
        </div>
      </section>

      {/* Main Action Grid: Multi-Floor Upload Dropzone + Sample Buildings */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Upload Dropzone */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {t('upload.boxTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setShowConventions((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showConventions ? t('upload.hideMapping') : t('upload.mapping')}
              </button>
            </div>

            {/* Always-visible quick building profile */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <label className="block sm:col-span-2">
                <span className="text-slate-600 font-medium">{t('upload.occupancy')}</span>
                <select
                  value={occupancyClass}
                  onChange={(e) => setOccupancyClass(e.target.value as OccupancyClass)}
                  className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                >
                  <option value="industrial_rmg">{t('upload.occ.rmg')}</option>
                  <option value="residential">{t('upload.occ.res')}</option>
                  <option value="mixed">{t('upload.occ.mixed')}</option>
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600 font-medium">{t('upload.storey')}</span>
                <input
                  type="number"
                  step="0.1"
                  min="2.4"
                  max="6.0"
                  value={storyHeightM}
                  onChange={(e) =>
                    setStoryHeightM(Math.max(2.4, Number(e.target.value) || 3.2))
                  }
                  className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 tabular-nums"
                />
              </label>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) {
                  void handleFiles(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-700 bg-blue-50/70'
                  : 'border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-slate-50'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                <Upload className="w-5 h-5 text-blue-700" />
              </div>
              <p className="text-sm font-semibold text-slate-900">
                {t('upload.drop')}
              </p>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                {t('upload.dropNote')}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".dxf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void handleFiles(e.target.files);
                  }
                }}
              />
            </div>

            {activeProject && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {t('upload.active', { p: activeProject.name })}
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 tabular-nums">
                    {t('upload.loaded', { n: activeProject.floors.length })}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => appendFloorInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-800 bg-white border border-blue-300 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('upload.addFloor')}
                  </button>
                  {onContinueToReview && (
                    <button
                      type="button"
                      onClick={onContinueToReview}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer transition-colors"
                    >
                      {t('nav.review')}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <input
                  ref={appendFloorInputRef}
                  type="file"
                  accept=".dxf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleAppendFloorFile(file);
                  }}
                />
              </div>
            )}

            {parseError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                <strong>{t('upload.cantRead')}</strong> {parseError}
              </div>
            )}

            {showConventions && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-800">
                    {t('upload.custom')}
                  </div>
                  {activeProject && (
                    <button
                      type="button"
                      disabled={inferringLayers}
                      onClick={() => void handleAutoMapActiveLayers()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-800 bg-white border border-blue-300 hover:bg-blue-50 rounded-md cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {inferringLayers ? t('review.detecting') : t('review.redetect')}
                    </button>
                  )}
                </div>
                {layerInferNote && (
                  <div className="rounded-md text-[11px] font-mono text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1.5">
                    {layerInferNote}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2.5">
                  <label className="block">
                    <span className="text-slate-600">{t('upload.wallLayers')}</span>
                    <input
                      type="text"
                      value={wallLayersInput}
                      onChange={(e) => setWallLayersInput(e.target.value)}
                      className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-600">{t('upload.doorLayers')}</span>
                    <input
                      type="text"
                      value={doorLayersInput}
                      onChange={(e) => setDoorLayersInput(e.target.value)}
                      className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-600">{t('upload.units')}</span>
                    <select
                      value={unitMode}
                      onChange={(e) =>
                        setUnitMode(e.target.value as 'auto' | 'meters' | 'millimeters')
                      }
                      className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                    >
                      <option value="auto">{t('upload.units.auto')}</option>
                      <option value="millimeters">{t('upload.units.mm')}</option>
                      <option value="meters">{t('upload.units.m')}</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
            {t('upload.wallHint')}
          </div>
        </div>

        {/* Standard CAD Templates */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                {t('upload.templates')}
              </h2>
              <span className="text-xs font-mono text-slate-500">
                {t('upload.templatesNote')}
              </span>
            </div>

            <div className="divide-y divide-slate-200/80 border border-slate-200 rounded-xl overflow-hidden">
              {SAMPLE_BUILDINGS.map((sample) => {
                const isMulti = sample.floors.length > 1;
                return (
                  <div
                    key={sample.id}
                    className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors ${
                      isMulti ? 'bg-blue-50/25' : 'bg-white'
                    }`}
                  >
                    <div className="space-y-1.5 max-w-xl">
                      <div className="flex items-center gap-2">
                        {isMulti ? (
                          <Layers className="w-4 h-4 text-blue-700 shrink-0" />
                        ) : (
                          <FileCode2 className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <h3 className="font-display font-semibold text-slate-900 text-base">
                          {sample.name}
                        </h3>
                      </div>
                      <p className="text-xs font-mono text-slate-500">{sample.subtitle}</p>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {sample.summary}
                      </p>
                    </div>

                    <div className="flex sm:flex-col items-stretch sm:items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLoadSampleBuilding(sample)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {isMulti ? t('upload.loadN', { n: sample.floors.length }) : t('upload.open')}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadSampleBuilding(sample)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {isMulti ? t('upload.downloadN', { n: sample.floors.length }) : t('upload.download')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
            {t('upload.customize')}
          </div>
        </div>
      </section>
      {onLoadVisionPlan && (
        <VisionUpload
          occupancyClass={occupancyClass}
          onPlanRead={(plan) => onLoadVisionPlan(plan, occupancyClass)}
        />
      )}
    </main>
  );
}
