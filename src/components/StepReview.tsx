import { useRef, useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { computeRoomOccupantLoad } from '../engine/ruleEngine';
import type {
  BuildingProject,
  LayerConventions,
  RoomTaxonomy,
  SiteContext,
} from '../types/plan';

interface StepReviewProps {
  project: BuildingProject;
  selectedFloorIndex: number;
  onSelectFloor: (floorIdx: number) => void;
  onAddFloorDxf: (params: { dxfText: string; fileName: string }) => void;
  onRemoveFloor: (floorIdx: number) => void;
  aiReconciling: boolean;
  aiSource: 'gemini' | 'heuristic';
  onUpdateRoomTaxonomy: (roomId: string, taxonomy: RoomTaxonomy) => void;
  onUpdateSiteContext: (patch: Partial<SiteContext>) => void;
  onAutoMapLayers: () => Promise<{
    conventions: LayerConventions;
    source: 'gemini' | 'heuristic';
    rationale: string;
  } | null>;
  onRunAiReconcile: () => void;
  onConfirmAndAudit: () => void;
}

const TAXONOMY_OPTIONS: { value: RoomTaxonomy; label: string }[] = [
  { value: 'workfloor', label: 'Workfloor (Production / Sewing)' },
  { value: 'cabin', label: 'Cabin / Enclosed Office' },
  { value: 'bedroom', label: 'Bedroom / Habitable Unit' },
  { value: 'corridor', label: 'Corridor / Egress Passage' },
  { value: 'lobby', label: 'Lobby / Vestibule' },
  { value: 'stair', label: 'Staircase Core' },
  { value: 'exit', label: 'Exit / Discharge Zone' },
  { value: 'utility', label: 'Utility / Storage / Service' },
];

export function StepReview({
  project,
  selectedFloorIndex,
  onSelectFloor,
  onAddFloorDxf,
  onRemoveFloor,
  aiReconciling,
  aiSource,
  onUpdateRoomTaxonomy,
  onUpdateSiteContext,
  onAutoMapLayers,
  onRunAiReconcile,
  onConfirmAndAudit,
}: StepReviewProps) {
  const addFloorInputRef = useRef<HTMLInputElement>(null);
  const [autoMappingLayers, setAutoMappingLayers] = useState(false);
  const [layerMapNote, setLayerMapNote] = useState<string | null>(null);

  const activeFloor = project.floors[selectedFloorIndex] || project.floors[0];
  const site: SiteContext = project.siteContext || {
    plotAreaSqM: 500,
    abuttingRoadWidthM: 12.2,
    frontSetbackM: 2.5,
    rearSetbackM: 2.0,
    sideSetbackM: 1.5,
    sprinklered: false,
    zoneLabel: 'Urban Plot',
  };

  const totalWalls = project.floors.reduce((s, f) => s + f.walls.length, 0);
  const totalDoors = project.floors.reduce((s, f) => s + f.doors.length, 0);
  const totalLocked = project.floors.reduce(
    (s, f) => s + f.doors.filter((d) => d.isLocked).length,
    0
  );
  const totalRooms = project.floors.reduce((s, f) => s + f.rooms.length, 0);
  const totalStairs = project.floors.reduce((s, f) => s + f.stairs.length, 0);
  const totalDims = project.floors.reduce((s, f) => s + f.dimensions.length, 0);
  const totalStaleDims = project.floors.reduce(
    (s, f) => s + f.dimensions.filter((d) => d.isStaleOverride).length,
    0
  );

  const handleAppendFloor = async (file: File) => {
    const dxfText = await file.text();
    onAddFloorDxf({ dxfText, fileName: file.name });
  };

  const handleTriggerLayerMap = async () => {
    setAutoMappingLayers(true);
    setLayerMapNote(null);
    const res = await onAutoMapLayers();
    if (res) {
      setLayerMapNote(
        `${res.source === 'gemini' ? 'Gemini AI' : 'Heuristic'}: ${res.rationale}`
      );
    }
    setAutoMappingLayers(false);
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-slate-500">
            Step 02 · Human-in-the-Loop Geometry Checkpoint · {project.floors.length}{' '}
            {project.floors.length === 1 ? 'Floor' : 'Floors'} ·{' '}
            {activeFloor.sourceFileName}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Confirm extracted CAD geometry, room taxonomy & site zoning
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Verify CAD room mappings, occupant loads, plot setbacks, road width, and
            sprinkler status before running deterministic BNBC & Imarat Bidhimala checks.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={aiReconciling}
            onClick={onRunAiReconcile}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-700" />
            {aiReconciling ? 'Reconciling Labels...' : 'Re-run Gemini Label Match'}
          </button>
          <button
            type="button"
            onClick={onConfirmAndAudit}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-xs"
          >
            Confirm & Run Full Audit
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Building-Wide Extracted Geometry Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 sm:divide-x divide-slate-200/90 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4">
          <div className="text-xs text-slate-500">Building Stack</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {project.floors.length}F ·{' '}
            {(project.floors.length * project.storyHeightM).toFixed(1)} m
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Wall Segments</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalWalls}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Doors / Exits</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalDoors}{' '}
            <span className="text-xs font-normal text-red-700">
              {totalLocked > 0 ? `(${totalLocked} locked)` : ''}
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Rooms Mapped</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalRooms}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Stair Cores</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalStairs}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">DXF Dimensions</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalDims}{' '}
            <span className="text-xs font-normal text-amber-700">
              {totalStaleDims > 0 ? `(${totalStaleDims} stale)` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Site, Zoning & Sprinkler What-If Parameters */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Site, Zoning & Fire-Suppression Parameters ·{' '}
              <span className="text-slate-600 font-normal">{site.zoneLabel}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Adjust plot dimensions or sprinkler protection to test RAJUK FAR / MGC /
              Setbacks and BNBC travel limits live.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer select-none hover:bg-slate-100/80 transition-colors">
            <input
              type="checkbox"
              checked={site.sprinklered}
              onChange={(e) => onUpdateSiteContext({ sprinklered: e.target.checked })}
              className="accent-blue-700 cursor-pointer"
            />
            <span>Automatic NFPA-13 Sprinklers ({site.sprinklered ? '22.5 m' : '16.0 m'} travel limit)</span>
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <label className="block">
            <span className="text-slate-600 font-medium">Plot Area (m²)</span>
            <input
              type="number"
              min="50"
              step="10"
              value={site.plotAreaSqM}
              onChange={(e) =>
                onUpdateSiteContext({ plotAreaSqM: Math.max(50, Number(e.target.value) || 50) })
              }
              className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 tabular-nums focus-visible:outline-2 focus-visible:outline-blue-700"
            />
          </label>
          <label className="block">
            <span className="text-slate-600 font-medium">Abutting Road (m)</span>
            <input
              type="number"
              min="3"
              step="0.5"
              value={site.abuttingRoadWidthM}
              onChange={(e) =>
                onUpdateSiteContext({
                  abuttingRoadWidthM: Math.max(3, Number(e.target.value) || 3),
                })
              }
              className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 tabular-nums focus-visible:outline-2 focus-visible:outline-blue-700"
            />
          </label>
          <label className="block">
            <span className="text-slate-600 font-medium">Front Setback (m)</span>
            <input
              type="number"
              min="0"
              step="0.25"
              value={site.frontSetbackM}
              onChange={(e) =>
                onUpdateSiteContext({ frontSetbackM: Math.max(0, Number(e.target.value) || 0) })
              }
              className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 tabular-nums focus-visible:outline-2 focus-visible:outline-blue-700"
            />
          </label>
          <label className="block">
            <span className="text-slate-600 font-medium">Rear Setback (m)</span>
            <input
              type="number"
              min="0"
              step="0.25"
              value={site.rearSetbackM}
              onChange={(e) =>
                onUpdateSiteContext({ rearSetbackM: Math.max(0, Number(e.target.value) || 0) })
              }
              className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 tabular-nums focus-visible:outline-2 focus-visible:outline-blue-700"
            />
          </label>
          <label className="block">
            <span className="text-slate-600 font-medium">Side Setback (m)</span>
            <input
              type="number"
              min="0"
              step="0.25"
              value={site.sideSetbackM}
              onChange={(e) =>
                onUpdateSiteContext({ sideSetbackM: Math.max(0, Number(e.target.value) || 0) })
              }
              className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 tabular-nums focus-visible:outline-2 focus-visible:outline-blue-700"
            />
          </label>
        </div>
      </div>

      {/* Floor Selector Tabs + Add Floor DXF Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-xl shadow-xs px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1.5">Floor Level:</span>
          {project.floors.map((fl, idx) => {
            const isSel = idx === selectedFloorIndex;
            const label = fl.floorLabel || (idx === 0 ? 'GF' : `L${idx + 1}`);
            return (
              <div key={fl.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => onSelectFloor(idx)}
                  className={`px-3 py-1.5 text-xs font-mono border cursor-pointer transition-colors ${
                    project.floors.length > 1 && idx > 0 ? 'rounded-l-lg' : 'rounded-lg'
                  } ${
                    isSel
                      ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {label} · {fl.rooms.length} rooms
                </button>
                {project.floors.length > 1 && idx > 0 && (
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => onRemoveFloor(idx)}
                    className="px-2 py-1.5 border border-l-0 border-slate-300 rounded-r-lg bg-white text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <button
            type="button"
            onClick={() => addFloorInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Floor (.dxf)
          </button>
          <input
            ref={addFloorInputRef}
            type="file"
            accept=".dxf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAppendFloor(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Room Label Reconciliation Table for Selected Floor */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">
            [{activeFloor.floorLabel || 'GF'}] Room Label Reconciliation —{' '}
            {activeFloor.floorName || activeFloor.name}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Mapper:{' '}
            {aiSource === 'gemini'
              ? 'Gemini 4 Hydrogen + Human Override'
              : 'Deterministic Token Matcher + Human Override'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-600">
                <th className="py-3 px-4 font-semibold">Extracted CAD Label</th>
                <th className="py-3 px-4 font-semibold">Area</th>
                <th className="py-3 px-4 font-semibold">Occ. Load</th>
                <th className="py-3 px-4 font-semibold">Mapped BNBC Taxonomy</th>
                <th className="py-3 px-4 font-semibold">Confidence & Source</th>
                <th className="py-3 px-4 font-semibold">Mapping Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {activeFloor.rooms.map((room) => {
                const occLoad = computeRoomOccupantLoad(room);
                return (
                  <tr key={room.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {room.originalLabel}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {room.areaSqM.toFixed(1)} m²
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {occLoad > 0 ? `${occLoad} p` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        aria-label={`Taxonomy for ${room.originalLabel}`}
                        value={room.taxonomy}
                        onChange={(e) =>
                          onUpdateRoomTaxonomy(room.id, e.target.value as RoomTaxonomy)
                        }
                        className="bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-900 rounded-lg focus-visible:outline-2 focus-visible:outline-blue-700"
                      >
                        {TAXONOMY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                      <span
                        className={
                          room.confidence >= 0.85
                            ? 'text-emerald-700 font-semibold'
                            : 'text-amber-700 font-semibold'
                        }
                      >
                        {Math.round(room.confidence * 100)}%
                      </span>{' '}
                      <span className="text-slate-400">·</span>{' '}
                      <span className="text-slate-600 uppercase">{room.mappingSource}</span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {room.mappingReason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Layers & Parse Audit Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-900">
              DXF Layers Detected on {activeFloor.floorLabel || 'GF'} (
              {activeFloor.layersFound.length})
            </div>
            <button
              type="button"
              disabled={autoMappingLayers}
              onClick={() => void handleTriggerLayerMap()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              {autoMappingLayers ? 'Re-mapping...' : 'Auto-Map Layers (AI)'}
            </button>
          </div>
          <div className="text-xs font-mono text-slate-600 leading-relaxed">
            {activeFloor.layersFound.join(' · ') || 'Default layer 0'}
          </div>
          {layerMapNote && (
            <div className="rounded-lg text-[11px] font-mono text-blue-800 bg-blue-50 border border-blue-200 px-3 py-2">
              {layerMapNote}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900">
            Geometry Extraction Audit ({activeFloor.floorLabel || 'GF'})
          </div>
          {activeFloor.parseNotes.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              All walls, doors, windows, room polygons, and dimensions extracted cleanly in{' '}
              {activeFloor.units}.
            </div>
          ) : (
            <ul className="space-y-1.5 text-xs text-amber-800">
              {activeFloor.parseNotes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
