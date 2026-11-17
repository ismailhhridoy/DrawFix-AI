import { useRef, useState } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { computeRoomOccupantLoad } from '../engine/ruleEngine';
import { Blueprint2D } from './Blueprint2D';
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
  onUpdateDoor: (doorId: string, patch: { isExit?: boolean; isLocked?: boolean }) => void;
  onAutoMapLayers: () => Promise<{
    conventions: LayerConventions;
    source: 'gemini' | 'heuristic';
    rationale: string;
  } | null>;
  onRunAiReconcile: () => void;
  onConfirmAndAudit: () => void;
}

const TAXONOMY_OPTIONS: { value: RoomTaxonomy; label: string }[] = [
  { value: 'workfloor', label: 'Work floor (production, canteen)' },
  { value: 'cabin', label: 'Cabin / enclosed office' },
  { value: 'bedroom', label: 'Bedroom (sleeping room)' },
  { value: 'habitable', label: 'Living / dining / kitchen' },
  { value: 'corridor', label: 'Corridor / passage' },
  { value: 'lobby', label: 'Lobby' },
  { value: 'stair', label: 'Stair' },
  { value: 'exit', label: 'Exit zone' },
  { value: 'utility', label: 'Store / toilet / service' },
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
  onUpdateDoor,
  onAutoMapLayers,
  onRunAiReconcile,
  onConfirmAndAudit,
}: StepReviewProps) {
  const addFloorInputRef = useRef<HTMLInputElement>(null);
  const [autoMappingLayers, setAutoMappingLayers] = useState(false);
  const [layerMapNote, setLayerMapNote] = useState<string | null>(null);
  const [hoverRoomId, setHoverRoomId] = useState<string | null>(null);
  const [showAllDoors, setShowAllDoors] = useState(false);

  const activeFloor = project.floors[selectedFloorIndex] || project.floors[0];
  const site: SiteContext = project.siteContext || {
    plotAreaSqM: 0,
    abuttingRoadWidthM: 0,
    frontSetbackM: 0,
    rearSetbackM: 0,
    sideSetbackM: 0,
    sprinklered: false,
    zoneLabel: 'Plot',
    declared: false,
  };
  const siteDeclared = site.declared !== false && site.plotAreaSqM > 0;
  const lowConfidence = activeFloor.rooms.filter((r) => r.confidence < 0.85 && r.mappingSource !== 'manual').length;
  const keyDoors = activeFloor.doors.filter((d) => d.isExit || d.isLocked || d.onExterior);
  const shownDoors = showAllDoors ? activeFloor.doors : keyDoors;
  const numOrEmpty = (v: number) => (v > 0 ? v : '');

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
      setLayerMapNote(`Layer detection: ${res.rationale}`);
    }
    setAutoMappingLayers(false);
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-slate-500">
            Step 02 · Check what was read · {project.floors.length}{' '}
            {project.floors.length === 1 ? 'Floor' : 'Floors'} ·{' '}
            {activeFloor.sourceFileName}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Confirm what the parser read from your drawing
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Rooms, exits and room types below drive every check. Correct anything that is wrong
            before you run the report.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={aiReconciling}
            onClick={onRunAiReconcile}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-700" />
            {aiReconciling ? 'Classifying…' : 'Auto-classify rooms'}
          </button>
          <button
            type="button"
            onClick={onConfirmAndAudit}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-xs"
          >
            Confirm and run checks
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Building-Wide Extracted Geometry Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 sm:divide-x divide-slate-200/90 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4">
          <div className="text-xs text-slate-500">Floors · height</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {project.floors.length}F ·{' '}
            {(project.floors.length * project.storyHeightM).toFixed(1)} m
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Wall segments</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalWalls}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Doors</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalDoors}{' '}
            <span className="text-xs font-normal text-red-700">
              {totalLocked > 0 ? `(${totalLocked} locked)` : ''}
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Rooms</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalRooms}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Stairs</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalStairs}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Dimensions</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {totalDims}{' '}
            <span className="text-xs font-normal text-amber-700">
              {totalStaleDims > 0 ? `(${totalStaleDims} mismatch)` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Plot data: not in a floor plan, so the reviewer supplies it */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Plot data <span className="text-slate-500 font-normal">(optional · {site.zoneLabel})</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {siteDeclared
                ? 'Used to screen FAR, ground coverage and setbacks against simplified limits.'
                : 'A floor plan does not contain these. Enter plot area and road width to screen zoning; left empty, zoning is listed as not checked.'}
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer select-none hover:bg-slate-100/80 transition-colors">
            <input
              type="checkbox"
              checked={site.sprinklered}
              onChange={(e) => onUpdateSiteContext({ sprinklered: e.target.checked })}
              className="accent-blue-700 cursor-pointer"
            />
            <span>
              Sprinklers throughout
              <span className="font-normal text-slate-500">
                {' '}
                (screening reference {site.sprinklered ? '22.5 m' : '16 m'})
              </span>
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {(
            [
              ['Plot area (m²)', 'plotAreaSqM', 10],
              ['Road width (m)', 'abuttingRoadWidthM', 0.5],
              ['Front setback (m)', 'frontSetbackM', 0.25],
              ['Rear setback (m)', 'rearSetbackM', 0.25],
              ['Side setback (m)', 'sideSetbackM', 0.25],
            ] as const
          ).map(([label, key, step]) => (
            <label key={key} className="block">
              <span className="text-slate-600 font-medium">{label}</span>
              <input
                type="number"
                min="0"
                step={step}
                placeholder="not entered"
                value={numOrEmpty(site[key])}
                onChange={(e) =>
                  onUpdateSiteContext({ [key]: Math.max(0, Number(e.target.value) || 0) })
                }
                className="mt-1 w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-900 tabular-nums placeholder:text-slate-400 placeholder:font-sans focus-visible:outline-2 focus-visible:outline-blue-700"
              />
            </label>
          ))}
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

      {/* Parser notes come first: they say what was assumed */}
      {activeFloor.parseNotes.length > 0 && (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1.5 text-xs text-amber-900">
          {activeFloor.parseNotes.map((note, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-5 xl:sticky xl:top-20 space-y-2">
          <Blueprint2D
            plan={activeFloor}
            selectedRoomId={hoverRoomId}
            onSelectRoom={(rid) => setHoverRoomId(rid)}
            title={`${activeFloor.floorLabel || 'GF'} as read`}
            mode="before"
            compact
          />
          <p className="text-[11px] text-slate-500 px-1">
            Point at a row to find the room. Green doors are exits, red are locked.
            {activeFloor.rooms[0]?.boundarySource === 'wall-enclosure'
              ? ' Room outlines were worked out from the walls.'
              : ''}
          </p>
        </div>

      {/* Room Label Reconciliation Table for Selected Floor */}
      <div className="xl:col-span-7 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">
            [{activeFloor.floorLabel || 'GF'}] Rooms and their types
            {lowConfidence > 0 && (
              <span className="ml-2 text-xs font-medium text-amber-700">
                {lowConfidence} to confirm
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {aiSource === 'gemini' ? 'Auto-classified' : 'Geometry & name matched'} · editable
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-600">
                <th className="py-3 px-4 font-semibold">Label in drawing</th>
                <th className="py-3 px-4 font-semibold">Area</th>
                <th className="py-3 px-4 font-semibold" title="Estimated from area with assumed factors">People (est.)</th>
                <th className="py-3 px-4 font-semibold">Room type</th>
                <th className="py-3 px-4 font-semibold">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {activeFloor.rooms.map((room) => {
                const occLoad = computeRoomOccupantLoad(room);
                return (
                  <tr
                    key={room.id}
                    onMouseEnter={() => setHoverRoomId(room.id)}
                    className={`transition-colors ${
                      hoverRoomId === room.id ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {room.originalLabel}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {room.areaSqM > 0 ? `${room.areaSqM.toFixed(1)} m²` : 'not measured'}
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
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <span
                        className={`font-mono font-semibold ${
                          room.confidence >= 0.85 ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {room.mappingSource === 'manual'
                          ? 'You'
                          : `${Math.round(room.confidence * 100)}%`}
                      </span>{' '}
                      {room.mappingReason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Doors and exits: the reviewer confirms which doors lead out */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">
            [{activeFloor.floorLabel || 'GF'}] Exits and locked doors
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              {activeFloor.exitDetection === 'block-name'
                ? 'Exits read from door block names'
                : activeFloor.exitDetection === 'exterior-wall'
                  ? 'Exits assumed: doors in the outer wall'
                  : 'No exit identified'}
            </span>
            {activeFloor.doors.length > keyDoors.length && (
              <button
                type="button"
                onClick={() => setShowAllDoors((v) => !v)}
                className="font-semibold text-blue-800 hover:underline cursor-pointer"
              >
                {showAllDoors ? 'Show exits only' : `Show all ${activeFloor.doors.length} doors`}
              </button>
            )}
          </div>
        </div>
        {shownDoors.length === 0 ? (
          <p className="px-5 py-4 text-xs text-slate-600">
            {activeFloor.doors.length === 0
              ? 'No doors were found in this drawing. Travel distances cannot be measured without an exit.'
              : 'No door is marked as an exit. Choose "Show all doors" and tick the ones that lead outside.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-600">
                  <th className="py-2.5 px-4 font-semibold">Door</th>
                  <th className="py-2.5 px-4 font-semibold">Clear width</th>
                  <th className="py-2.5 px-4 font-semibold">Position</th>
                  <th className="py-2.5 px-4 font-semibold">Exit</th>
                  <th className="py-2.5 px-4 font-semibold">Locked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {shownDoors.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900">
                      {d.blockName}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {d.widthM.toFixed(2)} m{' '}
                      <span className="font-sans text-slate-500">
                        {d.widthSource === 'wall-gap'
                          ? 'measured gap'
                          : d.widthSource === 'block-name'
                            ? 'from block name'
                            : 'assumed'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">
                      {d.onExterior ? 'Outer wall' : 'Inside'}
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        type="checkbox"
                        aria-label={`${d.blockName} is an exit`}
                        checked={d.isExit}
                        onChange={(e) => onUpdateDoor(d.id, { isExit: e.target.checked })}
                        className="accent-emerald-700 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        type="checkbox"
                        aria-label={`${d.blockName} is locked`}
                        checked={d.isLocked}
                        onChange={(e) => onUpdateDoor(d.id, { isLocked: e.target.checked })}
                        className="accent-red-700 w-4 h-4 cursor-pointer"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Layers & Parse Audit Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-900">
              Layers in this file ({activeFloor.layersFound.length}) · walls read from{' '}
              <span className="font-mono">{Array.from(new Set(activeFloor.walls.map((w) => w.layer))).join(', ') || 'none'}</span>
            </div>
            <button
              type="button"
              disabled={autoMappingLayers}
              onClick={() => void handleTriggerLayerMap()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              {autoMappingLayers ? 'Detecting…' : 'Re-detect layers'}
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
            How this floor was read ({activeFloor.floorLabel || 'GF'})
          </div>
          <ul className="space-y-1 text-xs text-slate-700">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              Units: {activeFloor.units}. Plan size {activeFloor.bounds.widthM.toFixed(1)} m ×{' '}
              {activeFloor.bounds.heightM.toFixed(1)} m.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              Rooms:{' '}
              {activeFloor.rooms[0]?.boundarySource === 'polyline'
                ? 'boundary polylines in the file'
                : activeFloor.rooms[0]?.boundarySource === 'wall-enclosure'
                  ? 'areas enclosed by the walls'
                  : 'text labels only (walls not closed)'}
              . {activeFloor.openings?.length ?? 0} door-sized wall gaps found.
            </li>
            <li className="flex items-start gap-2">
              {activeFloor.stairs.every((st) => st.stated?.headroom && st.stated?.handrail) &&
              activeFloor.stairs.length > 0 ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              )}
              Stairs: {activeFloor.stairs.length} found.{' '}
              {activeFloor.stairs.length === 0
                ? ''
                : activeFloor.stairs.every((st) => st.stated?.headroom && st.stated?.handrail)
                  ? 'Headroom and handrail are written in the drawing.'
                  : 'Headroom, handrail or step sizes are not written in the drawing and will not be checked.'}
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
