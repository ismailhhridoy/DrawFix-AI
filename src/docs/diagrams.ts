// Diagram definitions as data. The page draws them as SVG, so editing a diagram means editing this file.
export interface DiagramNode {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  tone?: 'ui' | 'api' | 'svc' | 'ext' | 'data';
}
export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}
export interface Diagram {
  width: number;
  height: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export const ARCHITECTURE: Diagram = {
  width: 980,
  height: 590,
  nodes: [
    { id: 'ui', label: 'Browser UI', sub: 'React, Tailwind, three.js', x: 40, y: 30, w: 240, tone: 'ui' },
    { id: 'docs-api', label: '/api/docs', sub: 'access rules and payload', x: 700, y: 30, w: 240, tone: 'api' },
    { id: 'api', label: 'Express server', sub: '/api/* routes, 40 requests/min/IP', x: 40, y: 180, w: 240, tone: 'api' },
    { id: 'gemini', label: 'Gemini API', sub: 'optional; off = fixed wording', x: 370, y: 180, w: 240, tone: 'ext' },
    { id: 'config', label: 'data/docs-config.json', sub: 'admin access settings', x: 700, y: 180, w: 240, tone: 'data' },
    { id: 'engine', label: 'Rule engine', sub: '23 checks, pathfinding, layout edits', x: 40, y: 330, w: 240, tone: 'svc' },
    { id: 'retrieval', label: 'Question retrieval', sub: 'embeddings + keyword fallback', x: 370, y: 330, w: 240, tone: 'svc' },
    { id: 'verify', label: 'Verifier', sub: 're-audits every AI proposal', x: 40, y: 480, w: 240, tone: 'svc' },
  ],
  edges: [
    { from: 'ui', to: 'api', label: 'JSON' },
    { from: 'ui', to: 'docs-api', label: 'GET /api/docs/payload' },
    { from: 'docs-api', to: 'config', label: 'reads settings' },
    { from: 'api', to: 'gemini', label: 'prompts' },
    { from: 'api', to: 'engine' },
    { from: 'api', to: 'retrieval', label: 'questions' },
    { from: 'engine', to: 'verify', label: 'proposals' },
  ],
};

export const DATA_FLOW: Diagram = {
  width: 980,
  height: 280,
  nodes: [
    { id: 'in', label: 'Input', sub: 'DXF or plan image', x: 20, y: 40, w: 200, tone: 'ui' },
    { id: 'proc', label: 'Process', sub: 'parse, classify, audit', x: 260, y: 40, w: 200, tone: 'svc' },
    { id: 'ai', label: 'AI proposes', sub: 'optional, Gemini', x: 500, y: 40, w: 200, tone: 'ext' },
    { id: 'check', label: 'Code verifies', sub: 're-audits a copy', x: 740, y: 40, w: 200, tone: 'svc' },
    { id: 'person', label: 'Person approves', sub: 'nothing changes before this', x: 740, y: 180, w: 200, tone: 'ui' },
    { id: 'out', label: 'Output', sub: 'report, 3D, PDF, Bangla', x: 500, y: 180, w: 200, tone: 'api' },
    { id: 'fb', label: 'Feedback', sub: 'version compare', x: 260, y: 180, w: 200, tone: 'data' },
  ],
  edges: [
    { from: 'in', to: 'proc' },
    { from: 'proc', to: 'ai' },
    { from: 'ai', to: 'check' },
    { from: 'check', to: 'person' },
    { from: 'person', to: 'out' },
    { from: 'out', to: 'fb' },
    { from: 'fb', to: 'proc', label: 'resubmit revised DXF' },
  ],
};
