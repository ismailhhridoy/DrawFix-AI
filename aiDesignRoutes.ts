/**
 * Gemini routes for the three "AI proposes, code verifies, a person approves" features:
 *   POST /api/ai/propose-layout-fixes  Gemini proposes layout edits; the browser re-measures them.
 *   POST /api/ai/agent-step            One step of the fix agent: Gemini picks the next tool call.
 *   POST /api/ai/read-plan-image       Gemini traces a floor-plan image/PDF (positions only, 0-1000 units).
 *
 * The server only relays and shape-checks. Every edit is validated and re-measured by the
 * rule engine on the client (src/engine/layoutEdits.ts, fixAgent.ts, visionPlan.ts).
 */
import type { Express } from 'express';
import { ThinkingLevel, Type, type GoogleGenAI } from '@google/genai';

type GenerateJson = (ai: GoogleGenAI, contents: unknown, config: Record<string, unknown>) => Promise<string>;

export interface DesignRouteDeps {
  getGeminiClient: () => GoogleGenAI | null;
  generateJson: GenerateJson;
}

const EDIT_DOC = `Allowed edit kinds. ALWAYS include every field shown; copy ids exactly from the plan JSON (never use a placeholder or omit an id field).

RULES:
- floorIndex: the integer index of the floor (0 = ground floor). Include it in every edit except add_stair.
- IDs (doorId, wallId, stairId, dimensionId): copy the exact id string from the plan JSON (e.g. "d-3", "w-12"). Never invent an id; never output the string "undefined".
- along: a fraction from 0 to 1 where 0=wall start, 0.5=midpoint, 1=wall end. It is NOT a distance in metres.
- move_wall: a horizontal wall (same y at both ends) moves vertically — set dx=0 and dy=SHIFT (metres). A vertical wall (same x) moves horizontally — set dx=SHIFT and dy=0. Never set both.

EDIT KINDS:
- {"kind":"unlock_door","floorIndex":0,"doorId":"d-3"}  — remove lock from door d-3 on floor 0. doorId must be an id from floors[floorIndex].doors.
- {"kind":"widen_door","floorIndex":0,"doorId":"d-3","widthM":1.2}  — widen door to 1.2 m (0.8–2.4). doorId as above.
- {"kind":"move_wall","floorIndex":0,"wallId":"w-12","dx":0,"dy":1.0}  — shift horizontal inner wall 1 m up. wallId must be an id from floors[floorIndex].walls.
- {"kind":"add_exit_door","floorIndex":0,"wallId":"w-5","along":0.5,"widthM":1.2}  — new exit door at the midpoint (along=0.5) of outer wall w-5 on the ground floor. wallId must be an id from floors[0].walls listed as "outer".
- {"kind":"move_door","floorIndex":0,"doorId":"d-2","wallId":"w-5","along":0.3}  — move door to 30% along wall. doorId and wallId from floors[floorIndex].
- {"kind":"add_stair","x":25.0,"y":10.0,"widthM":3.0,"depthM":3.0,"label":"NEW-STAIR-B"}  — new stair on ALL floors at (x,y) metres; sides 2.4–6 m; must be inside the floor bounds and not cross any wall.
- {"kind":"set_stair","floorIndex":0,"stairId":"stair-1","headroomM":2.1}  — fix stair dimension. Include only the field(s) you are changing. stairId from floors[floorIndex].stairs.
- {"kind":"sync_dimension","floorIndex":0,"dimensionId":"dim-1"}  — rewrite a stale dimension. dimensionId from floors[floorIndex].dimensions.`;

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
  required: ['kind', 'floorIndex'],
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

const VISION_SYSTEM =
  'You trace architectural floor plan drawings into geometry. You report positions only, in normalised image coordinates; you never report real-world measurements or code compliance.';

const VISION_PROMPT = `This is an architectural floor plan (one floor). Trace it.
Use image coordinates where x=0 is the left edge and x=1000 is the right edge. Use the SAME scale for y: y=0 is the TOP of the image. Do NOT rescale y to 1000 — for a landscape image the y values will be less than 1000; for a portrait image they will be greater than 1000. Keep the x and y scales equal.
(For a PDF, use the first page.)
Return:
- walls: every wall as a straight centre-line segment [x1,y1,x2,y2]; mark exterior=true for the outer boundary walls. Leave a gap in the wall where a door opening is.
- doors: each door opening's centre {x,y}, its opening width in the same units (widthUnits), and isExit=true only if it leads outside or is labelled as an exit/fire exit. label = any text on it.
- rooms: each room's label text exactly as written (any language) and its outline polygon as [[x,y],...] corners.
- stairs: each stair's outline polygon and label.
- notes: anything you could not read (scale bar, unclear areas).
Do not guess dimensions in metres; only trace positions.`;

const P = { type: Type.ARRAY, items: { type: Type.NUMBER } };
const VISION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    walls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { x1: { type: Type.NUMBER }, y1: { type: Type.NUMBER }, x2: { type: Type.NUMBER }, y2: { type: Type.NUMBER }, exterior: { type: Type.BOOLEAN } },
        required: ['x1', 'y1', 'x2', 'y2'],
      },
    },
    doors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, widthUnits: { type: Type.NUMBER }, isExit: { type: Type.BOOLEAN }, label: { type: Type.STRING } },
        required: ['x', 'y'],
      },
    },
    rooms: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, polygon: { type: Type.ARRAY, items: P } }, required: ['label', 'polygon'] } },
    stairs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, polygon: { type: Type.ARRAY, items: P } }, required: ['polygon'] } },
    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['walls', 'doors', 'rooms'],
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
    if (data.length > 14_500_000) {
      res.status(413).json({ error: 'File too large (about 10 MB at most).' });
      return;
    }
    const ai = deps.getGeminiClient();
    if (!ai) {
      res.status(503).json({ source: 'none', error: 'Reading plan images needs the AI model, which is not configured on this server.' });
      return;
    }
    try {
      const contents = [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data } },
            { text: VISION_PROMPT },
          ],
        },
      ];
      const text = await deps.generateJson(ai, contents, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
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
