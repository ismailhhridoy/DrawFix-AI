// Builds the /docs payload on the server, at request time. Live values come from the code and
// the running server, so the page cannot show numbers the app does not produce.
import { RULES } from '../engine/rules';
import { SAMPLE_BUILDINGS } from '../engine/sampleDxf';
import { FEATURES, WORKSPACE_STEPS, type FeatureStatus } from './features';
import { TEAM, TEAM_NAME } from './team';
import { GROUPS, SECTIONS } from './content';
import { ARCHITECTURE, DATA_FLOW } from './diagrams';

export interface DocsPayload {
  generatedAt: string;
  live: {
    commit: string | null;
    aiConfigured: boolean;
    rules: { total: number; verified: number; screening: number; drawing: number };
    sampleBuildings: { id: string; name: string; subtitle: string }[];
    workspaceSteps: string[];
    features: (Omit<(typeof FEATURES)[number], 'status'> & { status: FeatureStatus; available: boolean })[];
    featureCounts: Record<FeatureStatus, number>;
  };
  team: { teamName: string; members: { name: string; roles: string[]; email: string | null; photo: string | null }[] };
  groups: typeof GROUPS;
  sections: typeof SECTIONS;
  diagrams: { architecture: typeof ARCHITECTURE; dataflow: typeof DATA_FLOW };
}

export function buildDocsPayload(opts: { commit: string | null; aiConfigured: boolean; now?: Date }): DocsPayload {
  const basis = { verified: 0, screening: 0, drawing: 0 };
  for (const rule of Object.values(RULES)) basis[rule.basis] += 1;
  const featureCounts: Record<FeatureStatus, number> = { shipped: 0, 'in-progress': 0, planned: 0 };
  const features = FEATURES.map((f) => {
    featureCounts[f.status] += 1;
    return { ...f, available: !f.needsAi || opts.aiConfigured };
  });
  return {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    live: {
      commit: opts.commit,
      aiConfigured: opts.aiConfigured,
      rules: { total: Object.keys(RULES).length, ...basis },
      sampleBuildings: SAMPLE_BUILDINGS.map((b) => ({ id: b.id, name: b.name, subtitle: b.subtitle })),
      workspaceSteps: WORKSPACE_STEPS,
      features,
      featureCounts,
    },
    team: {
      teamName: TEAM_NAME,
      members: TEAM.filter((m) => m.published).map(({ name, roles, email, photo }) => ({ name, roles, email, photo })),
    },
    groups: GROUPS,
    sections: SECTIONS,
    diagrams: { architecture: ARCHITECTURE, dataflow: DATA_FLOW },
  };
}
