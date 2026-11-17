import { useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
}

/**
 * Interactive & animated architectural CAD blueprint backdrop.
 * Blends the looping CAD video with a crisp high-DPI vector floor plan,
 * egress flow traces, sweeping scrutiny scan line, and subtle drafting crosshair.
 */
export function HeroCadBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0.5,
    y: 0.45,
    active: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
        pointerRef.current = { x: nx, y: ny, active: true };
      } else {
        pointerRef.current.active = false;
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    const drawGrid = () => {
      const minor = 28;
      const major = minor * 4;

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      ctx.beginPath();
      for (let x = (width % major) * 0.5; x < width; x += minor) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = 16; y < height; y += minor) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(96, 165, 250, 0.11)';
      ctx.beginPath();
      for (let x = (width % major) * 0.5; x < width; x += major) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = 16; y < height; y += major) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
      }
      ctx.stroke();
    };

    const drawDoorSwing = (
      hx: number,
      hy: number,
      radius: number,
      startRad: number,
      endRad: number,
      alpha: number
    ) => {
      ctx.strokeStyle = `rgba(96, 165, 250, ${alpha})`;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(hx, hy, radius, startRad, endRad);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(endRad) * radius, hy + Math.sin(endRad) * radius);
      ctx.stroke();
    };

    const drawStaircase = (x: number, y: number, w: number, h: number, steps: number, alpha: number) => {
      ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(x, y, w, h);
      const stepW = w / steps;
      ctx.beginPath();
      for (let i = 1; i < steps; i++) {
        const sx = x + i * stepW;
        ctx.moveTo(sx, y);
        ctx.lineTo(sx, y + h);
      }
      // Stair direction arrow
      const midY = y + h * 0.5;
      ctx.moveTo(x + 8, midY);
      ctx.lineTo(x + w - 8, midY);
      ctx.lineTo(x + w - 15, midY - 4);
      ctx.moveTo(x + w - 8, midY);
      ctx.lineTo(x + w - 15, midY + 4);
      ctx.stroke();
    };

    const drawDimensionLeader = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      label: string,
      highlight: number
    ) => {
      const alpha = 0.22 + highlight * 0.45;
      ctx.strokeStyle = `rgba(147, 197, 253, ${alpha})`;
      ctx.fillStyle = `rgba(219, 234, 254, ${Math.min(0.9, alpha + 0.15)})`;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      // Ticks
      const isHoriz = Math.abs(y2 - y1) < 2;
      if (isHoriz) {
        ctx.moveTo(x1, y1 - 4);
        ctx.lineTo(x1, y1 + 4);
        ctx.moveTo(x2, y2 - 4);
        ctx.lineTo(x2, y2 + 4);
      } else {
        ctx.moveTo(x1 - 4, y1);
        ctx.lineTo(x1 + 4, y1);
        ctx.moveTo(x2 - 4, y2);
        ctx.lineTo(x2 + 4, y2);
      }
      ctx.stroke();

      ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mx = (x1 + x2) * 0.5;
      const my = (y1 + y2) * 0.5 + (isHoriz ? -9 : 0);
      if (!isHoriz) {
        ctx.save();
        ctx.translate(mx - 10, my);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(label, mx, my);
      }
    };

    const drawAnimatedRoute = (pts: Point[], phase: number, color: string) => {
      if (pts.length < 2) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.75;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -phase * 48;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      ctx.restore();

      // Origin & exit node markers along the architectural route
      const start = pts[0];
      const end = pts[pts.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(start.x, start.y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(end.x - 4, end.y - 4, 8, 8);
    };

    const renderFrame = (timeMs: number) => {
      ctx.clearRect(0, 0, width, height);
      drawGrid();

      const t = prefersReducedMotion ? 0 : timeMs * 0.001;
      const scanProgress = prefersReducedMotion ? 0.32 : (t * 0.11) % 1.25 - 0.12;
      const scanX = scanProgress * width;

      const intensityAt = (cx: number) => {
        const dist = Math.abs(cx - scanX);
        return Math.max(0, 1 - dist / 180);
      };

      const isWide = width >= 900;
      const padX = isWide ? Math.max(28, width * 0.035) : 16;
      const wingW = isWide ? Math.min(310, width * 0.24) : Math.min(200, width * 0.42);
      const wingH = Math.min(290, height * 0.54);
      const wingY = Math.max(28, height * 0.13);

      // Left Architectural Wing (Habitable Suites & Corridor)
      const lx = padX;
      const ly = wingY;
      const lGlow = intensityAt(lx + wingW * 0.5);

      ctx.strokeStyle = `rgba(203, 213, 225, ${0.14 + lGlow * 0.24})`;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(lx, ly, wingW, wingH);

      // Inner room partitions on left wing
      const roomH = wingH * 0.44;
      const midRoomX = lx + wingW * 0.52;
      ctx.beginPath();
      // Top rooms
      ctx.moveTo(lx, ly + roomH);
      ctx.lineTo(lx + wingW * 0.36, ly + roomH);
      ctx.moveTo(lx + wingW * 0.48, ly + roomH);
      ctx.lineTo(midRoomX, ly + roomH);
      ctx.moveTo(midRoomX, ly);
      ctx.lineTo(midRoomX, ly + roomH);
      // Right vertical partition in top bay
      ctx.moveTo(midRoomX + wingW * 0.09, ly + roomH);
      ctx.lineTo(lx + wingW, ly + roomH);
      // Bottom service bay
      ctx.moveTo(lx + wingW * 0.42, ly + wingH * 0.64);
      ctx.lineTo(lx + wingW, ly + wingH * 0.64);
      ctx.moveTo(lx + wingW * 0.42, ly + wingH * 0.64);
      ctx.lineTo(lx + wingW * 0.42, ly + wingH);
      ctx.stroke();

      // Door swings in left wing
      drawDoorSwing(lx + wingW * 0.36, ly + roomH, 24, 0, Math.PI * 0.5, 0.28 + lGlow * 0.35);
      drawDoorSwing(midRoomX + wingW * 0.09, ly + roomH, 22, Math.PI * 0.5, Math.PI, 0.24 + lGlow * 0.35);

      // Left stair core
      drawStaircase(lx + 14, ly + wingH * 0.68, wingW * 0.31, wingH * 0.24, 9, 0.22 + lGlow * 0.3);

      // Dimension annotations on left wing
      drawDimensionLeader(lx, ly - 14, midRoomX, ly - 14, '4.80 m', lGlow);
      if (isWide) {
        drawDimensionLeader(lx - 14, ly, lx - 14, ly + roomH, '3.60 m', lGlow);
      }

      // Egress trace in left wing
      drawAnimatedRoute(
        [
          { x: lx + wingW * 0.26, y: ly + roomH * 0.48 },
          { x: lx + wingW * 0.42, y: ly + roomH * 0.48 },
          { x: lx + wingW * 0.42, y: ly + wingH * 0.54 },
          { x: lx + wingW * 0.14, y: ly + wingH * 0.54 },
          { x: lx + wingW * 0.14, y: ly + wingH * 0.8 },
        ],
        t,
        `rgba(52, 211, 153, ${0.38 + lGlow * 0.35})`
      );

      // Right Architectural Wing (Multi-Exit Core & Floor Bays)
      const rx = width - padX - wingW;
      const ry = wingY + (isWide ? 16 : 6);
      const rGlow = intensityAt(rx + wingW * 0.5);

      ctx.strokeStyle = `rgba(203, 213, 225, ${0.14 + rGlow * 0.24})`;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(rx, ry, wingW, wingH);

      // Right wing rooms & corridor
      const corrY = ry + wingH * 0.48;
      ctx.beginPath();
      ctx.moveTo(rx, corrY);
      ctx.lineTo(rx + wingW * 0.56, corrY);
      ctx.moveTo(rx + wingW * 0.68, corrY);
      ctx.lineTo(rx + wingW, corrY);
      ctx.moveTo(rx + wingW * 0.45, ry);
      ctx.lineTo(rx + wingW * 0.45, corrY);
      ctx.moveTo(rx + wingW * 0.52, ry + wingH * 0.65);
      ctx.lineTo(rx + wingW, ry + wingH * 0.65);
      ctx.moveTo(rx + wingW * 0.52, ry + wingH * 0.65);
      ctx.lineTo(rx + wingW * 0.52, ry + wingH);
      ctx.stroke();

      drawDoorSwing(rx + wingW * 0.56, corrY, 22, -Math.PI * 0.5, 0, 0.28 + rGlow * 0.35);
      drawStaircase(rx + wingW * 0.58, ry + wingH * 0.7, wingW * 0.34, wingH * 0.22, 9, 0.22 + rGlow * 0.3);

      drawDimensionLeader(rx, ry - 14, rx + wingW * 0.45, ry - 14, '12.4 m', rGlow);
      if (isWide) {
        drawDimensionLeader(rx + wingW + 14, ry, rx + wingW + 14, ry + wingH, '21.6 m', rGlow);
      }

      // Egress trace in right wing
      drawAnimatedRoute(
        [
          { x: rx + wingW * 0.22, y: ry + wingH * 0.24 },
          { x: rx + wingW * 0.62, y: ry + wingH * 0.24 },
          { x: rx + wingW * 0.62, y: ry + wingH * 0.56 },
          { x: rx + wingW * 0.74, y: ry + wingH * 0.56 },
          { x: rx + wingW * 0.74, y: ry + wingH * 0.81 },
        ],
        t + 0.5,
        `rgba(96, 165, 250, ${0.42 + rGlow * 0.38})`
      );

      // Structural column bubbles along bottom blueprint horizon
      if (isWide) {
        const markers = ['A', 'B', 'C', 'D', 'E'];
        ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        markers.forEach((lbl, idx) => {
          const mx = width * (0.12 + idx * 0.19);
          const my = 18;
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
          ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';
          ctx.beginPath();
          ctx.arc(mx, my, 9, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillText(lbl, mx, my + 0.5);
        });
      }

      // Subtle laser scrutiny scan beam across drawing
      if (!prefersReducedMotion && scanX >= -140 && scanX <= width + 140) {
        const grad = ctx.createLinearGradient(scanX - 110, 0, scanX + 12, 0);
        grad.addColorStop(0, 'rgba(37, 99, 235, 0)');
        grad.addColorStop(0.85, 'rgba(59, 130, 246, 0.08)');
        grad.addColorStop(1, 'rgba(96, 165, 250, 0.24)');
        ctx.fillStyle = grad;
        ctx.fillRect(scanX - 110, 0, 122, height);

        ctx.strokeStyle = 'rgba(96, 165, 250, 0.42)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(scanX, 0);
        ctx.lineTo(scanX, height);
        ctx.stroke();
      }

      // Subtle CAD drafting crosshair on desktop pointer hover
      if (pointerRef.current.active && isWide) {
        const px = pointerRef.current.x * width;
        const py = pointerRef.current.y * height;
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - 22, py);
        ctx.lineTo(px + 22, py);
        ctx.moveTo(px, py - 22);
        ctx.lineTo(px, py + 22);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(96, 165, 250, 0.28)';
        ctx.strokeRect(px - 5, py - 5, 10, 10);
      }
    };

    if (prefersReducedMotion) {
      renderFrame(0);
    } else {
      const tick = (now: number) => {
        renderFrame(now);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base deep architectural blueprint surface */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_50%_15%,#162647_0%,#0B1426_60%,#080F1D_100%)]" />

      {/* Looping CAD simulation video blended cleanly */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen"
      >
        <source src="/hero-egress-bg.mp4" type="video/mp4" />
      </video>

      {/* Precision vector CAD floor plan + egress scan canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Center focal scrim preserving >10:1 headline contrast */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 62% at 50% 42%, rgba(9, 17, 34, 0.88) 0%, rgba(9, 17, 34, 0.56) 58%, rgba(9, 17, 34, 0.14) 100%)',
        }}
      />

      {/* Subtle bottom edge shadow into Live CAD Inspector seam */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-[#070D19]/80" />
    </div>
  );
}
