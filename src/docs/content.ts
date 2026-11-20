// /docs content. Plain data, so it can be edited, reordered, exported to Markdown and added to.
// Rules: only confirmed facts. Anything without data says so. No model names in this file.
export type Block =
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'note'; text: string }
  | { t: 'live'; key: 'rules' | 'buildings' | 'ai' | 'steps' }
  | { t: 'features' }
  | { t: 'team' }
  | { t: 'diagram'; key: 'architecture' | 'dataflow' };

export type GroupId = 'pitch' | 'product' | 'engineering' | 'operations';

export interface Section {
  id: string;
  group: GroupId;
  title: string;
  blocks: Block[];
}

export const GROUPS: { id: GroupId; title: string }[] = [
  { id: 'pitch', title: 'Pitch' },
  { id: 'product', title: 'Product' },
  { id: 'engineering', title: 'Engineering' },
  { id: 'operations', title: 'Operations' },
];

export const SECTIONS: Section[] = [
  // ---------- PITCH ----------
  {
    id: 'problem', group: 'pitch', title: 'Problem',
    blocks: [
      { t: 'p', text: 'Building plans go back and forth between architects and RAJUK reviewers, and every correction round adds weeks.' },
      { t: 'ul', items: [
        'RAJUK\'s own site says the building construction committee approves a design within 45 days of submission, depending on how often it meets. (Official site.)',
        'A file passes through several officers. The workflow has an "Applicants\' Clarifications" step, where correction rounds happen. (Official site.)',
        'Egress is an official review item: RAJUK\'s review checklists include "Means of Egress". (Official checklist.)',
      ] },
      { t: 'p', text: 'Fire is the stake that matters most. Bangladesh records about 27,000 fires a year (2024: 26,659 fires, 140 deaths). Most fires start from electrical faults or cooking, which a plan check cannot see. So DrawFix asks one question only: can people get out?' },
      { t: 'note', text: 'Bailey Road, Dhaka, 2024: 46 dead. One staircase where two were required, and no fire exits. These are drawing-level failures, which a plan check can catch.' },
    ],
  },
  {
    id: 'solution', group: 'pitch', title: 'Solution',
    blocks: [
      { t: 'p', text: 'DrawFix AI checks a floor plan against Bangladesh building rules before it is filed. An architect uploads an AutoCAD DXF, and the app finds the rooms, doors, exits and stairs, measures every escape route, and runs 23 checks.' },
      { t: 'ul', items: [
        'AI proposes. Code verifies. A person approves.',
        'Every finding shows a trust level: verified, screening or drawing.',
        'Every limit the app cannot check is listed as "Not checked", with the reason.',
        'Reports come in English and Bangla, and the numbers match in both.',
      ] },
    ],
  },
  {
    id: 'why-now', group: 'pitch', title: 'Why now',
    blocks: [
      { t: 'ul', items: [
        'Permit volume is high. The reported figure is 10,985 online permit applications in seven months, of which 7,993 were approved. This is a single source and needs confirming before it is quoted.',
        'AI can now read plan drawings and suggest layout fixes, and a rule engine can check every suggestion. A pure-AI answer would be hard to audit; this combination is not.',
        'The enforcement authority for the 2020 building code (BBRA) is reported not yet set up. (Single source.)',
      ] },
    ],
  },
  {
    id: 'demo', group: 'pitch', title: 'Product demo',
    blocks: [
      { t: 'p', text: 'The demo uses the Gazipur 3-storey garment factory (a synthetic plan). Opening it in the app takes three steps: Upload, Review, Report. Fixes and the 3D replay follow.' },
      { t: 'table', head: ['Sample plan', 'Before', 'After fixes', 'Slowest escape'], rows: [
        ['Gazipur 3-storey RMG factory', '9 fail, 7 warn', '0 fail, 0 warn', '54.7 s → 36.7 s'],
        ['Gazipur multi-wing L2', '7 fail, 4 warn', '0 fail, 0 warn', '31.3 s → 12.7 s'],
        ['Mirpur RMG floor 4', '6 fail, 2 warn', '0 fail, 0 warn', '24.7 s → 16.7 s'],
        ['Dhanmondi residential L3', '5 fail, 4 warn', '0 fail, 0 warn', '26.7 s → 12.1 s'],
      ] },
      { t: 'note', text: 'These are snapshot figures from the engine run on 19 November 2026. They guard against regressions; they do not prove the rules are correct. Only the hand-checked test (a 36 × 4 m hall with one exit) verifies the arithmetic by hand.' },
    ],
  },
  {
    id: 'market', group: 'pitch', title: 'Market opportunity',
    blocks: [
      { t: 'p', text: 'Market size has not been sourced yet, so no figure is shown here. Buyers identified so far:' },
      { t: 'ul', items: [
        'Approval offices (RAJUK, city corporations): a first-pass audit for reviewers.',
        'Architects and developers: a pre-check before filing.',
        'Insurers: a view of egress risk (not yet tested).',
      ] },
    ],
  },
  {
    id: 'business-model', group: 'pitch', title: 'Business model',
    blocks: [
      { t: 'p', text: 'Not decided. Options to evaluate: a subscription for architects, a licence for approval offices, and tooling for developers and insurers. No prices have been set and none are quoted here.' },
    ],
  },
  {
    id: 'traction', group: 'pitch', title: 'Traction',
    blocks: [
      { t: 'p', text: 'Pre-launch. The honest state of the project:' },
      { t: 'live', key: 'buildings' },
      { t: 'ul', items: [
        'Live deployment, with AI status shown on the page itself.',
        'Automated test suite (116 tests at the last count).',
        'No real architect drawing has been tested yet, and there are no paying customers.',
      ] },
    ],
  },
  {
    id: 'competition', group: 'pitch', title: 'Competition',
    blocks: [
      { t: 'p', text: 'Closest competitor: Archistar AI PreCheck (Australia, US and Canada; a City of Austin contract in 2024). This is not a new category. DrawFix differs in four ways:' },
      { t: 'table', head: ['', 'Archistar AI PreCheck', 'DrawFix AI'], rows: [
        ['Rules', 'Other jurisdictions', 'Bangladesh BNBC 2012 and Dhaka rules'],
        ['Language', 'English', 'English and Bangla'],
        ['Input', 'BIM models', '2D AutoCAD DXF drawings'],
        ['Trust', 'Not shown per finding', 'Verified, screening or drawing, on every finding'],
      ] },
    ],
  },
  {
    id: 'advantage', group: 'pitch', title: 'Unique advantage',
    blocks: [
      { t: 'ul', items: [
        'Fixed rule engine: every distance, width, area and pass/fail is calculated in code. Gemini never outputs a measurement or a clause number.',
        'Trust levels on every finding, and a "Not checked" list. Honest about limits.',
        'Works without AI: the app still runs with fixed wording and hand-written fixes.',
        'Number guard: an AI sentence with a number that is not in the data is rejected.',
      ] },
    ],
  },
  {
    id: 'gtm', group: 'pitch', title: 'Go-to-market',
    blocks: [
      { t: 'ul', items: [
        'Step 1: architects check plans before filing. No login is needed.',
        'Step 2: plan review officers use the first-pass audit and the version compare.',
        'Step 3: test on real architect DXF files, and get a native Bangla review of all code wording.',
      ] },
    ],
  },
  { id: 'team', group: 'pitch', title: 'Team', blocks: [{ t: 'team' }] },
  {
    id: 'vision', group: 'pitch', title: 'Vision',
    blocks: [
      { t: 'p', text: 'Faster, auditable service delivery: every plan is checked before it is filed, and every reviewer starts from a measured first pass.' },
    ],
  },

  // ---------- PRODUCT ----------
  {
    id: 'overview', group: 'product', title: 'Product overview',
    blocks: [
      { t: 'p', text: 'DrawFix AI reads AutoCAD floor plans and checks them against Bangladesh building rules: zoning, habitability, stair geometry, dimension accuracy and fire egress.' },
      { t: 'table', head: ['User', 'Use case'], rows: [
        ['Architect', 'Check a plan before filing; see what to fix; re-check after changes'],
        ['Plan review officer', 'First-pass audit; compare a resubmitted drawing with the last one'],
        ['Permit desk', 'Read a correction letter and sort its items'],
      ] },
    ],
  },
  { id: 'features', group: 'product', title: 'Feature matrix', blocks: [{ t: 'features' }] },
  { id: 'architecture', group: 'product', title: 'Architecture', blocks: [{ t: 'diagram', key: 'architecture' }] },
  { id: 'dataflow', group: 'product', title: 'Data flow', blocks: [{ t: 'diagram', key: 'dataflow' }] },
  {
    id: 'roadmap', group: 'product', title: 'Roadmap',
    blocks: [
      { t: 'table', head: ['Horizon', 'Work'], rows: [
        ['Short (before the 20 Nov 2026 deadline)', 'YouTube link in the submission; confirm the Gemini key on the live site; final launch film'],
        ['Mid', 'Native Bangla review; verify BNBC Part 4 Ch. 3 clauses against the gazette and move them from screening to verified; test on real architect DXF files; full mobile pass'],
        ['Long', 'Clearer rule source per finding; occupancy classes beyond RMG and residential; an admin editor for this page'],
      ] },
    ],
  },

  // ---------- ENGINEERING ----------
  {
    id: 'stack', group: 'engineering', title: 'Technology stack',
    blocks: [
      { t: 'table', head: ['Layer', 'Technology'], rows: [
        ['Frontend', 'React 19, Vite, Tailwind CSS 4, three.js (3D), motion, lucide-react, jsPDF'],
        ['Backend', 'Express 4 served by tsx; Vite in development'],
        ['Database', 'None. The app stores nothing on the server. /docs settings are a JSON file'],
        ['AI', 'Google Gemini, through @google/genai (models set by environment variables)'],
        ['Parsing', 'dxf-parser plus own geometry code'],
        ['Testing', 'Vitest'],
        ['Infrastructure', 'Render web service (free tier); health check at /api/health'],
      ] },
    ],
  },
  {
    id: 'api', group: 'engineering', title: 'API',
    blocks: [
      { t: 'table', head: ['Method', 'Path', 'Purpose', 'Auth'], rows: [
        ['GET', '/api/health', 'AI status, commit, feature list', 'None'],
        ['POST', '/api/ai/propose-layout-fixes', 'Gemini layout proposals, re-checked', 'None; rate limited'],
        ['POST', '/api/ai/agent-step', 'Fix agent step', 'None; rate limited'],
        ['POST', '/api/ai/read-plan-image', 'Trace a plan image into walls, doors, rooms, stairs', 'None; rate limited'],
        ['POST', '/api/ai/explain-violations', 'Plain-language finding text (English and Bangla)', 'None; rate limited'],
        ['POST', '/api/ai/narrate-fixes', 'Fix summary text', 'None; rate limited'],
        ['POST', '/api/rag/query', 'Question box: retrieves reference clauses, then answers', 'None; rate limited'],
        ['GET', '/api/docs/access', 'Whether this visitor can open /docs', 'Optional view key'],
        ['GET', '/api/docs/payload', 'The /docs content and live status', 'Open only when access allows'],
        ['PUT', '/api/docs/config', 'Change /docs visibility (on, off, schedule, restricted)', 'Admin bearer token'],
      ] },
      { t: 'p', text: 'Auth model: there are no user accounts. Public endpoints are rate limited to 40 requests per minute per IP. /docs admin changes need the admin token set in the server environment; if it is not set, the endpoint is disabled.' },
    ],
  },
  {
    id: 'data', group: 'engineering', title: 'Data layer',
    blocks: [
      { t: 'ul', items: [
        'Sources: the uploaded DXF or plan image, the reviewer\'s entries, and the reference notes in the code.',
        'Parsing: in the browser. Units come from the file header ($INSUNITS); bad files get a clear error.',
        'Storage: none on the server. Reports are generated in the browser and downloaded by the user.',
        'Privacy: when AI is on, the relevant drawing data is sent to Gemini. Without a key, nothing is sent. The upload screen does not say this yet.',
      ] },
    ],
  },
  {
    id: 'ai', group: 'engineering', title: 'AI layer',
    blocks: [
      { t: 'table', head: ['Feature', 'What the model does', 'What code does'], rows: [
        ['Layout fix proposals', 'Suggests edits in a small edit language (move a door, add an exit)', 'Validates each edit, applies it to a copy, re-runs the full audit'],
        ['Fix agent', 'Works through tools: run audit, try edits, stage, finish', 'Keeps only changes that pass; nothing applies until approved'],
        ['Plan reading', 'Traces walls, doors, rooms and stairs in image coordinates', 'Scales to metres from the width the reviewer enters'],
        ['Labels and explanations', 'Classifies room labels; rewrites findings', 'Validates results; falls back to keyword rules'],
        ['Question box', 'Answers from reference notes', 'Hybrid retrieval: embeddings with keyword fallback; "no note matched" when nothing fits'],
      ] },
      { t: 'ul', items: [
        'Explainability: each finding shows its clause citation, trust level and note.',
        'Number guard: AI text containing a number not in the finding\'s data is replaced with fixed wording.',
        'Personalisation: none. Every user gets the same rules.',
      ] },
      { t: 'live', key: 'ai' },
    ],
  },

  // ---------- OPERATIONS ----------
  {
    id: 'performance', group: 'operations', title: 'Performance and scalability',
    blocks: [
      { t: 'ul', items: [
        'Heavy screens (3D, Export, Permits) load on demand, so the first screen stays small.',
        '/docs loads only on its own path, and its content comes from the server only when access allows.',
        'Public /docs payload is cached privately for 60 seconds.',
        'Free hosting sleeps after about 15 minutes idle and takes about a minute to wake. Open the site a minute before a demo.',
        'Scaling is not tested beyond the free tier.',
      ] },
    ],
  },
  {
    id: 'security', group: 'operations', title: 'Security',
    blocks: [
      { t: 'ul', items: [
        'Drawings are parsed in the browser. The server keeps no uploaded files.',
        'Rate limit: 40 requests per minute per IP on AI endpoints.',
        '/docs access: off by default; public, scheduled or key-protected. Key checks run in constant time. Restricted mode fails closed when no key is set.',
        'Admin token: required to change /docs settings. Stored only in the server environment.',
        'No Content-Security-Policy header is set yet.',
      ] },
    ],
  },
  {
    id: 'analytics', group: 'operations', title: 'Analytics',
    blocks: [
      { t: 'p', text: 'Not instrumented yet. Usage is not tracked. Planned measures, once consent and storage are decided: plans uploaded, audits run, findings cleared after resubmission, and AI availability over time.' },
    ],
  },
  { id: 'contributors', group: 'operations', title: 'Contributors', blocks: [{ t: 'p', text: 'See Team above. Contributor list is maintained with the team section.' }] },
  {
    id: 'changelog', group: 'operations', title: 'Changelog',
    blocks: [
      { t: 'table', head: ['Date', 'Change'], rows: [
        ['2026-11-19', 'Version compare for resubmissions'],
        ['2026-11-19', 'Bangla throughout the interface and reports; printable bilingual report'],
        ['2026-11-19', 'Fix agent with approval gate; plan image reading'],
        ['2026-11-19', 'Number guard; works without AI'],
        ['2026-11-20', '/docs page: pitch, technical documentation, live status, access control'],
      ] },
    ],
  },
];
