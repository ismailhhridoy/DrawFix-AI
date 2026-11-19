import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../i18n';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import type {
  BuildingProject,
  ComplianceAudit,
  EscapePathResult,
  Point2D,
  Point3D,
} from '../types/plan';

interface Viewport3DProps {
  beforeProject: BuildingProject;
  beforeAudit: ComplianceAudit;
  afterProject: BuildingProject;
  afterAudit: ComplianceAudit;
  initialMode?: 'before' | 'after';
  initialRoomId?: string | null;
  initialFloorFocus?: number | 'all';
  onStateChange?: (
    mode: 'before' | 'after',
    roomId: string,
    floorFocus: number | 'all'
  ) => void;
}

const _vec3 = new THREE.Vector3();
const _targetVec = new THREE.Vector3();

function createProceduralGridTexture(
  widthM: number,
  heightM: number,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1.5;
  const stepX = 1024 / Math.max(1, widthM);
  const stepY = 1024 / Math.max(1, heightM);

  for (let x = 0; x <= 1024; x += stepX) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1024);
    ctx.stroke();
  }
  for (let y = 0; y <= 1024; y += stepY) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createFloorBadgeSprite(label: string, elevText: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, 320, 96);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 316, 92);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 22, 48);

  ctx.fillStyle = '#93C5FD';
  ctx.font = '500 26px "IBM Plex Mono", monospace';
  ctx.fillText(elevText, 128, 48);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.2, 1.26, 1);
  return sprite;
}

function buildCompositeEvacuee(): {
  root: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  ring: THREE.Mesh;
} {
  const root = new THREE.Group();

  const vestMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.45,
    metalness: 0.1,
  });
  const trouserMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.05,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.25,
    metalness: 0.2,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe2a984,
    roughness: 0.6,
  });

  const legGeo = new THREE.BoxGeometry(0.14, 0.72, 0.16);
  const leftLeg = new THREE.Mesh(legGeo, trouserMat);
  leftLeg.position.set(-0.1, 0.36, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, trouserMat);
  rightLeg.position.set(0.1, 0.36, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.58, 0.24), vestMat);
  torso.position.set(0, 1.01, 0);
  torso.castShadow = true;
  root.add(torso);

  const armGeo = new THREE.BoxGeometry(0.11, 0.52, 0.13);
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.set(-0.28, 0.98, 0);
  root.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, skinMat);
  rightArm.position.set(0.28, 0.98, 0);
  root.add(rightArm);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), skinMat);
  head.position.set(0, 1.46, 0);
  root.add(head);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    helmetMat
  );
  helmet.position.set(0, 1.49, 0);
  helmet.castShadow = true;
  root.add(helmet);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.48, 28),
    new THREE.MeshBasicMaterial({
      color: 0x1d4ed8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  root.add(ring);

  return { root, leftLeg, rightLeg, leftArm, rightArm, ring };
}

function buildCompositeDoorGroup(
  widthM: number,
  isExit: boolean,
  isLocked: boolean,
  isStairDoor = false
): THREE.Group {
  const g = new THREE.Group();
  const doorH = 2.25;
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.35,
    metalness: 0.65,
  });

  const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorH, 0.22), frameMat);
  leftJamb.position.set(-widthM / 2, doorH / 2, 0);
  g.add(leftJamb);

  const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.08, doorH, 0.22), frameMat);
  rightJamb.position.set(widthM / 2, doorH / 2, 0);
  g.add(rightJamb);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(widthM + 0.16, 0.1, 0.22), frameMat);
  lintel.position.set(0, doorH + 0.05, 0);
  g.add(lintel);

  if (isExit || isStairDoor) {
    const signColor = isLocked ? 0xdc2626 : 0x16a34a;
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(widthM, 0.9), 0.24, 0.14),
      new THREE.MeshStandardMaterial({
        color: signColor,
        emissive: signColor,
        emissiveIntensity: 0.55,
        roughness: 0.3,
      })
    );
    sign.position.set(0, doorH + 0.26, 0);
    g.add(sign);

    if (isLocked) {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(widthM - 0.08, doorH - 0.05, 0.08),
        new THREE.MeshStandardMaterial({
          color: 0x991b1b,
          roughness: 0.5,
          metalness: 0.3,
        })
      );
      leaf.position.set(0, doorH / 2, 0);
      g.add(leaf);

      const barMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        roughness: 0.3,
        metalness: 0.4,
      });
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.9, 0.08, 0.14), barMat);
      bar1.position.set(0, doorH * 0.5, 0);
      bar1.rotation.z = 0.55;
      g.add(bar1);

      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.9, 0.08, 0.14), barMat);
      bar2.position.set(0, doorH * 0.5, 0);
      bar2.rotation.z = -0.55;
      g.add(bar2);
    } else {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(widthM * 0.88, doorH - 0.05, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0x15803d,
          roughness: 0.45,
          metalness: 0.25,
        })
      );
      leaf.position.set(-widthM / 2 + 0.05, doorH / 2, widthM * 0.42);
      leaf.rotation.y = Math.PI / 2.2;
      g.add(leaf);
    }
  } else {
    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(widthM * 0.88, doorH - 0.05, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.55,
        metalness: 0.15,
      })
    );
    leaf.position.set(-widthM / 2 + 0.04, doorH / 2, widthM * 0.42);
    leaf.rotation.y = Math.PI / 2.3;
    g.add(leaf);
  }

  return g;
}

export function Viewport3D({
  beforeProject,
  beforeAudit,
  afterProject,
  afterAudit,
  initialMode = 'before',
  initialRoomId = null,
  initialFloorFocus = 'all',
  onStateChange,
}: Viewport3DProps) {
  const { t, num } = useLang();
  const [mode, setMode] = useState<'before' | 'after'>(initialMode);
  const [dockOpen, setDockOpen] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [speedMult, setSpeedMult] = useState<1 | 2>(1);
  const [cameraPreset, setCameraPreset] = useState<'iso' | 'top' | 'follow'>('iso');
  const [floorFocus, setFloorFocus] = useState<number | 'all'>(initialFloorFocus);
  const [exploded, setExploded] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [webglError, setWebglError] = useState<string | null>(null);

  const activeProject = mode === 'before' ? beforeProject : afterProject;
  const activeAudit = mode === 'before' ? beforeAudit : afterAudit;
  const isMultiFloor = activeProject.floors.length > 1;
  const storyGap =
    isMultiFloor && exploded
      ? Math.max(5.6, activeProject.storyHeightM + 2.4)
      : activeProject.storyHeightM;

  const allRooms = useMemo(
    () => activeProject.floors.flatMap((fl) => fl.rooms),
    [activeProject]
  );

  const selectableRoomsByFloor = useMemo(
    () =>
      activeProject.floors.map((fl, idx) => ({
        floorIndex: fl.floorIndex ?? idx,
        floorLabel: fl.floorLabel || (idx === 0 ? 'GF' : `L${idx + 1}`),
        floorName: fl.floorName || (idx === 0 ? 'Ground Floor' : `Level ${idx + 1}`),
        rooms: fl.rooms.filter(
          (r) => r.taxonomy !== 'corridor' && r.taxonomy !== 'exit' && r.taxonomy !== 'stair'
        ),
      })),
    [activeProject]
  );

  const defaultRoomId = useMemo(() => {
    if (initialRoomId && allRooms.some((r) => r.id === initialRoomId)) {
      return initialRoomId;
    }
    const sorted = Object.values(beforeAudit.escapePaths)
      .filter((e) => !e.blocked)
      .sort((a, b) => b.estimatedTimeSec - a.estimatedTimeSec);
    return (
      sorted[0]?.roomId ||
      selectableRoomsByFloor[selectableRoomsByFloor.length - 1]?.rooms[0]?.id ||
      allRooms[0]?.id ||
      ''
    );
  }, [initialRoomId, allRooms, beforeAudit, selectableRoomsByFloor]);

  const [selectedRoomId, setSelectedRoomId] = useState<string>(defaultRoomId);

  useEffect(() => {
    if (!allRooms.some((r) => r.id === selectedRoomId)) {
      setSelectedRoomId(defaultRoomId);
    }
  }, [allRooms, selectedRoomId, defaultRoomId]);

  const activeEscape: EscapePathResult | null =
    activeAudit.escapePaths[selectedRoomId] ||
    Object.values(activeAudit.escapePaths)[0] ||
    null;

  const beforeEscape = beforeAudit.escapePaths[selectedRoomId];
  const afterEscape = afterAudit.escapePaths[selectedRoomId];

  useEffect(() => {
    onStateChange?.(mode, selectedRoomId, floorFocus);
  }, [mode, selectedRoomId, floorFocus, onStateChange]);

  const buildingBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const fl of activeProject.floors) {
      minX = Math.min(minX, fl.bounds.minX);
      minY = Math.min(minY, fl.bounds.minY);
      maxX = Math.max(maxX, fl.bounds.maxX);
      maxY = Math.max(maxY, fl.bounds.maxY);
    }
    const widthM = Math.max(4, maxX - minX);
    const heightM = Math.max(4, maxY - minY);
    return {
      minX,
      minY,
      maxX,
      maxY,
      widthM,
      heightM,
      centerX: minX + widthM / 2,
      centerZ: minY + heightM / 2,
    };
  }, [activeProject]);

  // Compute world-space 3D polyline points for active escape path
  const activePathWorldPts = useMemo(() => {
    if (!activeEscape) return [] as THREE.Vector3[];
    const cx = buildingBounds.centerX;
    const cz = buildingBounds.centerZ;
    const rawPts: Point3D[] =
      activeEscape.path3D && activeEscape.path3D.length > 0
        ? activeEscape.path3D
        : activeEscape.path.map((p) => ({
            x: p.x,
            y: p.y,
            floorIndex: activeEscape.floorIndex ?? 0,
            localElevationM: 0.14,
          }));
    return rawPts.map((p) => {
      const elev =
        p.localElevationM > 0.25
          ? (p.localElevationM / Math.max(0.1, activeProject.storyHeightM)) * storyGap
          : p.localElevationM;
      return new THREE.Vector3(
        p.x - cx,
        p.floorIndex * storyGap + elev,
        -(p.y - cz)
      );
    });
  }, [activeEscape, buildingBounds, activeProject.storyHeightM, storyGap]);

  const canvasMountRef = useRef<HTMLDivElement>(null);
  const simStateRef = useRef({
    playing: true,
    speedMult: 1 as 1 | 2,
    cameraPreset: 'iso' as 'iso' | 'top' | 'follow',
    elapsedSec: 0,
    activeEscape: null as EscapePathResult | null,
    worldPts: [] as THREE.Vector3[],
    centerX: 0,
    centerZ: 0,
    storyGap: 3.2,
  });

  useEffect(() => {
    simStateRef.current.playing = playing;
    simStateRef.current.speedMult = speedMult;
    simStateRef.current.cameraPreset = cameraPreset;
    simStateRef.current.activeEscape = activeEscape;
    simStateRef.current.worldPts = activePathWorldPts;
    simStateRef.current.centerX = buildingBounds.centerX;
    simStateRef.current.centerZ = buildingBounds.centerZ;
    simStateRef.current.storyGap = storyGap;
  }, [
    playing,
    speedMult,
    cameraPreset,
    activeEscape,
    activePathWorldPts,
    buildingBounds,
    storyGap,
  ]);

  useEffect(() => {
    simStateRef.current.elapsedSec = 0;
    setElapsedSec(0);
  }, [mode, selectedRoomId]);

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    planGroup: THREE.Group;
    pathGroup: THREE.Group;
    actor: ReturnType<typeof buildCompositeEvacuee>;
    clickableRooms: THREE.Mesh[];
    cameraTransition: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
    requestRender: () => void;
    isSoftwareGl: boolean;
  } | null>(null);

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL is unavailable in this browser session.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL context lost. Reloading viewport...');
    };
    const onContextRestored = () => setWebglError(null);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8edf3);
    scene.fog = new THREE.FogExp2(0xe8edf3, 0.008);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.2,
      260
    );
    camera.position.set(22, 24, 28);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 4;
    controls.maxDistance = 120;

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x94a3b8, 0.78);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    keyLight.position.set(22, 34, 20);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -28;
    keyLight.shadow.camera.right = 28;
    keyLight.shadow.camera.top = 28;
    keyLight.shadow.camera.bottom = -28;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.48);
    rimLight.position.set(-20, 16, -16);
    scene.add(rimLight);

    const planGroup = new THREE.Group();
    const pathGroup = new THREE.Group();
    const actor = buildCompositeEvacuee();
    scene.add(planGroup);
    scene.add(pathGroup);
    scene.add(actor.root);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();
    let uiTimerAccum = 0;
    let cameraTransition: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;

    controls.addEventListener('start', () => {
      cameraTransition = null;
      if (sceneRefs.current) sceneRefs.current.cameraTransition = null;
    });

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', () => {
      if (!simStateRef.current.playing) requestRender();
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return;
      if (!sceneRefs.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(sceneRefs.current.clickableRooms, false);
      if (hits.length > 0) {
        const roomId = hits[0].object.userData.roomId as string | undefined;
        if (roomId) setSelectedRoomId(roomId);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    sceneRefs.current = {
      scene,
      camera,
      renderer,
      controls,
      planGroup,
      pathGroup,
      actor,
      clickableRooms: [],
      cameraTransition,
      requestRender,
      isSoftwareGl,
    };

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const refs = sceneRefs.current;
      const sim = simStateRef.current;

      if (refs) {
        if (refs.cameraTransition) {
          camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            refs.cameraTransition.pos.x,
            6,
            dt
          );
          camera.position.y = THREE.MathUtils.damp(
            camera.position.y,
            refs.cameraTransition.pos.y,
            6,
            dt
          );
          camera.position.z = THREE.MathUtils.damp(
            camera.position.z,
            refs.cameraTransition.pos.z,
            6,
            dt
          );
          controls.target.x = THREE.MathUtils.damp(
            controls.target.x,
            refs.cameraTransition.target.x,
            6,
            dt
          );
          controls.target.y = THREE.MathUtils.damp(
            controls.target.y,
            refs.cameraTransition.target.y,
            6,
            dt
          );
          controls.target.z = THREE.MathUtils.damp(
            controls.target.z,
            refs.cameraTransition.target.z,
            6,
            dt
          );
          if (camera.position.distanceTo(refs.cameraTransition.pos) < 0.08) {
            refs.cameraTransition = null;
          }
        }

        const ep = sim.activeEscape;
        const pts = sim.worldPts;
        if (ep && !ep.blocked && pts.length >= 2) {
          actor.root.visible = true;
          const totalDur = Math.max(0.5, ep.estimatedTimeSec);
          if (sim.playing) {
            sim.elapsedSec = (sim.elapsedSec + dt * sim.speedMult) % (totalDur + 1.8);
            uiTimerAccum += dt;
            if (uiTimerAccum > 0.08) {
              uiTimerAccum = 0;
              setElapsedSec(Math.min(totalDur, sim.elapsedSec));
            }
          }

          const progress = Math.min(1, sim.elapsedSec / totalDur);

          let total3DLen = 0;
          for (let i = 1; i < pts.length; i++) {
            total3DLen += pts[i].distanceTo(pts[i - 1]);
          }
          const targetDist = progress * total3DLen;

          let acc = 0;
          let posX = pts[0].x;
          let posY = pts[0].y;
          let posZ = pts[0].z;
          let heading = 0;

          for (let i = 1; i < pts.length; i++) {
            const p0 = pts[i - 1];
            const p1 = pts[i];
            const segLen = p1.distanceTo(p0);
            if (acc + segLen >= targetDist || i === pts.length - 1) {
              const frac = segLen > 1e-4 ? Math.min(1, (targetDist - acc) / segLen) : 1;
              posX = p0.x + (p1.x - p0.x) * frac;
              posY = p0.y + (p1.y - p0.y) * frac;
              posZ = p0.z + (p1.z - p0.z) * frac;
              const dx = p1.x - p0.x;
              const dz = p1.z - p0.z;
              if (Math.hypot(dx, dz) > 0.05) {
                heading = Math.atan2(dx, dz);
              }
              break;
            }
            acc += segLen;
          }

          actor.root.position.set(posX, Math.max(0.02, posY - 0.12), posZ);
          actor.root.rotation.y = heading;

          const moving = sim.playing && progress < 1;
          const phase = sim.elapsedSec * 9.5;
          const swing = moving ? Math.sin(phase) * 0.45 : 0;
          actor.leftLeg.rotation.x = swing;
          actor.rightLeg.rotation.x = -swing;
          actor.leftArm.rotation.x = -swing * 0.7;
          actor.rightArm.rotation.x = swing * 0.7;

          if (sim.cameraPreset === 'follow' && !refs.cameraTransition) {
            _targetVec.set(posX, posY + 0.9, posZ);
            controls.target.lerp(_targetVec, 1 - Math.exp(-5 * dt));
            _vec3.set(posX + 6.0, posY + 6.5, posZ + 7.0);
            camera.position.lerp(_vec3, 1 - Math.exp(-3.5 * dt));
          }
        } else if (ep) {
          const originFloorIdx = ep.floorIndex ?? 0;
          actor.root.visible = true;
          actor.root.position.set(
            ep.start.x - sim.centerX,
            originFloorIdx * sim.storyGap + 0.02,
            -(ep.start.y - sim.centerZ)
          );
          actor.leftLeg.rotation.x = 0;
          actor.rightLeg.rotation.x = 0;
        }

        controls.update();
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    if (!isSoftwareGl) renderer.compile(scene, camera);
    frameId = requestAnimationFrame(tick);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRefs.current = null;
    };
  }, []);

  // Rebuild stacked multi-floor 3D geometry whenever project, mode, focus, or exploded changes
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    const { planGroup, renderer } = refs;
    while (planGroup.children.length > 0) {
      planGroup.remove(planGroup.children[0]);
    }
    refs.clickableRooms = [];

    const cx = buildingBounds.centerX;
    const cz = buildingBounds.centerZ;
    const totalStackHeight = Math.max(
      3.2,
      (activeProject.floors.length - 1) * storyGap + activeProject.storyHeightM
    );
    const span = Math.max(buildingBounds.widthM, buildingBounds.heightM, totalStackHeight);

    refs.controls.maxDistance = Math.max(70, span * 2.5);
    refs.scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
        const d = Math.max(24, span * 0.72);
        obj.shadow.camera.left = -d;
        obj.shadow.camera.right = d;
        obj.shadow.camera.top = d;
        obj.shadow.camera.bottom = -d;
        obj.shadow.camera.updateProjectionMatrix();
      }
    });

    if (
      refs.camera.position.length() < span * 0.75 &&
      !refs.cameraTransition
    ) {
      const midY = (activeProject.floors.length - 1) * storyGap * 0.45;
      refs.camera.position.set(span * 0.65, midY + span * 0.62, span * 0.88);
      refs.controls.target.set(0, midY * 0.8, 0);
      refs.controls.update();
    }

    const to3D = (pt: Point2D): [number, number] => [pt.x - cx, -(pt.y - cz)];

    // Ground site slab + grid at y = 0
    const slabW = buildingBounds.widthM + 8;
    const slabH = buildingBounds.heightM + 8;
    const groundSlab = new THREE.Mesh(
      new THREE.BoxGeometry(slabW, 0.3, slabH),
      new THREE.MeshStandardMaterial({
        color: 0xdbe3ec,
        roughness: 0.9,
        metalness: 0.05,
      })
    );
    groundSlab.position.set(0, -0.15, 0);
    groundSlab.receiveShadow = true;
    planGroup.add(groundSlab);

    const gridTex = createProceduralGridTexture(
      buildingBounds.widthM,
      buildingBounds.heightM,
      renderer.capabilities.getMaxAnisotropy()
    );
    const groundGrid = new THREE.Mesh(
      new THREE.PlaneGeometry(buildingBounds.widthM, buildingBounds.heightM),
      new THREE.MeshStandardMaterial({
        map: gridTex,
        roughness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    groundGrid.rotation.x = -Math.PI / 2;
    groundGrid.position.y = 0.01;
    groundGrid.receiveShadow = true;
    planGroup.add(groundGrid);

    const wallHeight = Math.min(2.65, activeProject.storyHeightM - 0.15);
    const stepMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.65 });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.28,
      metalness: 0.75,
    });

    activeProject.floors.forEach((floor, fIdx) => {
      if (floorFocus !== 'all' && fIdx > floorFocus) return;

      const isDimmed = floorFocus !== 'all' && fIdx < floorFocus;
      const yOffset = fIdx * storyGap;
      const floorGroup = new THREE.Group();
      floorGroup.position.y = yOffset;
      planGroup.add(floorGroup);

      const floorLabel = floor.floorLabel || (fIdx === 0 ? 'GF' : `L${fIdx + 1}`);
      const elevStr =
        fIdx === 0
          ? '0.0 m'
          : `+${(fIdx * activeProject.storyHeightM).toFixed(1)} m`;

      // Floor badge sprite along west facade
      if (isMultiFloor) {
        const badge = createFloorBadgeSprite(floorLabel, elevStr);
        badge.position.set(
          -buildingBounds.widthM / 2 - 2.6,
          wallHeight * 0.55,
          0
        );
        floorGroup.add(badge);
      }

      // Upper floor translucent slab + perimeter outline
      if (fIdx > 0) {
        const upperSlab = new THREE.Mesh(
          new THREE.BoxGeometry(floor.bounds.widthM, 0.14, floor.bounds.heightM),
          new THREE.MeshStandardMaterial({
            color: 0xcbd5e1,
            roughness: 0.85,
            transparent: true,
            opacity: isDimmed ? 0.18 : 0.34,
            depthWrite: false,
          })
        );
        upperSlab.position.set(
          floor.bounds.minX + floor.bounds.widthM / 2 - cx,
          -0.07,
          -(floor.bounds.minY + floor.bounds.heightM / 2 - cz)
        );
        floorGroup.add(upperSlab);
      }

      // Clickable room floor overlays
      for (const room of floor.rooms) {
        if (room.polygon.length < 3) continue;
        const shape = new THREE.Shape();
        room.polygon.forEach((pt, idx) => {
          const [x, z] = to3D(pt);
          if (idx === 0) shape.moveTo(x, -z);
          else shape.lineTo(x, -z);
        });
        shape.closePath();

        const isSelected = room.id === selectedRoomId;
        const ep = activeAudit.escapePaths[room.id];
        const baseColor = isSelected
          ? 0x93c5fd
          : ep?.blocked
            ? 0xfecaca
            : room.taxonomy === 'stair'
              ? 0xfde68a
              : 0xf8fafc;

        const roomMesh = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: 0.8,
            transparent: true,
            opacity: isDimmed ? 0.25 : isSelected ? 0.88 : fIdx > 0 ? 0.56 : 0.72,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            depthWrite: fIdx === 0,
          })
        );
        roomMesh.rotation.x = -Math.PI / 2;
        roomMesh.position.y = 0.025;
        roomMesh.receiveShadow = fIdx === 0;
        roomMesh.userData.roomId = room.id;
        roomMesh.userData.floorIndex = fIdx;
        floorGroup.add(roomMesh);
        refs.clickableRooms.push(roomMesh);
      }

      // Extruded Architectural Walls
      const wallMatExt = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.78,
        metalness: 0.08,
        transparent: isDimmed || fIdx > 0,
        opacity: isDimmed ? 0.22 : fIdx > 0 ? 0.88 : 1.0,
      });
      const wallMatInt = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.72,
        metalness: 0.05,
        transparent: isDimmed || fIdx > 0,
        opacity: isDimmed ? 0.22 : fIdx > 0 ? 0.85 : 1.0,
      });

      for (const w of floor.walls) {
        const [x1, z1] = to3D(w.start);
        const [x2, z2] = to3D(w.end);
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 0.05) continue;
        const wallMesh = new THREE.Mesh(
          new THREE.BoxGeometry(len, wallHeight, w.thickness),
          w.isExterior ? wallMatExt : wallMatInt
        );
        wallMesh.position.set((x1 + x2) / 2, wallHeight / 2, (z1 + z2) / 2);
        wallMesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        wallMesh.castShadow = fIdx === 0;
        wallMesh.receiveShadow = true;
        floorGroup.add(wallMesh);
      }

      // Composite Doors & Exits
      for (const door of floor.doors) {
        const [dx, dz] = to3D(door.position);
        const isStairDoor = /STAIR|FIRE/i.test(door.blockName);
        const doorGrp = buildCompositeDoorGroup(
          door.widthM,
          door.isExit,
          door.isLocked,
          isStairDoor
        );
        doorGrp.position.set(dx, 0, dz);
        doorGrp.rotation.y = (door.rotationDeg * Math.PI) / 180;
        floorGroup.add(doorGrp);
      }

      // Multi-story Stair Flights: on upper floors (fIdx > 0), flight bridges down to floor below;
      // on single-floor buildings, render ground flight ascending inside core.
      for (const stair of floor.stairs) {
        const xs = stair.polygon.map((p) => to3D(p)[0]);
        const zs = stair.polygon.map((p) => to3D(p)[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minZ = Math.min(...zs);
        const maxZ = Math.max(...zs);
        const w = maxX - minX;
        const d = maxZ - minZ;

        if (isMultiFloor && fIdx === 0) {
          // Ground floor landing pad only (upper flights drop into this core from L2)
          const pad = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.92, 0.08, d * 0.92),
            stepMat
          );
          pad.position.set((minX + maxX) / 2, 0.04, (minZ + maxZ) / 2);
          floorGroup.add(pad);
          continue;
        }

        const flightRise = isMultiFloor ? storyGap : 2.2;
        const flightBaseY = isMultiFloor ? -storyGap : 0;
        const steps = isMultiFloor ? 12 : 10;

        for (let i = 0; i < steps; i++) {
          const tread = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.88, 0.14, d / steps),
            stepMat
          );
          tread.position.set(
            (minX + maxX) / 2,
            flightBaseY + ((i + 0.5) / steps) * flightRise,
            minZ + ((i + 0.5) * d) / steps
          );
          tread.castShadow = fIdx === 0;
          floorGroup.add(tread);
        }

        const railLen = Math.hypot(d, flightRise);
        const rail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, railLen, 8),
          railMat
        );
        rail.position.set(
          minX + 0.14,
          flightBaseY + flightRise * 0.5 + stair.handrailHeightM * 0.45,
          (minZ + maxZ) / 2
        );
        rail.rotation.x = Math.atan2(d, flightRise);
        floorGroup.add(rail);
      }
    });

    refs.requestRender();
  }, [
    activeProject,
    activeAudit,
    selectedRoomId,
    floorFocus,
    storyGap,
    isMultiFloor,
    buildingBounds,
  ]);

  // Rebuild A* glowing 3D multi-floor escape ribbon whenever selected room, mode, or stack gap changes
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const { pathGroup } = refs;
    while (pathGroup.children.length > 0) {
      pathGroup.remove(pathGroup.children[0]);
    }

    if (activeEscape && !activeEscape.blocked && activePathWorldPts.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(
        activePathWorldPts,
        false,
        'catmullrom',
        0.08
      );
      const horizDist = activeEscape.floorDistanceM ?? activeEscape.distanceM;
      const isFail = horizDist > 16;
      const tubeColor = isFail ? 0xdc2626 : 0x16a34a;
      const tubeGeo = new THREE.TubeGeometry(
        curve,
        Math.max(32, activePathWorldPts.length * 10),
        0.12,
        8,
        false
      );
      const tubeMat = new THREE.MeshStandardMaterial({
        color: tubeColor,
        emissive: tubeColor,
        emissiveIntensity: 0.48,
        roughness: 0.3,
      });
      pathGroup.add(new THREE.Mesh(tubeGeo, tubeMat));
    }
    refs.requestRender();
  }, [activeEscape, activePathWorldPts]);

  const applyCameraPreset = (preset: 'iso' | 'top' | 'follow') => {
    setCameraPreset(preset);
    const refs = sceneRefs.current;
    if (!refs) return;
    const totalH = (activeProject.floors.length - 1) * storyGap;
    const span = Math.max(buildingBounds.widthM, buildingBounds.heightM, totalH + 6);
    const midY = totalH * 0.45;
    if (preset === 'iso') {
      refs.cameraTransition = {
        pos: new THREE.Vector3(span * 0.65, midY + span * 0.68, span * 0.88),
        target: new THREE.Vector3(0, midY, 0),
      };
    } else if (preset === 'top') {
      refs.cameraTransition = {
        pos: new THREE.Vector3(0, totalH + span * 1.15, 0.01),
        target: new THREE.Vector3(0, midY, 0),
      };
    }
  };

  const handleRoomSelect = (roomId: string) => {
    setSelectedRoomId(roomId);
    const roomFloor = activeProject.floors.findIndex((fl) =>
      fl.rooms.some((r) => r.id === roomId)
    );
    if (floorFocus !== 'all' && roomFloor > floorFocus) {
      setFloorFocus(roomFloor);
    }
  };

  const horizDist = activeEscape?.floorDistanceM ?? activeEscape?.distanceM ?? 0;
  const isOverLimit = Boolean(activeEscape?.blocked || horizDist > 16);

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-[#E8EDF3]">
      <div ref={canvasMountRef} className="w-full h-full" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 p-6">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-md text-center space-y-2">
            <div className="font-display font-semibold text-slate-900">
              {t('v3d.unavailable')}
            </div>
            <p className="text-xs text-slate-600">{webglError}</p>
          </div>
        </div>
      )}

      {/* Minimal Top-Left Simulation Readout (solid backing, zero backdrop-blur) */}
      <div className="absolute top-4 left-4 z-10 bg-white border border-slate-200/90 rounded-xl px-4 py-3.5 space-y-1.5 max-w-sm shadow-sm">
        <div className="flex items-center justify-between gap-4 text-[11px] font-mono text-slate-500">
          <span>
            {mode === 'before' ? t('v3d.asDrawn') : t('v3d.remediated')}
            {isMultiFloor && activeEscape?.floorLabel
              ? ` · ${activeEscape.floorLabel} → GF`
              : ''}
          </span>
          <span>{t('v3d.clickRoom')}</span>
        </div>

        <div className="flex items-baseline justify-between gap-4">
          <div className="font-display text-base font-bold text-slate-900">
            {activeEscape?.roomName || t('v3d.selectRoom')}
          </div>
          <div
            className={`font-mono text-xl font-bold tabular-nums ${
              isOverLimit ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {activeEscape?.blocked
              ? t('v3d.trapped')
              : activeEscape
                ? `${num(elapsedSec, 1)} / ${t('common.seconds', { n: num(activeEscape.estimatedTimeSec, 1) })}`
                : '—'}
          </div>
        </div>

        <div className="text-xs font-mono text-slate-600 tabular-nums flex flex-wrap items-center gap-x-2">
          <span>
            {isMultiFloor && (activeEscape?.floorIndex ?? 0) > 0 ? t('v3d.floorTotal') : t('v3d.path')}{' '}
            <strong>
              {activeEscape?.blocked
                ? t('v3d.noOpenRoute')
                : isMultiFloor && (activeEscape?.floorIndex ?? 0) > 0
                  ? `${num(horizDist, 1)} m / ${num(activeEscape?.distanceM ?? 0, 1)} m`
                  : `${num(activeEscape?.distanceM ?? 0, 2)} m`}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t('v3d.exit')} <strong>{activeEscape?.targetExitName || t('common.none')}</strong>
          </span>
        </div>

        {beforeEscape && afterEscape && (
          <div className="pt-1.5 border-t border-slate-200 text-[11px] font-mono text-slate-700 tabular-nums flex items-center justify-between">
            <span>{t('v3d.beforeAfter')}</span>
            <span>
              <strong className="text-red-700">
                {beforeEscape.blocked ? t('compare.blocked') : t('common.seconds', { n: num(beforeEscape.estimatedTimeSec, 1) })}
              </strong>{' '}
              →{' '}
              <strong className="text-emerald-700">
                {afterEscape.blocked ? t('compare.blocked') : t('common.seconds', { n: num(afterEscape.estimatedTimeSec, 1) })}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* Top-Right Simulation Illustration Disclaimer */}
      <div className="hidden md:block absolute top-4 right-4 z-10 bg-white border border-slate-200/90 rounded-lg shadow-xs px-3 py-1.5 text-[11px] font-mono text-slate-600 pointer-events-none">
        {t('v3d.disclaimer')}
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-[min(980px,95vw)]">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="px-3.5 py-1 bg-white border border-b-0 border-slate-200/90 rounded-t-lg text-[11px] font-mono font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer shadow-2xs"
        >
          {dockOpen ? (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Hide Controls
            </>
          ) : (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Show Controls
            </>
          )}
        </button>

        {dockOpen && (
          <div className="w-full bg-white border border-slate-200/90 rounded-xl px-4 py-3 shadow-md space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Before / After Mode Segmented Switch */}
              <div className="flex items-center rounded-lg bg-slate-100 border border-slate-200 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('before')}
                  className={`px-3 py-1.5 rounded-md cursor-pointer whitespace-nowrap transition-colors ${
                    mode === 'before'
                      ? 'bg-red-700 text-white font-semibold shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {t('v3d.beforeFix')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('after')}
                  className={`px-3 py-1.5 rounded-md cursor-pointer whitespace-nowrap transition-colors ${
                    mode === 'after'
                      ? 'bg-emerald-700 text-white font-semibold shadow-2xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  {t('v3d.afterFix')}
                </button>
              </div>

              {/* Room Selector grouped by floor */}
              <div className="flex items-center gap-2 text-xs">
                <label
                  htmlFor="room-sim-select"
                  className="text-slate-600 font-medium whitespace-nowrap"
                >
                  {t('v3d.startRoom')}
                </label>
                <select
                  id="room-sim-select"
                  value={selectedRoomId}
                  onChange={(e) => handleRoomSelect(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-900 max-w-[220px]"
                >
                  {selectableRoomsByFloor.map((grp) => (
                    <optgroup
                      key={grp.floorIndex}
                      label={`${grp.floorLabel} — ${grp.floorName}`}
                    >
                      {grp.rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {isMultiFloor ? `[${grp.floorLabel}] ` : ''}
                          {r.originalLabel}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {playing ? t('v3d.pause') : t('v3d.play')}
                </button>
                <button
                  type="button"
                  aria-label={t('v3d.reset')}
                  onClick={() => {
                    simStateRef.current.elapsedSec = 0;
                    setElapsedSec(0);
                  }}
                  className="p-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSpeedMult((s) => (s === 1 ? 2 : 1))}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 font-mono text-xs text-slate-800 cursor-pointer tabular-nums"
                >
                  {speedMult}×
                </button>
              </div>

              {/* Camera Presets */}
              <div className="flex items-center gap-1 text-xs">
                {(['iso', 'top', 'follow'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyCameraPreset(preset)}
                    className={`px-2.5 py-1.5 border rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                      cameraPreset === preset
                        ? 'border-slate-900 bg-slate-900 text-white font-medium'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {preset === 'iso' ? t('v3d.iso') : preset === 'top' ? t('v3d.top') : t('v3d.follow')}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-Floor Stack & Section Focus Row */}
            {isMultiFloor && (
              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1 font-mono">
                  <span className="text-slate-500 mr-1.5 inline-flex items-center gap-1 font-sans">
                    <Layers className="w-3.5 h-3.5" /> Floor Cutaway:
                  </span>
                  <button
                    type="button"
                    onClick={() => setFloorFocus('all')}
                    className={`px-2.5 py-1 border rounded-md cursor-pointer ${
                      floorFocus === 'all'
                        ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    All {activeProject.floors.length} Floors
                  </button>
                  {activeProject.floors.map((fl, idx) => {
                    const lbl = fl.floorLabel || (idx === 0 ? 'GF' : `L${idx + 1}`);
                    return (
                      <button
                        key={fl.id}
                        type="button"
                        onClick={() => setFloorFocus(idx)}
                        className={`px-2.5 py-1 border rounded-md cursor-pointer ${
                          floorFocus === idx
                            ? 'border-slate-900 bg-slate-900 text-white font-semibold'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setExploded((v) => !v)}
                  className={`px-3 py-1 border rounded-md font-mono text-xs cursor-pointer transition-colors ${
                    exploded
                      ? 'border-blue-700 bg-blue-700 text-white font-semibold'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {exploded ? 'Exploded Stack (5.6m)' : 'Explode Floors'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
