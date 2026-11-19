import { useRef, useState } from 'react';
import { useLang } from '../i18n';
import type { MsgKey } from '../i18n/en';
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

const TAXONOMY_OPTIONS: { value: RoomTaxonomy; label: MsgKey }[] = [
  { value: 'workfloor', label: 'tax.workfloor' },
  { value: 'cabin', label: 'tax.cabin' },
  { value: 'bedroom', label: 'tax.bedroom' },
  { value: 'habitable', label: 'tax.habitable' },
  { value: 'corridor', label: 'tax.corridor' },
  { value: 'lobby', label: 'tax.lobby' },
  { value: 'stair', label: 'tax.stair' },
  { value: 'exit', label: 'tax.exit' },
  { value: 'utility', label: 'tax.utility' },
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
  const { t, num } = useLang();
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
      setLayerMapNote(`${t('review.layerDetection')}: ${res.rationale}`);
    }
    setAutoMappingLayers(false);
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div className="space-y-1.5">
          <p className="text-xs font-mono text-slate-500">
            {t('review.kicker', { n: project.floors.length })} ·{' '}
            {activeFloor.sourceFileName}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            {t('review.title')}
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            {t('review.lead')}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={aiReconciling}
            onClick={onRunAiReconcile}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
            {aiReconciling ? t('review.classifying') : t('review.autoClassify')}
          </button>
          <button
            type="button"
            onClick={onConfirmAndAudit}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-xs"
          >
            {t('review.confirm')}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Building-Wide Extracted Geometry Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 sm:divide-x divide-slate-200/90 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('review.stat.floors')}</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {num(project.floors.length)}F · {num(project.floors.length * project.storyHeightM, 1)} m
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('review.stat.walls')}</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {num(totalWalls)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('review.stat.doors')}</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {num(totalDoors)}{' '}
            <span className="text-xs font-normal text-red-700">
              {totalLocked > 0 ? t('review.nLocked', { n: totalLocked }) : ''}
            </span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('review.stat.rooms')}</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {num(totalRooms)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('review.stat.stairs')}</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {num(totalStairs)}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">{t('review.stat.dims')}</div>
          <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {num(totalDims)}{' '}
            <span className="text-xs font-normal text-amber-700">
              {totalStaleDims > 0 ? t('review.nMismatch', { n: totalStaleDims }) : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Plot data: not in a floor plan, so the reviewer supplies it */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              {t('review.site.title')} <span className="text-slate-500 font-normal">({t('review.site.optional')})</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {siteDeclared
                ? t('review.site.used')
                : t('review.site.empty')}
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
              {t('review.site.sprinklers')}
              <span className="font-normal text-slate-500">
                {' '}
                {t('review.site.screenRef', { d: site.sprinklered ? 22.5 : 16 })}
              </span>
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {(
            [
              [t('review.site.plotArea'), 'plotAreaSqM', 10],
              [t('review.site.road'), 'abuttingRoadWidthM', 0.5],
              [t('review.site.front'), 'frontSetbackM', 0.25],
              [t('review.site.rear'), 'rearSetbackM', 0.25],
              [t('review.site.side'), 'sideSetbackM', 0.25],
            ] as const
          ).map(([label, key, step]) => (
            <label key={key} className="block">
              <span className="text-slate-600 font-medium">{label}</span>
              <input
                type="number"
                min="0"
                step={step}
                placeholder={t('review.notEntered')}
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
          <span className="text-xs font-semibold text-slate-500 mr-1.5">{t('review.floorLevel')}</span>
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
                  {label} · {t('review.nRooms', { n: fl.rooms.length })}
                </button>
                {project.floors.length > 1 && idx > 0 && (
                  <button
                    type="button"
                    aria-label={t('review.removeFloor', { f: label })}
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
            {t('review.addFloor')}
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
            title={t('review.asRead', { f: activeFloor.floorLabel || 'GF' })}
            mode="before"
            compact
          />
          <p className="text-[11px] text-slate-500 px-1">
            {t('review.hoverHint')}
            {activeFloor.rooms[0]?.boundarySource === 'wall-enclosure'
              ? ` ${t('review.outlinesFromWalls')}`
              : ''}
          </p>
        </div>

      {/* Room Label Reconciliation Table for Selected Floor */}
      <div className="xl:col-span-7 bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">
            [{activeFloor.floorLabel || 'GF'}] {t('review.roomsTitle')}
            {lowConfidence > 0 && (
              <span className="ml-2 text-xs font-medium text-amber-700">
                {t('review.toConfirm', { n: lowConfidence })}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            {aiSource === 'gemini' ? t('review.autoClassified') : t('review.geomMatched')} · {t('review.editable')}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-600">
                <th className="py-3 px-4 font-semibold">{t('review.th.label')}</th>
                <th className="py-3 px-4 font-semibold">{t('review.th.area')}</th>
                <th className="py-3 px-4 font-semibold" title="Estimated from area with assumed factors">{t('review.th.people')}</th>
                <th className="py-3 px-4 font-semibold">{t('review.th.type')}</th>
                <th className="py-3 px-4 font-semibold">{t('review.th.why')}</th>
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
                      {room.areaSqM > 0 ? `${num(room.areaSqM, 1)} m²` : t('review.notMeasured')}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {occLoad > 0 ? t('review.people', { n: occLoad }) : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        aria-label={t('review.typeFor', { r: room.originalLabel })}
                        value={room.taxonomy}
                        onChange={(e) =>
                          onUpdateRoomTaxonomy(room.id, e.target.value as RoomTaxonomy)
                        }
                        className="bg-white border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-900 rounded-lg focus-visible:outline-2 focus-visible:outline-blue-700"
                      >
                        {TAXONOMY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {t(opt.label)}
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
                          ? t('review.you')
                          : `${num(Math.round(room.confidence * 100))}%`}
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
            [{activeFloor.floorLabel || 'GF'}] {t('review.exitsTitle')}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              {activeFloor.exitDetection === 'block-name'
                ? t('review.exits.blockName')
                : activeFloor.exitDetection === 'exterior-wall'
                  ? t('review.exits.exterior')
                  : t('review.exits.none')}
            </span>
            {activeFloor.doors.length > keyDoors.length && (
              <button
                type="button"
                onClick={() => setShowAllDoors((v) => !v)}
                className="font-semibold text-blue-800 hover:underline cursor-pointer"
              >
                {showAllDoors ? t('review.exitsOnly') : t('review.showAll', { n: activeFloor.doors.length })}
              </button>
            )}
          </div>
        </div>
        {shownDoors.length === 0 ? (
          <p className="px-5 py-4 text-xs text-slate-600">
            {activeFloor.doors.length === 0
              ? t('review.noDoors')
              : t('review.noExitMarked')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-xs text-slate-600">
                  <th className="py-2.5 px-4 font-semibold">{t('review.th.door')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('review.th.width')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('review.th.position')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('review.th.exit')}</th>
                  <th className="py-2.5 px-4 font-semibold">{t('review.th.locked')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {shownDoors.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900">
                      {d.blockName}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                      {num(d.widthM, 2)} m{' '}
                      <span className="font-sans text-slate-500">
                        {d.widthSource === 'wall-gap'
                          ? t('review.gap')
                          : d.widthSource === 'block-name'
                            ? t('review.fromBlock')
                            : t('review.assumed')}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">
                      {d.onExterior ? t('review.outerWall') : t('review.inside')}
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        type="checkbox"
                        aria-label={t('review.isExit', { d: d.blockName })}
                        checked={d.isExit}
                        onChange={(e) => onUpdateDoor(d.id, { isExit: e.target.checked })}
                        className="accent-emerald-700 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-4">
                      <input
                        type="checkbox"
                        aria-label={t('review.isLocked', { d: d.blockName })}
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
              {t('review.layers', { n: activeFloor.layersFound.length })}{' '}
              <span className="font-mono">{Array.from(new Set(activeFloor.walls.map((w) => w.layer))).join(', ') || t('common.none')}</span>
            </div>
            <button
              type="button"
              disabled={autoMappingLayers}
              onClick={() => void handleTriggerLayerMap()}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className="w-3 h-3" />
              {autoMappingLayers ? t('review.detecting') : t('review.redetect')}
            </button>
          </div>
          <div className="text-xs font-mono text-slate-600 leading-relaxed">
            {activeFloor.layersFound.join(' · ') || t('review.layer0')}
          </div>
          {layerMapNote && (
            <div className="rounded-lg text-[11px] font-mono text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2">
              {layerMapNote}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 space-y-2.5">
          <div className="text-xs font-semibold text-slate-900">
            {t('review.howRead', { f: activeFloor.floorLabel || 'GF' })}
          </div>
          <ul className="space-y-1 text-xs text-slate-700">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              {t('review.units', { u: activeFloor.units, w: num(activeFloor.bounds.widthM, 1), h: num(activeFloor.bounds.heightM, 1) })}
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              {t('review.roomsFrom')}{' '}
              {activeFloor.rooms[0]?.boundarySource === 'polyline'
                ? t('review.rooms.polyline')
                : activeFloor.rooms[0]?.boundarySource === 'wall-enclosure'
                  ? t('review.rooms.walls')
                  : t('review.rooms.labels')}
              . {t('review.gaps', { n: activeFloor.openings?.length ?? 0 })}
            </li>
            <li className="flex items-start gap-2">
              {activeFloor.stairs.every((st) => st.stated?.headroom && st.stated?.handrail) &&
              activeFloor.stairs.length > 0 ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              )}
              {t('review.stairsFound', { n: activeFloor.stairs.length })}{' '}
              {activeFloor.stairs.length === 0
                ? ''
                : activeFloor.stairs.every((st) => st.stated?.headroom && st.stated?.handrail)
                  ? t('review.hdHr.ok')
                  : t('review.hdHr.missing')}
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
