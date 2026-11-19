import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { StepUpload } from './components/StepUpload';
import { StepReview } from './components/StepReview';
import { StepReport } from './components/StepReport';
import { StepCompare } from './components/StepCompare';
const Viewport3D = lazy(() => import('./components/Viewport3D').then((m) => ({ default: m.Viewport3D })));
const StepPermits = lazy(() => import('./components/StepPermits').then((m) => ({ default: m.StepPermits })));
const StepExport = lazy(() => import('./components/StepExport').then((m) => ({ default: m.StepExport })));
import { DEFAULT_CONVENTIONS, parseDxfString } from './engine/dxfParser';
import { SAMPLE_BUILDINGS, type SampleBuildingMeta } from './engine/sampleDxf';
import {
  applyBuildingRemediationFixes,
  runBuildingAudit,
} from './engine/ruleEngine';
import {
  buildTemplateExplanation,
  buildTemplateNarration,
  requestAiFixNarration,
  requestAiLabelReconciliation,
  requestAiViolationExplanations,
  requestInferredConventions,
} from './engine/aiFallback';
import type { ReviewerRole } from './engine/localIntelligence';
import type {
  AppStep,
  BuildingProject,
  ComplianceAudit,
  FixNarration,
  LayerConventions,
  OccupancyClass,
  RoomTaxonomy,
  SiteContext,
  ViolationExplanation,
} from './types/plan';

function inferFloorSortRank(fileName: string, fallbackIndex: number): {
  rank: number;
  label: string;
  name: string;
} {
  const lower = fileName.toLowerCase();
  if (/(^|[_\-\s])(gf|ground|gnd|0f|f0)([_\-\s.]|$)/.test(lower)) {
    return { rank: 0, label: 'GF', name: 'Ground Floor (0.0 m)' };
  }
  const match = lower.match(/(?:^|[_\-\s])(?:l|f|level|flr|floor)?\s*([1-9][0-9]?)(?:f|st|nd|rd|th)?(?:[_\-\s.]|$)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num === 1) return { rank: 0, label: 'GF', name: 'Ground Floor (0.0 m)' };
    return {
      rank: num - 1,
      label: `L${num}`,
      name: `Level ${num}`,
    };
  }
  return {
    rank: 100 + fallbackIndex,
    label: fallbackIndex === 0 ? 'GF' : `L${fallbackIndex + 1}`,
    name: fallbackIndex === 0 ? 'Ground Floor (0.0 m)' : `Level ${fallbackIndex + 1}`,
  };
}

export default function App() {
  const [activeStep, setActiveStep] = useState<AppStep>('landing');
  const [reviewerRole, setReviewerRole] = useState<ReviewerRole>('architect');
  const [project, setProject] = useState<BuildingProject | null>(null);
  const [selectedFloorIndex, setSelectedFloorIndex] = useState<number>(0);
  const [parseError, setParseError] = useState<string | null>(null);

  const [aiLabelSource, setAiLabelSource] = useState<'gemini' | 'heuristic'>('heuristic');
  const [aiReconciling, setAiReconciling] = useState(false);

  const [explanations, setExplanations] = useState<Record<string, ViolationExplanation>>({});
  const [explainingAi, setExplainingAi] = useState(false);

  const [aiNarration, setAiNarration] = useState<FixNarration | null>(null);
  const [narratingAi, setNarratingAi] = useState(false);

  const [simMode, setSimMode] = useState<'before' | 'after'>('before');
  const [simRoomId, setSimRoomId] = useState<string | null>(null);
  const [simFloorFocus, setSimFloorFocus] = useState<number | 'all'>('all');

  const baseAudit: ComplianceAudit | null = useMemo(() => {
    if (!project) return null;
    return runBuildingAudit(project);
  }, [project]);

  const enrichedAudit: ComplianceAudit | null = useMemo(() => {
    if (!baseAudit) return null;
    return {
      ...baseAudit,
      violations: baseAudit.violations.map((v) => ({
        ...v,
        aiExplanation: explanations[v.id] || buildTemplateExplanation(v),
      })),
    };
  }, [baseAudit, explanations]);

  const remediation = useMemo(() => {
    if (!project || !baseAudit) return null;
    const { fixedProject, deltas } = applyBuildingRemediationFixes(project, baseAudit);
    const fixedAudit = runBuildingAudit(fixedProject);
    return { fixedProject, fixedAudit, deltas };
  }, [project, baseAudit]);

  const activeNarration: FixNarration | null = useMemo(() => {
    if (!project || !baseAudit || !remediation) return null;
    if (aiNarration) return aiNarration;
    return buildTemplateNarration(
      project.name,
      remediation.deltas,
      baseAudit,
      remediation.fixedAudit
    );
  }, [project, baseAudit, remediation, aiNarration]);

  const runAiLabels = useCallback(async (targetProject: BuildingProject) => {
    setAiReconciling(true);
    const allRooms = targetProject.floors.flatMap((fl) => fl.rooms);
    const res = await requestAiLabelReconciliation(allRooms, targetProject.floors);
    setAiLabelSource(res.source);
    if (res.updates.length > 0) {
      setProject((prev) => {
        if (!prev || prev.id !== targetProject.id) return prev;
        return {
          ...prev,
          floors: prev.floors.map((fl) => ({
            ...fl,
            rooms: fl.rooms.map((rm) => {
              const match = res.updates.find((u) => u.id === rm.id);
              if (!match || rm.mappingSource === 'manual') return rm;
              return {
                ...rm,
                taxonomy: match.taxonomy,
                confidence: match.confidence,
                mappingSource: 'ai',
                mappingReason: match.reason,
              };
            }),
          })),
        };
      });
    }
    setAiReconciling(false);
  }, []);

  const runAiExplanations = useCallback(async (audit: ComplianceAudit) => {
    setExplainingAi(true);
    const res = await requestAiViolationExplanations(audit.violations);
    setExplanations(res);
    setExplainingAi(false);
  }, []);

  const runAiNarration = useCallback(
    async (
      targetProject: BuildingProject,
      beforeAudit: ComplianceAudit,
      afterAudit: ComplianceAudit,
      deltas: ReturnType<typeof applyBuildingRemediationFixes>['deltas']
    ) => {
      setNarratingAi(true);
      const res = await requestAiFixNarration(
        targetProject.name,
        deltas,
        beforeAudit,
        afterAudit
      );
      setAiNarration(res);
      setNarratingAi(false);
    },
    []
  );

  const activateProject = useCallback(
    (nextProject: BuildingProject, nextStep: AppStep) => {
      setProject(nextProject);
      setSelectedFloorIndex(0);
      setSimFloorFocus('all');
      setSimRoomId(null);
      setExplanations({});
      setAiNarration(null);
      setAiLabelSource('heuristic');
      setActiveStep(nextStep);
      void runAiLabels(nextProject);
      if (nextStep === 'report') {
        const initialAudit = runBuildingAudit(nextProject);
        void runAiExplanations(initialAudit);
      }
    },
    [runAiLabels, runAiExplanations]
  );

  const handleLoadSampleBuilding = useCallback(
    (sample: SampleBuildingMeta, nextStep: AppStep = 'review') => {
      try {
        setParseError(null);
        const parsedFloors = sample.floors.map((fl) =>
          parseDxfString(fl.dxfContent, {
            id: `${sample.id}-f${fl.floorIndex}`,
            name: sample.name,
            subtitle: sample.subtitle,
            fileName: fl.fileName,
            occupancyClass: sample.occupancyClass,
            conventions: DEFAULT_CONVENTIONS,
            floorIndex: fl.floorIndex,
            floorLabel: fl.floorLabel,
            floorName: fl.floorName,
          })
        );
        activateProject(
          {
            id: sample.id,
            name: sample.name,
            subtitle: sample.subtitle,
            occupancyClass: sample.occupancyClass,
            storyHeightM: sample.storyHeightM,
            siteContext: { ...sample.siteContext, declared: true },
            floors: parsedFloors,
          },
          nextStep
        );
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Unable to parse sample DXF.');
      }
    },
    [activateProject]
  );

  const handleLoadDxfFiles = useCallback(
    (
      params: {
        files: { dxfText: string; fileName: string }[];
        occupancyClass: OccupancyClass;
        conventions: LayerConventions;
        storyHeightM?: number;
      },
      nextStep: AppStep = 'review'
    ) => {
      try {
        setParseError(null);
        const ranked = params.files
          .map((f, idx) => ({
            ...f,
            meta: inferFloorSortRank(f.fileName, idx),
          }))
          .sort((a, b) => a.meta.rank - b.meta.rank);

        const storyH = params.storyHeightM ?? 3.2;
        const parsedFloors = ranked.map((item, idx) => {
          const label = ranked.length === 1 ? 'GF' : idx === 0 ? 'GF' : `L${idx + 1}`;
          const floorName =
            ranked.length === 1
              ? 'Single Floor Plan'
              : idx === 0
                ? 'Ground Floor (0.0 m)'
                : `Level ${idx + 1} (+${(idx * storyH).toFixed(1)} m)`;
          return parseDxfString(item.dxfText, {
            id: `upload-f${idx}`,
            fileName: item.fileName,
            occupancyClass: params.occupancyClass,
            conventions: params.conventions,
            floorIndex: idx,
            floorLabel: label,
            floorName,
          });
        });

        const baseFloor = parsedFloors[0];
        const totalRooms = parsedFloors.reduce((acc, f) => acc + f.rooms.length, 0);
        const name =
          parsedFloors.length === 1
            ? baseFloor.name
            : `${baseFloor.name.replace(/\.dxf$/i, '')} (${parsedFloors.length}-Story Stack)`;
        const subtitle =
          parsedFloors.length === 1
            ? baseFloor.subtitle
            : `${baseFloor.bounds.widthM.toFixed(1)} m × ${baseFloor.bounds.heightM.toFixed(1)} m × ${(parsedFloors.length * storyH).toFixed(1)} m (${parsedFloors.length} Floors · ${totalRooms} Zones)`;

        // Plot data is not in a floor plan. It stays empty until the reviewer enters it,
        // and zoning is not screened on guessed numbers.
        const defaultSiteContext: SiteContext = {
          plotAreaSqM: 0,
          abuttingRoadWidthM: 0,
          frontSetbackM: 0,
          rearSetbackM: 0,
          sideSetbackM: 0,
          sprinklered: false,
          declared: false,
          zoneLabel:
            params.occupancyClass === 'industrial_rmg'
              ? 'Industrial / RMG Plot'
              : params.occupancyClass === 'residential'
                ? 'Residential Plot'
                : 'Mixed-Use Plot',
        };

        activateProject(
          {
            id: `upload-${Date.now()}`,
            name,
            subtitle,
            occupancyClass: params.occupancyClass,
            storyHeightM: storyH,
            siteContext: defaultSiteContext,
            floors: parsedFloors,
          },
          nextStep
        );
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Unable to parse DXF file(s).');
      }
    },
    [activateProject]
  );

  const handleAddFloorDxf = useCallback(
    (params: { dxfText: string; fileName: string; conventions?: LayerConventions }) => {
      if (!project) return;
      try {
        setParseError(null);
        const nextIdx = project.floors.length;
        const floorLabel = `L${nextIdx + 1}`;
        const floorName = `Level ${nextIdx + 1} (+${(nextIdx * project.storyHeightM).toFixed(1)} m)`;
        const parsedFloor = parseDxfString(params.dxfText, {
          id: `${project.id}-f${nextIdx}`,
          fileName: params.fileName,
          occupancyClass: project.occupancyClass,
          conventions: params.conventions || project.floors[0]?.conventions || DEFAULT_CONVENTIONS,
          floorIndex: nextIdx,
          floorLabel,
          floorName,
        });
        const nextFloors = [...project.floors, parsedFloor];
        const totalRooms = nextFloors.reduce((acc, f) => acc + f.rooms.length, 0);
        const updated: BuildingProject = {
          ...project,
          name: `${project.name.replace(/\s*\(\d+-Story.*\)$/i, '')} (${nextFloors.length}-Story Stack)`,
          subtitle: `${project.floors[0].bounds.widthM.toFixed(1)} m × ${project.floors[0].bounds.heightM.toFixed(1)} m × ${(nextFloors.length * project.storyHeightM).toFixed(1)} m (${nextFloors.length} Floors · ${totalRooms} Zones)`,
          floors: nextFloors,
        };
        setProject(updated);
        setSelectedFloorIndex(nextIdx);
        setExplanations({});
        setAiNarration(null);
        void runAiLabels(updated);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Unable to parse added floor DXF.');
      }
    },
    [project, runAiLabels]
  );

  const handleRemoveFloor = useCallback(
    (floorIdx: number) => {
      if (!project || project.floors.length <= 1) return;
      const remaining = project.floors.filter((_, idx) => idx !== floorIdx);
      const reindexed = remaining.map((fl, idx) =>
        fl.rawDxf
          ? parseDxfString(fl.rawDxf, {
              id: `${project.id}-f${idx}`,
              name: fl.name,
              subtitle: fl.subtitle,
              fileName: fl.sourceFileName,
              occupancyClass: project.occupancyClass,
              conventions: fl.conventions,
              floorIndex: idx,
              floorLabel: idx === 0 ? 'GF' : `L${idx + 1}`,
              floorName:
                idx === 0
                  ? 'Ground Floor (0.0 m)'
                  : `Level ${idx + 1} (+${(idx * project.storyHeightM).toFixed(1)} m)`,
            })
          : {
              ...fl,
              floorIndex: idx,
              floorLabel: idx === 0 ? 'GF' : `L${idx + 1}`,
            }
      );
      const totalRooms = reindexed.reduce((acc, f) => acc + f.rooms.length, 0);
      setProject({
        ...project,
        subtitle: `${reindexed[0].bounds.widthM.toFixed(1)} m × ${reindexed[0].bounds.heightM.toFixed(1)} m × ${(reindexed.length * project.storyHeightM).toFixed(1)} m (${reindexed.length} Floors · ${totalRooms} Zones)`,
        floors: reindexed,
      });
      setSelectedFloorIndex((prev) => Math.max(0, Math.min(prev, reindexed.length - 1)));
      setExplanations({});
      setAiNarration(null);
    },
    [project]
  );

  // Startup auto-load: check URL deep-link or default to the 3-story Gazipur building
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sampleId = params.get('plan');
    const stepParam = params.get('step') as AppStep | null;
    const modeParam = params.get('mode') as 'before' | 'after' | null;
    const roomParam = params.get('room');
    const floorParam = params.get('floor');

    if (sampleId) {
      const sample = SAMPLE_BUILDINGS.find((s) => s.id === sampleId);
      if (sample) {
        if (modeParam === 'before' || modeParam === 'after') setSimMode(modeParam);
        if (roomParam) setSimRoomId(roomParam);
        if (floorParam === 'all') setSimFloorFocus('all');
        else if (floorParam !== null && !Number.isNaN(Number(floorParam))) {
          const parsedF = Math.max(0, Math.min(sample.floors.length - 1, Number(floorParam)));
          setSimFloorFocus(parsedF);
          setSelectedFloorIndex(parsedF);
        }
        handleLoadSampleBuilding(sample, stepParam || 'simulate');
        return;
      }
    }

    const defaultBuilding = SAMPLE_BUILDINGS[0];
    if (defaultBuilding) {
      handleLoadSampleBuilding(defaultBuilding, 'landing');
    }
  }, [handleLoadSampleBuilding]);

  const handleUpdateRoomTaxonomy = (roomId: string, taxonomy: RoomTaxonomy) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        floors: prev.floors.map((fl) => ({
          ...fl,
          rooms: fl.rooms.map((r) =>
            r.id === roomId
              ? {
                  ...r,
                  taxonomy,
                  confidence: 1,
                  mappingSource: 'manual',
                  mappingReason: 'Confirmed / overridden by plan reviewer',
                }
              : r
          ),
        })),
      };
    });
  };

  const handleUpdateSiteContext = (patch: Partial<SiteContext>) => {
    setProject((prev) => {
      if (!prev) return prev;
      const base: SiteContext = prev.siteContext || {
        plotAreaSqM: 0,
        abuttingRoadWidthM: 0,
        frontSetbackM: 0,
        rearSetbackM: 0,
        sideSetbackM: 0,
        sprinklered: false,
        zoneLabel: 'Plot',
        declared: false,
      };
      const next = { ...base, ...patch };
      // Zoning is screened once the reviewer has given a plot area and a road width.
      next.declared = next.plotAreaSqM > 0 && next.abuttingRoadWidthM > 0;
      return {
        ...prev,
        siteContext: next,
      };
    });
    setAiNarration(null);
  };

  const handleUpdateDoor = (doorId: string, patch: { isExit?: boolean; isLocked?: boolean }) => {
    setProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        floors: prev.floors.map((fl) => ({
          ...fl,
          doors: fl.doors.map((d) =>
            d.id === doorId
              ? {
                  ...d,
                  ...patch,
                  exitSource: patch.isExit !== undefined ? ('manual' as const) : d.exitSource,
                }
              : d
          ),
        })),
      };
    });
    setExplanations({});
    setAiNarration(null);
  };

  const handleAutoMapLayers = useCallback(async () => {
    if (!project) return null;
    const allLayers = Array.from(new Set(project.floors.flatMap((f) => f.layersFound)));
    const sampleTexts = Array.from(
      new Set(
        project.floors.flatMap((f) => [
          ...f.rooms.map((r) => r.originalLabel),
          ...f.unmappedTexts.map((u) => u.text),
        ])
      )
    );
    const baseConv = project.floors[0]?.conventions || DEFAULT_CONVENTIONS;
    const inferred = await requestInferredConventions(allLayers, sampleTexts, baseConv);
    const reparsedFloors = project.floors.map((fl, idx) =>
      fl.rawDxf
        ? parseDxfString(fl.rawDxf, {
            id: fl.id,
            name: fl.name,
            subtitle: fl.subtitle,
            fileName: fl.sourceFileName,
            occupancyClass: project.occupancyClass,
            conventions: inferred.conventions,
            floorIndex: fl.floorIndex ?? idx,
            floorLabel: fl.floorLabel || (idx === 0 ? 'GF' : `L${idx + 1}`),
            floorName: fl.floorName,
          })
        : { ...fl, conventions: inferred.conventions }
    );
    const updated: BuildingProject = { ...project, floors: reparsedFloors };
    setProject(updated);
    setExplanations({});
    setAiNarration(null);
    void runAiLabels(updated);
    return inferred;
  }, [project, runAiLabels]);

  const handleConfirmAndAudit = () => {
    setActiveStep('report');
    if (baseAudit) {
      void runAiExplanations(baseAudit);
    }
  };

  const handleProceedToCompare = () => {
    setActiveStep('compare');
    if (project && baseAudit && remediation) {
      void runAiNarration(
        project,
        baseAudit,
        remediation.fixedAudit,
        remediation.deltas
      );
    }
  };

  const handleHeaderPrimary = () => {
    if (activeStep === 'landing') {
      setActiveStep('upload');
      return;
    }
    if (!project) {
      const s = SAMPLE_BUILDINGS[0];
      handleLoadSampleBuilding(s);
    } else if (activeStep === 'export') {
      setActiveStep('simulate');
    } else {
      setActiveStep('export');
    }
  };

  const shareUrl = useMemo(() => {
    const base = window.location.origin + window.location.pathname;
    const matchedSample = SAMPLE_BUILDINGS.find((s) => s.id === project?.id);
    // Uploaded drawings stay in this browser, so only built-in reference plans can be linked.
    if (!matchedSample) return null;
    const planParam = matchedSample.id;
    const roomQuery = simRoomId ? `&room=${encodeURIComponent(simRoomId)}` : '';
    const floorQuery = `&floor=${simFloorFocus}`;
    return `${base}?plan=${planParam}&step=simulate&mode=${simMode}${floorQuery}${roomQuery}`;
  }, [project, simMode, simRoomId, simFloorFocus]);

  const primaryLabel =
    activeStep === 'landing'
      ? 'Start plan review'
      : !project
        ? 'Load reference plan'
        : activeStep === 'export'
          ? 'Open 3D view'
          : 'Export';

  const safeFloorIdx = project
    ? Math.max(0, Math.min(selectedFloorIndex, project.floors.length - 1))
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F9] text-slate-900">
      <Header
        activeStep={activeStep}
        hasPlan={Boolean(project)}
        onSelectStep={(step) => {
          setActiveStep(step);
          if (step === 'report' && baseAudit && Object.keys(explanations).length === 0) {
            void runAiExplanations(baseAudit);
          }
          if (step === 'compare' && project && baseAudit && remediation && !aiNarration) {
            void runAiNarration(
              project,
              baseAudit,
              remediation.fixedAudit,
              remediation.deltas
            );
          }
        }}
        onPrimaryAction={handleHeaderPrimary}
        primaryActionLabel={primaryLabel}
      />

      {/* Mobile compact step bar (workspace only) */}
      {project && activeStep !== 'landing' && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs">
          {(
            [
              ['upload', '01 Upload'],
              ['review', '02 Review'],
              ['report', '03 Report'],
              ['compare', '04 Fixes'],
              ['simulate', '05 3D'],
              ['permits', '06 Permits'],
              ['export', '07 Export'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveStep(id)}
              className={`whitespace-nowrap shrink-0 cursor-pointer ${
                activeStep === id
                  ? 'text-blue-700 font-semibold underline underline-offset-4'
                  : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center p-12 text-sm text-slate-500" role="status">
            Loading…
          </div>
        }
      >
      {activeStep === 'landing' && (
        <LandingPage
          reviewerRole={reviewerRole}
          onChangeReviewerRole={setReviewerRole}
          onOpenSample={(sample, step) => handleLoadSampleBuilding(sample, step)}
          onGoToUpload={() => setActiveStep('upload')}
          onGoToPermits={() => setActiveStep('permits')}
        />
      )}

      {activeStep === 'upload' && (
        <StepUpload
          activeProject={project}
          onLoadDxfFiles={(p) => handleLoadDxfFiles(p)}
          onLoadSampleBuilding={(sb) => handleLoadSampleBuilding(sb)}
          onAddFloorDxf={(p) => {
            handleAddFloorDxf(p);
            setActiveStep('review');
          }}
          parseError={parseError}
          onContinueToReview={() => setActiveStep('review')}
        />
      )}

      {activeStep === 'review' && project && (
        <StepReview
          project={project}
          selectedFloorIndex={safeFloorIdx}
          onSelectFloor={setSelectedFloorIndex}
          onAddFloorDxf={(p) => handleAddFloorDxf(p)}
          onRemoveFloor={handleRemoveFloor}
          aiReconciling={aiReconciling}
          aiSource={aiLabelSource}
          onUpdateRoomTaxonomy={handleUpdateRoomTaxonomy}
          onUpdateSiteContext={handleUpdateSiteContext}
          onUpdateDoor={handleUpdateDoor}
          onAutoMapLayers={handleAutoMapLayers}
          onRunAiReconcile={() => void runAiLabels(project)}
          onConfirmAndAudit={handleConfirmAndAudit}
        />
      )}

      {activeStep === 'report' && project && enrichedAudit && (
        <StepReport
          project={project}
          selectedFloorIndex={safeFloorIdx}
          onSelectFloor={setSelectedFloorIndex}
          audit={enrichedAudit}
          reviewerRole={reviewerRole}
          onChangeReviewerRole={setReviewerRole}
          explainingAi={explainingAi}
          onRefreshExplanations={() => baseAudit && void runAiExplanations(baseAudit)}
          onProceedToCompare={handleProceedToCompare}
        />
      )}

      {activeStep === 'compare' &&
        project &&
        enrichedAudit &&
        remediation &&
        activeNarration && (
          <StepCompare
            originalProject={project}
            originalAudit={enrichedAudit}
            fixedProject={remediation.fixedProject}
            fixedAudit={remediation.fixedAudit}
            selectedFloorIndex={safeFloorIdx}
            onSelectFloor={setSelectedFloorIndex}
            deltas={remediation.deltas}
            narration={activeNarration}
            narratingAi={narratingAi}
            onProceedTo3D={() => setActiveStep('simulate')}
          />
        )}

      {activeStep === 'simulate' && project && enrichedAudit && remediation && (
        <Viewport3D
          beforeProject={project}
          beforeAudit={enrichedAudit}
          afterProject={remediation.fixedProject}
          afterAudit={remediation.fixedAudit}
          initialMode={simMode}
          initialRoomId={simRoomId}
          initialFloorFocus={simFloorFocus}
          onStateChange={(m, r, f) => {
            setSimMode(m);
            setSimRoomId(r);
            setSimFloorFocus(f);
          }}
        />
      )}

      {activeStep === 'permits' && (
        <StepPermits
          project={project}
          beforeAudit={enrichedAudit}
          afterAudit={remediation?.fixedAudit || null}
          deltas={remediation?.deltas || []}
          onGoToUpload={() => setActiveStep('upload')}
          onGoToReport={() => setActiveStep('report')}
          onGoToExport={() => setActiveStep('export')}
        />
      )}

      {activeStep === 'export' && project && enrichedAudit && remediation && (
        <StepExport
          project={project}
          beforeAudit={enrichedAudit}
          afterAudit={remediation.fixedAudit}
          deltas={remediation.deltas}
          reviewerRole={reviewerRole}
          onChangeReviewerRole={setReviewerRole}
          shareUrl={shareUrl}
          onOpen3DView={() => setActiveStep('simulate')}
        />
      )}
      </Suspense>
    </div>
  );
}
