import { useMemo, useState } from 'react';
import { useLang } from '../i18n';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { EscapePathResult, ParsedFloorPlan, Point2D, Violation } from '../types/plan';

interface Blueprint2DProps {
  plan: ParsedFloorPlan;
  violations?: Violation[];
  escapePaths?: Record<string, EscapePathResult>;
  selectedViolationId?: string | null;
  selectedRoomId?: string | null;
  onSelectViolation?: (id: string) => void;
  onSelectRoom?: (roomId: string) => void;
  title?: string;
  mode?: 'before' | 'after';
  compact?: boolean;
}

export function Blueprint2D({
  plan,
  violations = [],
  escapePaths = {},
  selectedViolationId = null,
  selectedRoomId = null,
  onSelectViolation,
  onSelectRoom,
  title,
  mode = 'before',
  compact = false,
}: Blueprint2DProps) {
  const { t, num } = useLang();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragOrigin, setDragOrigin] = useState<Point2D>({ x: 0, y: 0 });
  const [showDimensions, setShowDimensions] = useState(true);
  const [showEscape, setShowEscape] = useState(true);

  const padding = 2.2;
  const vbWidth = plan.bounds.widthM + padding * 2;
  const vbHeight = plan.bounds.heightM + padding * 2;

  // Flip Y so CAD bottom-left (0,0) renders properly in SVG top-left coordinates
  const toSvg = (p: Point2D) => ({
    x: p.x - plan.bounds.minX + padding,
    y: plan.bounds.maxY - p.y + padding,
  });

  const activeEscape = useMemo(() => {
    if (selectedRoomId && escapePaths[selectedRoomId]) {
      return escapePaths[selectedRoomId];
    }
    const vals = Object.values(escapePaths);
    const blocked = vals.find((e) => e.blocked);
    if (blocked) return blocked;
    return vals.sort((a, b) => b.distanceM - a.distanceM)[0] || null;
  }, [escapePaths, selectedRoomId]);

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    // Plain scrolling must keep scrolling the page; zoom needs Ctrl or ⌘ held.
    if (!e.ctrlKey && !e.metaKey) return;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.7, Math.min(3.5, Number((z * factor).toFixed(2)))));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).dataset?.interactive === 'true') return;
    setDragging(true);
    setDragOrigin({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragOrigin.x, y: e.clientY - dragOrigin.y });
  };

  const handlePointerUp = () => setDragging(false);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const roomFill = (taxonomy: string, isSelected: boolean) => {
    if (isSelected) return 'rgba(29, 78, 216, 0.14)';
    switch (taxonomy) {
      case 'stair':
        return 'rgba(245, 158, 11, 0.10)';
      case 'corridor':
      case 'lobby':
        return 'rgba(148, 163, 184, 0.10)';
      case 'workfloor':
        return 'rgba(59, 130, 246, 0.06)';
      default:
        return 'rgba(255, 255, 255, 0.72)';
    }
  };

  return (
    <div className="border border-slate-200/90 bg-white rounded-xl shadow-xs flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs">
          <span className="font-semibold text-slate-900">
            {title || plan.name}
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono text-slate-600 tabular-nums">
            {plan.bounds.widthM.toFixed(1)} m × {plan.bounds.heightM.toFixed(1)} m
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span
            className={`font-mono font-medium ${
              mode === 'after' ? 'text-emerald-700' : 'text-slate-700'
            }`}
          >
            {mode === 'after' ? t('bp.withChanges') : t('landing.mode.before')}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowDimensions((v) => !v)}
            className={`px-2.5 py-1 border rounded-md text-xs cursor-pointer transition-colors whitespace-nowrap ${
              showDimensions
                ? 'border-slate-300 bg-white text-slate-900 font-medium shadow-2xs'
                : 'border-slate-200 bg-slate-100 text-slate-500'
            }`}
          >
            Dims
          </button>
          <button
            type="button"
            onClick={() => setShowEscape((v) => !v)}
            className={`px-2.5 py-1 border rounded-md text-xs cursor-pointer transition-colors whitespace-nowrap ${
              showEscape
                ? 'border-slate-300 bg-white text-slate-900 font-medium shadow-2xs'
                : 'border-slate-200 bg-slate-100 text-slate-500'
            }`}
          >
            Path
          </button>
          <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              aria-label={t('bp.zoomOut')}
              onClick={() => setZoom((z) => Math.max(0.7, Number((z * 0.85).toFixed(2))))}
              className="p-1.5 hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] text-slate-600 tabular-nums border-x border-slate-200">
              {num(Math.round(zoom * 100))}%
            </span>
            <button
              type="button"
              aria-label={t('bp.zoomIn')}
              onClick={() => setZoom((z) => Math.min(3.5, Number((z * 1.15).toFixed(2))))}
              className="p-1.5 hover:bg-slate-100 text-slate-700 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={t('bp.reset')}
              onClick={resetView}
              className="p-1.5 hover:bg-slate-100 text-slate-700 border-l border-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="relative blueprint-grid w-full overflow-hidden"
        style={{
          aspectRatio: `${vbWidth} / ${vbHeight}`,
          maxHeight: compact ? 440 : 560,
          minHeight: 220,
        }}
      >
        <svg
          role="img"
          aria-label={t('bp.aria', { p: title || plan.name })}
          className={`absolute inset-0 w-full h-full select-none touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          preserveAspectRatio="xMidYMid meet"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <g
            transform={`translate(${vbWidth / 2 + pan.x / 35}, ${
              vbHeight / 2 + pan.y / 35
            }) scale(${zoom}) translate(${-vbWidth / 2}, ${-vbHeight / 2})`}
          >
            {/* Minor 1m CAD grid */}
            <defs>
              <pattern
                id={`cad-grid-${mode}`}
                width="1"
                height="1"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 1 0 L 0 0 0 1"
                  fill="none"
                  stroke="#CBD5E1"
                  strokeWidth="0.025"
                  opacity="0.55"
                />
              </pattern>
            </defs>
            <rect
              x={padding}
              y={padding}
              width={plan.bounds.widthM}
              height={plan.bounds.heightM}
              fill={`url(#cad-grid-${mode})`}
            />

            {/* Room Polygons */}
            {plan.rooms.map((room) => {
              const ptsStr = room.polygon
                .map((p) => {
                  const s = toSvg(p);
                  return `${s.x},${s.y}`;
                })
                .join(' ');
              const c = toSvg(room.centroid);
              const isSelected = selectedRoomId === room.id;
              const ep = escapePaths[room.id];

              return (
                <g
                  key={room.id}
                  data-interactive="true"
                  onClick={() => onSelectRoom?.(room.id)}
                  className={onSelectRoom ? 'cursor-pointer' : ''}
                >
                  <polygon
                    points={ptsStr}
                    fill={roomFill(room.taxonomy, isSelected)}
                    stroke={isSelected ? '#1D4ED8' : '#CBD5E1'}
                    strokeWidth={isSelected ? 0.08 : 0.03}
                  />
                  <text
                    x={c.x}
                    y={c.y - 0.12}
                    textAnchor="middle"
                    fontSize="0.42"
                    fontWeight="600"
                    fill="#0F172A"
                    fontFamily="IBM Plex Mono, Noto Sans Bengali, monospace"
                  >
                    {room.originalLabel}
                  </text>
                  <text
                    x={c.x}
                    y={c.y + 0.36}
                    textAnchor="middle"
                    fontSize="0.30"
                    fill={ep?.blocked ? '#DC2626' : '#64748B'}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {room.taxonomy.toUpperCase()} · {room.areaSqM} m²
                  </text>
                </g>
              );
            })}

            {/* Stairs */}
            {plan.stairs.map((stair) => {
              const xs = stair.polygon.map((p) => toSvg(p).x);
              const ys = stair.polygon.map((p) => toSvg(p).y);
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs);
              const minY = Math.min(...ys);
              const maxY = Math.max(...ys);
              const steps = 9;
              const stepH = (maxY - minY) / steps;
              return (
                <g key={stair.id}>
                  <rect
                    x={minX}
                    y={minY}
                    width={maxX - minX}
                    height={maxY - minY}
                    fill="rgba(245, 158, 11, 0.12)"
                    stroke="#B45309"
                    strokeWidth="0.06"
                  />
                  {Array.from({ length: steps - 1 }).map((_, idx) => (
                    <line
                      key={idx}
                      x1={minX}
                      y1={minY + (idx + 1) * stepH}
                      x2={maxX}
                      y2={minY + (idx + 1) * stepH}
                      stroke="#B45309"
                      strokeWidth="0.04"
                    />
                  ))}
                </g>
              );
            })}

            {/* Walls */}
            {plan.walls.map((w) => {
              const s = toSvg(w.start);
              const e = toSvg(w.end);
              return (
                <line
                  key={w.id}
                  x1={s.x}
                  y1={s.y}
                  x2={e.x}
                  y2={e.y}
                  stroke="#0F172A"
                  strokeWidth={w.isExterior ? 0.24 : 0.15}
                  strokeLinecap="square"
                />
              );
            })}

            {/* Windows */}
            {plan.windows.map((win) => {
              const p = toSvg(win.position);
              return (
                <g
                  key={win.id}
                  transform={`translate(${p.x}, ${p.y}) rotate(${-win.rotationDeg})`}
                >
                  <line
                    x1={-win.widthM / 2}
                    y1={0}
                    x2={win.widthM / 2}
                    y2={0}
                    stroke="#0284C7"
                    strokeWidth="0.16"
                  />
                </g>
              );
            })}

            {/* Doors & Exits */}
            {plan.doors.map((door) => {
              const p = toSvg(door.position);
              const color = door.isLocked
                ? '#DC2626'
                : door.isExit
                  ? '#16A34A'
                  : '#1D4ED8';
              return (
                <g
                  key={door.id}
                  transform={`translate(${p.x}, ${p.y}) rotate(${-door.rotationDeg})`}
                >
                  <line
                    x1={-door.widthM / 2}
                    y1={0}
                    x2={door.widthM / 2}
                    y2={0}
                    stroke={color}
                    strokeWidth="0.14"
                    strokeDasharray={door.isLocked ? '0.18 0.1' : undefined}
                  />
                  {/* Architectural door swing arc */}
                  <path
                    d={`M ${-door.widthM / 2} 0 A ${door.widthM} ${door.widthM} 0 0 1 ${
                      door.widthM / 2
                    } ${door.widthM * 0.72}`}
                    fill="none"
                    stroke={color}
                    strokeWidth="0.05"
                    opacity="0.7"
                  />
                  {door.isExit && (
                    <text
                      x={0}
                      y={door.position.y > plan.bounds.minY + plan.bounds.heightM / 2 ? -0.45 : 0.65}
                      textAnchor="middle"
                      fontSize="0.34"
                      fontWeight="700"
                      fill={color}
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {door.isLocked ? t('bp.lockedExit') : t('bp.exitWidth', { w: num(door.widthM, 2) })}
                    </text>
                  )}
                </g>
              );
            })}

            {/* DXF Dimensions */}
            {showDimensions &&
              plan.dimensions.map((dim) => {
                const s = toSvg(dim.start);
                const e = toSvg(dim.end);
                const mx = (s.x + e.x) / 2;
                const my = (s.y + e.y) / 2;
                const stroke = dim.isStaleOverride ? '#D97706' : '#475569';
                return (
                  <g key={dim.id}>
                    <line
                      x1={s.x}
                      y1={s.y}
                      x2={e.x}
                      y2={e.y}
                      stroke={stroke}
                      strokeWidth="0.06"
                      strokeDasharray="0.16 0.12"
                    />
                    <circle cx={s.x} cy={s.y} r="0.09" fill={stroke} />
                    <circle cx={e.x} cy={e.y} r="0.09" fill={stroke} />
                    <rect
                      x={mx - 1.55}
                      y={my - 0.35}
                      width="3.1"
                      height="0.58"
                      fill="#FFFFFF"
                      stroke={stroke}
                      strokeWidth="0.03"
                    />
                    <text
                      x={mx}
                      y={my + 0.04}
                      textAnchor="middle"
                      fontSize="0.28"
                      fontWeight="600"
                      fill={stroke}
                      fontFamily="IBM Plex Mono, monospace"
                    >
                      {dim.isStaleOverride
                        ? `${dim.measuredValueM.toFixed(2)}m (txt:${dim.overrideText})`
                        : `${dim.measuredValueM.toFixed(2)}m`}
                    </text>
                  </g>
                );
              })}

            {/* Active Escape Path Overlay */}
            {showEscape && activeEscape && activeEscape.path.length > 1 && (
              <g>
                <polyline
                  points={activeEscape.path
                    .map((pt) => {
                      const s = toSvg(pt);
                      return `${s.x},${s.y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke={
                    activeEscape.distanceM > 16 || activeEscape.blocked
                      ? '#DC2626'
                      : '#16A34A'
                  }
                  strokeWidth="0.16"
                  strokeDasharray="0.35 0.2"
                />
                {(() => {
                  const st = toSvg(activeEscape.start);
                  return (
                    <circle
                      cx={st.x}
                      cy={st.y}
                      r="0.28"
                      fill={
                        activeEscape.distanceM > 16 ? '#DC2626' : '#16A34A'
                      }
                    />
                  );
                })()}
              </g>
            )}

            {/* Violation Marker Pins */}
            {violations.map((v, idx) => {
              const p = toSvg(v.location);
              const isSelected = selectedViolationId === v.id;
              const col = v.status === 'WARN' ? '#D97706' : '#DC2626';
              return (
                <g
                  key={v.id}
                  data-interactive="true"
                  onClick={() => onSelectViolation?.(v.id)}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="0.78"
                      fill="none"
                      stroke={col}
                      strokeWidth="0.09"
                      strokeDasharray="0.2 0.12"
                    />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isSelected ? '0.44' : '0.34'}
                    fill={col}
                    stroke="#FFFFFF"
                    strokeWidth="0.06"
                  />
                  <text
                    x={p.x}
                    y={p.y + 0.11}
                    textAnchor="middle"
                    fontSize="0.30"
                    fontWeight="700"
                    fill="#FFFFFF"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {idx + 1}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

      </div>

      <div className="px-4 py-2 border-t border-slate-200 bg-white text-[11px] text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-slate-900 inline-block" /> {t('bp.wall')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-600 inline-block" /> {t('bp.openExit')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-red-600 inline-block" /> {t('bp.lockedFail')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-amber-600 inline-block" /> {t('bp.warning')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t-2 border-dashed border-red-500 inline-block" /> {t('bp.route')}
        </span>
        <span className="ml-auto font-mono text-slate-400">{t('bp.zoomHint')}</span>
      </div>
    </div>
  );
}
