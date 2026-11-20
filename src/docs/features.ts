// Feature matrix. Status is maintained here by hand; counts and AI availability are filled in
// at request time from the code (see payload.ts), so they cannot drift from the real app.
export type FeatureStatus = 'shipped' | 'in-progress' | 'planned';

export interface FeatureItem {
  id: string;
  area: string;
  name: string;
  status: FeatureStatus;
  needsAi: boolean; // true = works only when the Gemini key is configured
}

export const FEATURES: FeatureItem[] = [
  { id: 'dxf-upload', area: 'Input', name: 'AutoCAD DXF upload, multi-floor stacking', status: 'shipped', needsAi: false },
  { id: 'dwg-message', area: 'Input', name: 'Clear message to save DWG as DXF', status: 'shipped', needsAi: false },
  { id: 'sample-buildings', area: 'Input', name: 'Built-in sample buildings', status: 'shipped', needsAi: false },
  { id: 'plan-image', area: 'Input', name: 'Plan image or PDF reading', status: 'shipped', needsAi: true },
  { id: 'parser', area: 'Parser', name: 'Rooms, doors, exits, stairs and units from the drawing', status: 'shipped', needsAi: false },
  { id: 'bangla-labels', area: 'Parser', name: 'Bangla room labels and Unicode escapes', status: 'shipped', needsAi: false },
  { id: 'review', area: 'Review', name: 'Reviewer marks doors as Exit or Locked; plot data entered by a person', status: 'shipped', needsAi: false },
  { id: 'rules', area: 'Compliance', name: '23 code checks with trust levels', status: 'shipped', needsAi: false },
  { id: 'escape-routes', area: 'Compliance', name: 'Measured escape routes; "No route" for blocked rooms', status: 'shipped', needsAi: false },
  { id: 'not-checked', area: 'Compliance', name: '"Not checked" list with reasons', status: 'shipped', needsAi: false },
  { id: 'fix-proposals', area: 'Fixes', name: 'Layout fix proposals, re-checked by the code', status: 'shipped', needsAi: true },
  { id: 'fix-agent', area: 'Fixes', name: 'Fix agent with approval gate and undo', status: 'shipped', needsAi: true },
  { id: 'standard-fixes', area: 'Fixes', name: 'Hand-written standard fixes (work without AI)', status: 'shipped', needsAi: false },
  { id: '3d-replay', area: 'Simulate', name: '3D escape replay, before and after fixes', status: 'shipped', needsAi: false },
  { id: 'version-compare', area: 'Resubmission', name: 'Version compare: cleared, new, still open', status: 'shipped', needsAi: false },
  { id: 'permit-desk', area: 'Permits', name: 'Permit checklist and correction-letter reader', status: 'shipped', needsAi: false },
  { id: 'exports', area: 'Export', name: 'PDF, printable English/Bangla report, TXT summaries', status: 'shipped', needsAi: false },
  { id: 'bangla-ui', area: 'Language', name: 'English, Bangla and bilingual interface', status: 'shipped', needsAi: false },
  { id: 'review-note', area: 'AI', name: 'Draft review note (labelled not an approval)', status: 'shipped', needsAi: true },
  { id: 'question-box', area: 'AI', name: 'Question box over reference notes', status: 'shipped', needsAi: true },
  { id: 'docs-page', area: 'Docs', name: '/docs: pitch, technical docs and live status', status: 'shipped', needsAi: false },
  { id: 'real-dxf', area: 'Validation', name: 'Test on a real architect\'s DXF', status: 'planned', needsAi: false },
  { id: 'bangla-review', area: 'Validation', name: 'Native Bangla review of all building-code wording', status: 'planned', needsAi: false },
  { id: 'clause-verify', area: 'Validation', name: 'Verify screening limits against the gazette text', status: 'planned', needsAi: false },
  { id: 'mobile', area: 'UI', name: 'Full mobile layout pass', status: 'shipped', needsAi: false },
];

export const WORKSPACE_STEPS = ['Upload', 'Review', 'Report', 'Fixes', '3D view', 'Export'];
