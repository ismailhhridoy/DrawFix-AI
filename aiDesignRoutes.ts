/**
 * Gemini routes for the three "AI proposes, code verifies, a person approves" features:
 *   POST /api/ai/propose-layout-fixes  Gemini proposes layout edits; the browser re-measures them.
 *   POST /api/ai/agent-step            One step of the fix agent: Gemini picks the next tool call.
 *   POST /api/ai/read-plan-image       Gemini reads a floor-plan image/PDF into elements (positions only).
 *
 * The server only relays and shape-checks. Every edit is validated and re-measured by the
 * rule engine on the client (src/engine/layoutEdits.ts, fixAgent.ts, imagePlan.ts).
 */
import type { Express } from 'express';
import { ThinkingLevel, Type, type GoogleGenAI } from '@google/genai';

type GenerateJson = (ai: GoogleGenAI, contents: unknown, config: Record<string, unknown>) => Promise<string>;

export interface DesignRouteDeps {
  getGeminiClient: () => GoogleGenAI | null;
  generateJson: GenerateJson;
}

const EDIT_DOC = `Allowed edit kinds (use ONLY ids that appear in the plan JSON; coordinates are metres in the plan's own axes):
- {"kind":"unlock_door","floorIndex":F,"doorId":ID}  remove a lock/obstruction from a door.
- {"kind":"widen_door","floorIndex":F,"doorId":ID,"widthM":W}  W between 0.8 and 2.4.
- {"kind":"move_wall","floorIndex":F,"wallId":ID,"dx":DX,"dy":DY}  inner walls only. A horizontal wall (same y at both ends) moves by dy only (dx=0); a vertical wall by dx only (dy=0). At most 3 m.
- {"kind":"add_exit_door","floorIndex":0,"wallId":ID,"along":T,"widthM":W}  new street exit in an OUTER wall of the ground floor. T in 0..1 is the position along the wall from its first point to its second. Keep the opening at least 0.3 m from the wall ends and 0.6 m from other doors.
- {"kind":"move_door","floorIndex":F,"doorId":ID,"wallId":ID,"along":T}  move an existing door to another place on a wall (the old opening is closed). Exit doors must stay in outer walls.
- {"kind":"add_stair","x":X,"y":Y,"widthM":W,"depthM":D,"label":"NEW-STAIR-B"}  new stair core on ALL floors, centred at (X,Y), sides 2.4..6 m. The rectangle must not cross any wall on any floor and must be inside every floor's bounds, 3 m or more from other stairs. Put it in open floor space close to the rooms that are too far from a stair.
- {"kind":"set_stair","floorIndex":F,"stairId":ID,"headroomM":H,"handrailHeightM":R,"treadMm":T,"riserMm":S}  only the fields you change; headroom 2.0..3.0, handrail 0.85..1.1, tread 220..350, riser 120..200.
- {"kind":"sync_dimension","floorIndex":F,"dimensionId":ID}  rewrite a stale dimension text to the drawn length.`;

const EDIT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    kind: { type: Type.STRING },
    floorIndex: { type: Type.INTEGER },
    doorId: { type: Type.STRING },
    wallId: { type: Type.STRING },
    stairId: { type: Type.STRING },
    dimensionId: { type: Type.STRING },
    widthM: { type: Type.NUMBER },
    depthM: { type: Type.NUMBER },
    dx: { type: Type.NUMBER },
    dy: { type: Type.NUMBER },
    along: { type: Type.NUMBER },
    x: { type: Type.NUMBER },
    y: { type: Type.NUMBER },
    label: { type: Type.STRING },
    headroomM: { type: Type.NUMBER },
    handrailHeightM: { type: Type.NUMBER },
    treadMm: { type: Type.NUMBER },
    riserMm: { type: Type.NUMBER },
  },
  required: ['kind'],
};

const CANDIDATES_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          targetIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          edits: { type: Type.ARRAY, items: EDIT_SCHEMA },
          rationaleEn: { type: Type.STRING },
          rationaleBn: { type: Type.STRING },
        },
        required: ['targetIds', 'edits', 'rationaleEn'],
      },
    },
  },
  required: ['candidates'],
};

const PROPOSER_SYSTEM = `You are a building-layout assistant for fire-escape compliance in Bangladesh. You PROPOSE small, buildable layout changes as structured edits. You never state measurements, limits, pass/fail or clause numbers: a rule engine re-measures every proposal and a licensed person approves it. Prefer the smallest change that fixes the finding without creating a new problem (for example, do not shrink a passage below 1.2 m, do not block a route, do not place doors on walls shared with stairs). Rationale: one plain sentence, no numbers.`;

const AGENT_SYSTEM = `You are the DrawFix fix agent. You work through the failing findings of a floor-plan audit using tools, one tool call per step. A rule engine does every measurement; you never state a measurement, a limit or a pass/fail of your own. Nothing you do changes the real plan: you can only STAGE a change after try_edits has passed, and a person approves staged changes at the end.

Tools:
- run_audit {}  -> current findings on the working plan (with staged changes applied).
- get_floor {"floorIndex":F}  -> walls, doors, stairs, rooms of one floor.
- try_edits {"targetIds":[...], "edits":[...]}  -> the engine applies the edits to a copy and re-runs the audit; returns accepted/rejected with the measured reason.
- stage {"tryId":"try-N"}  -> keep an accepted try for human approval (only accepted tries can be staged).
- finish {"summary":"..."}  -> stop; the person reviews staged changes.

Strategy: run_audit first. Fix locks and exits before travel distances, because unlocking often clears travel findings too. If a try is rejected, read the reason and change the proposal; do not repeat the same edits. Stop with finish when nothing fixable is left or after repeated failures on the same finding.

${EDIT_DOC}`;

const AGENT_STEP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    thought: { type: Type.STRING },
    tool: { type: Type.STRING, enum: ['run_audit', 'get_floor', 'try_edits', 'stage', 'finish'] },
    floorIndex: { type: Type.INTEGER },
    targetIds: { type: Type.ARRAY, items: { type: Type.STRING } },
    edits: { type: Type.ARRAY, items: EDIT_SCHEMA },
    tryId: { type: Type.STRING },
    summary: { type: Type.STRING },
  },
  required: ['thought', 'tool'],
};

const VISION_SYSTEM = `You read architectural floor-plan images. You report WHERE elements are, as positions on the image, never as metres: code converts positions to metres using a scale a person confirms. Coordinates are integers 0..1000, x from the left edge, y from the TOP edge of the image. Report:
- walls: straight wall centre-lines as [x1,y1,x2,y2]; split a wall at every door opening (leave the gap open).
- doors: centre of each door opening, the two ends of the opening [x1,y1,x2,y2], whether it leads outside (exit), and whether it is drawn or labelled locked/blocked.
- rooms: each room's label text exactly as written (or "" if none) and its outline as a polygon of [x,y] points.
- stairs: outline rectangle [x1,y1,x2,y2] and label.
- scaleHint: any dimension text or scale bar you can read, copied exactly as written (for example "26000" or "1:100"), with the two image points it spans if it is a dimension line. Do not convert it.
Never invent elements you cannot see. If unsure, leave it out.`;

const P = { type: Type.ARRAY, items: { type: Type.NUMBER } };
const VISION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    walls: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { line: P, outer: { type: Type.BOOLEAN } }, required: ['line'] } },
    doors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { center: P, ends: P, exit: { type: Type.BOOLEAN }, locked: { type: Type.BOOLEAN }, label: { type: Type.STRING } },
        required: ['center', 'ends'],
      },
    },
    rooms: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, polygon: { type: Type.ARRAY, items: P } }, required: ['polygon'] } },
    stairs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { box: P, label: { type: Type.STRING } }, required: ['box'] } },
    scaleHint: {
      type: Type.OBJECT,
      properties: { text: { type: Type.STRING }, from: P, to: P },
    },
  },
  required: ['walls', 'doors', 'rooms', 'stairs'],
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text || '{}');
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

export function registerDesignRoutes(app: Express, deps: DesignRouteDeps) {
  app.post('/api/ai/propose-layout-fixes', async (req, res) => {
    const summary = req.body?.summary;
    const previous = Array.isArray(req.body?.previousAttempts) ? req.body.previousAttempts.slice(0, 6) : [];
    const maxCandidates = Math.min(3, Math.max(1, Number(req.body?.maxCandidates) || 3));
    if (!summary || typeof summary !== 'object') {
      res.status(400).json({ error: 'No plan summary supplied.' });
      return;
    }
    const ai = deps.getGeminiClient();
    if (!ai) {
      res.json({ source: 'none', candidates: [] });
      return;
    }
    try {
      const prompt = `Plan and findings (JSON):\n${JSON.stringify(summary)}\n\n${EDIT_DOC}\n\n${
        previous.length ? `Earlier attempts that the rule engine rejected (do not repeat them):\n${JSON.stringify(previous)}\n\n` : ''
      }Propose up to ${maxCandidates} alternative candidates, best first. Each candidate lists the finding ids it targets (from findingsToFix) and the edits that fix them together.`;
      const text = await deps.generateJson(ai, prompt, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        systemInstruction: PROPOSER_SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: CANDIDATES_SCHEMA,
        temperature: 0.4,
      });
      const parsed = parseJson(text) as { candidates?: unknown[] };
      const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, maxCandidates) : [];
      res.json({ source: 'gemini', candidates });
    } catch (err) {
      console.error('Layout proposal error:', err);
      res.json({ source: 'error', candidates: [], error: 'Gemini did not return proposals.' });
    }
  });

  app.post('/api/ai/agent-step', async (req, res) => {
    const transcript = Array.isArray(req.body?.transcript) ? req.body.transcript.slice(-40) : [];
    const goal = typeof req.body?.goal === 'string' ? req.body.goal.slice(0, 4000) : '';
    const ai = deps.getGeminiClient();
    if (!ai) {
      res.json({ source: 'none' });
      return;
    }
    try {
      const prompt = `Goal: ${goal}\n\nTranscript so far (your earlier tool calls and the tool results):\n${transcript
        .map((t: { role?: string; content?: unknown }) => `[${t.role === 'tool' ? 'TOOL RESULT' : 'YOU'}] ${typeof t.content === 'string' ? t.content : JSON.stringify(t.content)}`)
        .join('\n')
        .slice(-60000)}\n\nReply with your next single tool call.`;
      const text = await deps.generateJson(ai, prompt, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        systemInstruction: AGENT_SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: AGENT_STEP_SCHEMA,
        temperature: 0.3,
      });
      res.json({ source: 'gemini', step: parseJson(text) });
    } catch (err) {
      console.error('Agent step error:', err);
      res.json({ source: 'error', error: 'Gemini did not return a step.' });
    }
  });

  app.post('/api/ai/read-plan-image', async (req, res) => {
    const mimeType = String(req.body?.mimeType || '');
    const data = String(req.body?.dataBase64 || '');
    if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(mimeType) || !data) {
      res.status(400).json({ error: 'Send a PNG, JPEG, WebP or PDF as base64.' });
      return;
    }
    if (data.length > 7_000_000) {
      res.status(413).json({ error: 'File too large (about 5 MB at most).' });
      return;
    }
    const ai = deps.getGeminiClient();
    if (!ai) {
      res.json({ source: 'none' });
      return;
    }
    try {
      const contents = [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data } },
            { text: 'Read this floor plan. Return walls, doors, rooms, stairs and any scale text, using 0..1000 image coordinates.' },
          ],
        },
      ];
      const text = await deps.generateJson(ai, contents, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        systemInstruction: VISION_SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: VISION_SCHEMA,
        temperature: 0.1,
      });
      res.json({ source: 'gemini', reading: parseJson(text) });
    } catch (err) {
      console.error('Plan image reading error:', err);
      res.json({ source: 'error', error: 'Gemini could not read the image.' });
    }
  });
}
