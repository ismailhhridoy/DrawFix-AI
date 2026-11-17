import { useRef, useState } from 'react';
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
} from '../types/plan';

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
}

export function StepUpload({
  activeProject,
  onLoadDxfFiles,
  onLoadSampleBuilding,
  onAddFloorDxf,
  parseError,
  onContinueToReview,
}: StepUploadProps) {
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
          <p className="text-xs font-mono text-slate-500">Step 01 · Upload CAD</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Upload floor plans for compliance review
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Drop a single AutoCAD DXF file or stack multiple floors (GF, L2, L3). Files are parsed
            locally in your browser and are never edited or stored on external servers.
          </p>
        </div>

        <div className="text-xs text-slate-500 space-y-1 lg:text-right shrink-0">
          <div className="font-semibold text-slate-700">Accepted format</div>
          <div>ASCII DXF (R12–R2018) · Single lines/polylines · Room text tags</div>
        </div>
      </section>

      {/* Main Action Grid: Multi-Floor Upload Dropzone + Sample Buildings */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Upload Dropzone */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Building &amp; DXF upload
              </h2>
              <button
                type="button"
                onClick={() => setShowConventions((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showConventions ? 'Hide layer mapping' : 'Layer mapping'}
              </button>
            </div>

            {/* Always-visible quick building profile */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <label className="block sm:col-span-2">
                <span className="text-slate-600 font-medium">Occupancy</span>
                <select
                  value={occupancyClass}
                  onChange={(e) => setOccupancyClass(e.target.value as OccupancyClass)}
                  className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                >
                  <option value="industrial_rmg">Industrial / Factory (RMG)</option>
                  <option value="residential">Residential Multi-Unit</option>
                  <option value="mixed">Commercial / Mixed-Use</option>
                </select>
              </label>
              <label className="block">
                <span className="text-slate-600 font-medium">Storey ht (m)</span>
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
                Drop .dxf files here, or click to browse
              </p>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Multiple files auto-stack by floor name (GF, L2, L3)
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
                    Active: {activeProject.name}
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 tabular-nums">
                    {activeProject.floors.length}{' '}
                    {activeProject.floors.length === 1 ? 'floor' : 'floors'} loaded
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => appendFloorInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-800 bg-white border border-blue-300 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add floor
                  </button>
                  {onContinueToReview && (
                    <button
                      type="button"
                      onClick={onContinueToReview}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer transition-colors"
                    >
                      Review
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
                <strong>Could not read the file.</strong> {parseError}
              </div>
            )}

            {showConventions && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-800">
                    Custom DXF layer mapping
                  </div>
                  {activeProject && (
                    <button
                      type="button"
                      disabled={inferringLayers}
                      onClick={() => void handleAutoMapActiveLayers()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-800 bg-white border border-blue-300 hover:bg-blue-50 rounded-md cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className="w-3 h-3" />
                      {inferringLayers ? 'Detecting…' : 'Re-detect layers'}
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
                    <span className="text-slate-600">Wall Layers (comma-separated)</span>
                    <input
                      type="text"
                      value={wallLayersInput}
                      onChange={(e) => setWallLayersInput(e.target.value)}
                      className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-600">Door / Exit Layers</span>
                    <input
                      type="text"
                      value={doorLayersInput}
                      onChange={(e) => setDoorLayersInput(e.target.value)}
                      className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900"
                    />
                  </label>
                  <label className="block">
                    <span className="text-slate-600">Drawing Units</span>
                    <select
                      value={unitMode}
                      onChange={(e) =>
                        setUnitMode(e.target.value as 'auto' | 'meters' | 'millimeters')
                      }
                      className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900"
                    >
                      <option value="auto">Auto-detect ($INSUNITS / coordinate span)</option>
                      <option value="millimeters">Millimeters (mm)</option>
                      <option value="meters">Meters (m)</option>
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
            If the wall layer has an unusual name, the parser picks the layer with the most line
            work automatically. You can override layer names under Layer mapping above.
          </div>
        </div>

        {/* Standard CAD Templates */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200/90 rounded-xl shadow-xs p-6 space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Or open a standard CAD template
              </h2>
              <span className="text-xs font-mono text-slate-500">
                Ready-to-audit DXF stacks
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
                        {isMulti ? `Load ${sample.floors.length} floors` : 'Open in workspace'}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadSampleBuilding(sample)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {isMulti ? `Download ${sample.floors.length} .dxf` : 'Download .dxf'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
            Need to customize an existing AutoCAD sheet? Download any template above, edit walls or
            door widths in CAD, and re-upload it to compare revised compliance findings.
          </div>
        </div>
      </section>
    </main>
  );
}
