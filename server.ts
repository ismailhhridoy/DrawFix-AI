import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  REGULATORY_CORPUS,
  type RegulatoryClauseChunk,
} from './src/engine/bnbcCorpus.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// Models are tried in order; the first one that answers is remembered.
const envPrimary =
  process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== 'gemini-2.5-flash'
    ? process.env.GEMINI_MODEL
    : 'gemini-4-hydrogen';
const envFallback =
  process.env.GEMINI_FALLBACK_MODEL && process.env.GEMINI_FALLBACK_MODEL !== 'gemini-2.5-flash'
    ? process.env.GEMINI_FALLBACK_MODEL
    : 'gemini-3.1-flash-lite';
const MODEL_CANDIDATES = [envPrimary, envFallback].filter(
  (m, i, arr) => m && arr.indexOf(m) === i
);
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
let workingModel: string | null = null;
let lastAiError: string | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

type GenConfig = Record<string, unknown>;

/** Calls Gemini, falling back to the next model name if one is rejected. */
async function generateJson(ai: GoogleGenAI, contents: string, config: GenConfig): Promise<string> {
  const order = workingModel
    ? [workingModel, ...MODEL_CANDIDATES.filter((m) => m !== workingModel)]
    : MODEL_CANDIDATES;
  let lastErr: unknown = null;
  const errSummary: string[] = [];
  for (const model of order) {
    for (const withThinking of [true, false]) {
      try {
        const cfg = { ...config };
        if (!withThinking) delete cfg.thinkingConfig;
        const response = await ai.models.generateContent({ model, contents, config: cfg });
        workingModel = model;
        lastAiError = null;
        return (response.text ?? '').trim();
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        errSummary.push(`${model}(think=${withThinking}): ${msg.slice(0, 140)}`);
      }
    }
  }
  lastAiError = errSummary.join(' | ').slice(0, 500) || 'Gemini call failed';
  console.warn('[Gemini generateJson failed]', lastAiError);
  throw lastErr;
}

// ============================================================================
// Hybrid BNBC / Imarat Bidhimala RAG Engine (BM25 Lexical + Optional Embeddings)
// ============================================================================
const BANGLA_SYNONYM_MAP: [RegExp, string][] = [
  [/দরজা|ফটক/g, 'door exit'],
  [/তালা|তালাবদ্ধ|বন্ধ/g, 'locked obstructed'],
  [/সিঁড়ি|সিড়ি|সোপান/g, 'stair staircase'],
  [/দূরত্ব|হাঁটার/g, 'travel distance 16m 22.5m'],
  [/করিডোর|বারান্দা|পথ/g, 'corridor passage width'],
  [/জানালা|আলো|বাতাস/g, 'window daylight ventilation'],
  [/শয়ন|বেডরুম|ঘর/g, 'bedroom habitable 9.5'],
  [/স্প্রিংকলার/g, 'sprinkler 22.5m'],
  [/উচ্চতা|বহুতল|লিফট/g, 'high rise 20m fire lift'],
  [/সেটব্যাক|ছাড়/g, 'setback front rear side'],
  [/ফার|রাস্তা/g, 'far road width'],
  [/এমজিসি|জমি|আচ্ছাদন/g, 'mgc ground coverage'],
  [/রাজউক|অনুমোদন/g, 'rajuk imarat bidhimala'],
  [/রাইজার|ট্রেড|ধাপ/g, 'riser tread 610 648'],
  [/কেবিন/g, 'cabin 16 0.75'],
  [/প্রস্থ/g, 'width'],
  [/ফায়ার|অগ্নি/g, 'fscd fire egress'],
];

function tokenizeQuery(raw: string): string[] {
  let enriched = raw.toLowerCase();
  for (const [pattern, expansion] of BANGLA_SYNONYM_MAP) {
    if (pattern.test(enriched)) {
      enriched += ` ${expansion}`;
    }
  }
  return enriched
    .replace(/[^a-z0-9.\u0980-\u09ff\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreLexicalChunk(
  chunk: RegulatoryClauseChunk,
  tokens: string[],
  rawLower: string,
  occupancyClass?: string
): number {
  let score = 0;
  const hayText = `${chunk.title} ${chunk.clause} ${chunk.part} ${chunk.text}`.toLowerCase();
  const keyText = `${chunk.keywords.join(' ')} ${chunk.topics.join(' ')}`.toLowerCase();

  for (const tok of tokens) {
    if (chunk.clause.toLowerCase().includes(tok)) score += 4.0;
    if (chunk.title.toLowerCase().includes(tok)) score += 3.0;
    if (keyText.includes(tok)) score += 2.6;
    if (hayText.includes(tok)) score += 1.4;
  }

  // Exact clause or numeric token boost
  const clauseDigits = chunk.clause.match(/\d+(\.\d+)*/g) || [];
  for (const d of clauseDigits) {
    if (d.length >= 3 && rawLower.includes(d)) score += 5.0;
  }

  if (
    occupancyClass &&
    (chunk.occupancyScope.includes('all') ||
      chunk.occupancyScope.includes(
        occupancyClass as 'industrial_rmg' | 'residential' | 'mixed'
      ))
  ) {
    score *= 1.15;
  }

  return score;
}

const corpusEmbeddingCache = new Map<string, number[]>();

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

async function ensureCorpusEmbeddings(ai: GoogleGenAI): Promise<boolean> {
  if (corpusEmbeddingCache.size >= REGULATORY_CORPUS.length) return true;
  try {
    for (const chunk of REGULATORY_CORPUS) {
      if (corpusEmbeddingCache.has(chunk.id)) continue;
      const resp = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: `${chunk.docId} ${chunk.clause} ${chunk.title}: ${chunk.text}`,
      });
      const values = resp.embeddings?.[0]?.values;
      if (values && values.length > 0) {
        corpusEmbeddingCache.set(chunk.id, values);
      } else {
        return false;
      }
    }
    return corpusEmbeddingCache.size === REGULATORY_CORPUS.length;
  } catch (err) {
    console.warn('Embedding index unavailable, using BM25 lexical RAG:', err);
    return false;
  }
}

async function hybridRetrieveClauses(
  query: string,
  occupancyClass?: string,
  topK = 5
): Promise<{
  chunks: { chunk: RegulatoryClauseChunk; score: number }[];
  retrievalMode: 'hybrid-embedding' | 'bm25-lexical';
}> {
  const tokens = tokenizeQuery(query);
  const rawLower = query.toLowerCase();

  const lexicalScores = REGULATORY_CORPUS.map((chunk) => ({
    chunk,
    lex: scoreLexicalChunk(chunk, tokens, rawLower, occupancyClass),
  }));
  const maxLex = Math.max(1, ...lexicalScores.map((x) => x.lex));

  const ai = getGeminiClient();
  let queryVec: number[] | null = null;
  if (ai && (await ensureCorpusEmbeddings(ai))) {
    try {
      const qResp = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: query,
      });
      queryVec = qResp.embeddings?.[0]?.values ?? null;
    } catch {
      queryVec = null;
    }
  }

  const retrievalMode: 'hybrid-embedding' | 'bm25-lexical' = queryVec
    ? 'hybrid-embedding'
    : 'bm25-lexical';

  const scored = lexicalScores.map(({ chunk, lex }) => {
    const normLex = lex / maxLex;
    if (queryVec) {
      const docVec = corpusEmbeddingCache.get(chunk.id);
      const cos = docVec ? Math.max(0, cosineSimilarity(queryVec, docVec)) : 0;
      return {
        chunk,
        score: Number((0.62 * normLex + 0.38 * cos).toFixed(3)),
      };
    }
    return {
      chunk,
      score: Number(normLex.toFixed(3)),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return {
    chunks: scored.slice(0, topK),
    retrievalMode,
  };
}

interface LabelInput {
  id: string;
  originalLabel: string;
}

interface ViolationInput {
  id: string;
  ruleId: string;
  ruleName: string;
  citation: string;
  roomName: string;
  measuredValue: number;
  limitValue: number;
  unit: string;
  comparator: string;
  description: string;
  fixSummary: string | null;
}

interface FixNarrationInput {
  planName: string;
  deltas: { summary: string; action: string }[];
  beforeFailCount: number;
  afterFailCount: number;
  beforeWorstSec: number;
  afterWorstSec: number;
  beforeTrappedCount: number;
  afterTrappedCount: number;
}

const app = express();
app.use(express.json({ limit: '4mb' }));

// Small per-address limit so a public demo link cannot drain the API key.
const hits = new Map<string, { n: number; t: number }>();
app.use('/api', (req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.t > 60_000) hits.set(key, { n: 1, t: now });
  else if (++rec.n > 40) {
    res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
    return;
  }
  next();
});

// Tells the interface whether the language model is available, so it never claims AI that is not running.
app.get('/api/health', (_req, res) => {
  res.json({
    aiConfigured: Boolean(getGeminiClient()),
    model: workingModel || MODEL_CANDIDATES[0],
    lastAiError,
  });
});

// Role 2: Fuzzy CAD room label reconciliation -> fixed BNBC taxonomy
app.post('/api/ai/reconcile-labels', async (req, res) => {
  const labels = ((req.body?.labels as LabelInput[]) || []).slice(0, 300);
  if (!Array.isArray(labels) || labels.length === 0) {
    res.status(400).json({ error: 'No room labels supplied.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.json({ source: 'heuristic', mappings: [] });
    return;
  }

  try {
    const rawText = await generateJson(ai, `Reconcile these architectural CAD room labels (which may use English abbreviations or Bangla script) to exactly one taxonomy from: ["bedroom" (sleeping room), "habitable" (living, dining, kitchen, dwelling unit), "cabin" (enclosed office or partitioned room), "corridor", "stair", "exit", "workfloor" (production, sewing, canteen), "utility" (store, toilet, plant, loading), "lobby"].\n\nLabels:\n${JSON.stringify(labels)}`, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You normalize CAD room labels to a strict architectural egress taxonomy. Never invent measurements or compliance verdicts. Keep each reason under 12 words.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              taxonomy: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              reason: { type: Type.STRING },
            },
            required: ['id', 'taxonomy', 'confidence', 'reason'],
          },
        },
      });

    const raw = rawText || '[]';
    const mappings = JSON.parse(raw);
    res.json({ source: 'gemini', mappings });
  } catch (err) {
    console.error('Gemini label reconciliation error:', err);
    res.json({
      source: 'heuristic',
      mappings: [],
      warning: 'AI reconciliation unavailable; using deterministic CAD token rules.',
    });
  }
});

// Role 1: Bilingual (English + Bangla) violation explanation strictly grounded in rule-engine output
app.post('/api/ai/explain-violations', async (req, res) => {
  const violations = ((req.body?.violations as ViolationInput[]) || []).slice(0, 60);
  if (!Array.isArray(violations) || violations.length === 0) {
    res.json({ source: 'template', explanations: [] });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.json({ source: 'template', explanations: [] });
    return;
  }

  try {
    const rawText = await generateJson(ai, `Explain each rule-engine finding below in plain English and natural Bangla (বাংলা) for a building owner.
STRICT RULES:
1. Never state any measurement, distance, width, ratio or clause number that is not in the input JSON for that finding.
2. If "measuredValue" is null there is no route at all: say so, do not give a distance.
3. If "basis" is "screening", say the limit is a screening threshold that a reviewer must confirm. Do not call it a BNBC requirement.
4. One or two short sentences per field.

Violations JSON:
${JSON.stringify(violations)}`, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You explain building plan-check findings to owners and reviewers in Bangladesh. You only reword findings that a deterministic rule engine already produced. You never compute, estimate or add measurements, limits or clause numbers.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              en: { type: Type.STRING, description: '1-2 sentence plain English safety/code explanation using only supplied numbers' },
              bn: { type: Type.STRING, description: '1-2 sentence natural Bangla safety/code explanation using only supplied numbers' },
              actionEn: { type: Type.STRING, description: 'Concrete remediation step in English' },
              actionBn: { type: Type.STRING, description: 'Concrete remediation step in Bangla' },
            },
            required: ['id', 'en', 'bn', 'actionEn', 'actionBn'],
          },
        },
      });

    const raw = rawText || '[]';
    const explanations = JSON.parse(raw);
    res.json({ source: 'gemini', explanations });
  } catch (err) {
    console.error('Gemini violation explainer error:', err);
    res.json({ source: 'template', explanations: [] });
  }
});

// Role 3: Before/After fix narration grounded in deterministic deltas & escape times
app.post('/api/ai/narrate-fixes', async (req, res) => {
  const payload = req.body as FixNarrationInput | undefined;
  if (!payload || !Array.isArray(payload.deltas)) {
    res.status(400).json({ error: 'Invalid remediation payload.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.json({ source: 'template', narration: null });
    return;
  }

  try {
    const rawText = await generateJson(ai, `Summarize what geometric remediations were applied to the parsed floor plan JSON and how escape times changed.
STRICT GUARDRAIL: Only reference numbers and changes explicitly provided in this JSON. State clearly that the original DXF file is unchanged and this is a JSON geometry preview.

Payload:
${JSON.stringify(payload)}`, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You write concise bilingual (English + Bangla) engineering captions comparing before/after fire-egress geometry transforms. Never invent numbers.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headlineEn: { type: Type.STRING },
            headlineBn: { type: Type.STRING },
            summaryEn: { type: Type.STRING },
            summaryBn: { type: Type.STRING },
            bulletChanges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  en: { type: Type.STRING },
                  bn: { type: Type.STRING },
                },
                required: ['en', 'bn'],
              },
            },
          },
          required: ['headlineEn', 'headlineBn', 'summaryEn', 'summaryBn', 'bulletChanges'],
        },
      });

    const raw = rawText || '{}';
    const narration = JSON.parse(raw);
    res.json({ source: 'gemini', narration });
  } catch (err) {
    console.error('Gemini fix narration error:', err);
    res.json({ source: 'template', narration: null });
  }
});

// Role 4: Grounded Hybrid RAG BNBC / Imarat Bidhimala Code Copilot
app.post('/api/rag/query', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  const occupancyClass =
    typeof req.body?.occupancyClass === 'string' ? req.body.occupancyClass : undefined;
  const projectContext = req.body?.projectContext ?? null;

  if (!question) {
    res.status(400).json({ error: 'Please provide a regulatory question.' });
    return;
  }

  const { chunks, retrievalMode } = await hybridRetrieveClauses(question, occupancyClass, 4);
  const citations = chunks.map(({ chunk, score }) => ({
    id: chunk.id,
    docId: chunk.docId,
    clause: `${chunk.part} — ${chunk.clause}`,
    title: chunk.title,
    excerpt: chunk.text,
    score,
    basis: chunk.basis,
  }));

  const ai = getGeminiClient();
  if (!ai) {
    const top = chunks[0]?.chunk;
    res.json({
      source: 'lexical-rag',
      retrievalMode,
      citations,
      answerEn: top
        ? `${top.part}, ${top.clause}: ${top.text}`
        : 'DrawFix Ai has no indexed reference note on that question.',
      answerBn: '',
    });
    return;
  }

  try {
    const rawText = await generateJson(ai, `Answer the user's Bangladesh building code / RAJUK / FSCD question strictly using the RETRIEVED CLAUSES and ACTIVE PROJECT TELEMETRY below.
STRICT RULES:
1. Use only numbers and clause references that appear in the retrieved notes or the project data.
2. Each note has a "basis". For "verified" notes you may say BNBC 2012 requires it. For "screening" notes you must say it is this tool's screening threshold and has not been verified against the gazette.
3. If the notes do not answer the question, say that the indexed reference corpus does not cover it. Do not answer from general knowledge.
4. Answer concisely in clear English.

User Question: ${question}

Retrieved Clauses:
${JSON.stringify(
  chunks.map((c) => ({
    docId: c.chunk.docId,
    basis: c.chunk.basis,
    clause: `${c.chunk.part} ${c.chunk.clause}`,
    title: c.chunk.title,
    text: c.chunk.text,
  }))
)}

Active Building Telemetry (deterministic rule-engine state):
${JSON.stringify(projectContext)}`, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You answer questions about a building plan check using only the retrieved reference notes and the project data supplied. You never add thresholds or clause numbers from memory.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answerEn: { type: Type.STRING },
            answerBn: { type: Type.STRING },
          },
          required: ['answerEn', 'answerBn'],
        },
      });

    const parsed = JSON.parse(rawText || '{}');
    res.json({
      source: 'gemini-rag',
      retrievalMode,
      citations,
      answerEn: parsed.answerEn || citations[0]?.excerpt || '',
      answerBn: parsed.answerBn || '',
    });
  } catch (err) {
    console.error('RAG synthesis error:', err);
    const top = chunks[0]?.chunk;
    res.json({
      source: 'lexical-rag',
      retrievalMode,
      citations,
      answerEn: top
        ? `Based on ${top.part} (${top.clause}): ${top.text}`
        : 'Unable to synthesize answer.',
      answerBn: top
        ? `${top.part} (${top.clause}) অনুযায়ী: ${top.title}।`
        : 'উত্তর তৈরি করা সম্ভব হয়নি।',
    });
  }
});

// Role 5: One-Click RAJUK / FSCD Plan Scrutiny Deficiency Memo (EN + বাংলা)
app.post('/api/ai/deficiency-memo', async (req, res) => {
  const payload = req.body || {};
  const violations = Array.isArray(payload.violations) ? payload.violations : [];
  const failCount = Number(payload.beforeFailCount ?? 0);
  const decisionStatus =
    failCount > 0
      ? 'OBJECTION_RAISED'
      : Number(payload.beforeWarnCount ?? 0) > 0
        ? 'CONDITIONAL_REVIEW'
        : 'CLEARED_FOR_FILING';

  const querySeed = violations
    .slice(0, 8)
    .map((v: ViolationInput) => `${v.ruleName} ${v.citation}`)
    .join(' ');
  const { chunks } = await hybridRetrieveClauses(
    querySeed || 'exit travel distance stair passage',
    payload.occupancyClass,
    6
  );
  const citedClauses = Array.from(
    new Set([
      ...violations.map((v: ViolationInput) => v.citation).filter(Boolean),
      ...chunks.map((c) => `${c.chunk.part} (${c.chunk.clause})`),
    ])
  ).slice(0, 10);

  const ai = getGeminiClient();
  if (!ai) {
    res.json({
      source: 'template',
      decisionStatus,
      citedClauses,
      subjectEn: '',
      subjectBn: '',
      memoBodyEn: '',
      memoBodyBn: '',
    });
    return;
  }

  try {
    const rawText = await generateJson(ai, `Draft a short pre-submission review note in clear English from the audit data below, for the building owner's own use.
STRICT RULES:
1. Use only measurements, clause references, plot sizes and room names present in the input JSON.
2. Start by stating that this is a DRAFT produced by DrawFix Ai, that it is not a RAJUK or Fire Service document, and that it is not an approval.
3. Do not write it in the voice of any authority, and do not use letterhead, memo numbers or signatures.
4. Say which findings rest on screening thresholds that a reviewer must confirm.

Audit Data:
${JSON.stringify(payload)}

Retrieved Regulatory Reference Clauses:
${JSON.stringify(chunks.map((c) => ({ clause: `${c.chunk.part} ${c.chunk.clause}`, title: c.chunk.title })))}`, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You write concise draft review notes about building plans in English and Bangla. Every number and reference must come verbatim from the supplied audit JSON. You never imitate an official document.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subjectEn: { type: Type.STRING },
            subjectBn: { type: Type.STRING },
            memoBodyEn: { type: Type.STRING },
            memoBodyBn: { type: Type.STRING },
          },
          required: ['subjectEn', 'subjectBn', 'memoBodyEn', 'memoBodyBn'],
        },
      });

    const parsed = JSON.parse(rawText || '{}');
    res.json({
      source: 'gemini-rag',
      decisionStatus,
      citedClauses,
      subjectEn: parsed.subjectEn || `Draft pre-submission review note: ${payload.projectName || 'Building'}`,
      subjectBn: '',
      memoBodyEn: parsed.memoBodyEn || '',
      memoBodyBn: '',
    });
  } catch (err) {
    console.error('Deficiency memo error:', err);
    res.json({
      source: 'template',
      decisionStatus,
      citedClauses,
      subjectEn: '',
      subjectBn: '',
      memoBodyEn: '',
      memoBodyBn: '',
    });
  }
});

// Role 6: AI CAD Layer Auto-Mapper for unfamiliar DXF firm conventions
app.post('/api/ai/infer-conventions', async (req, res) => {
  const layersFound = Array.isArray(req.body?.layersFound)
    ? (req.body.layersFound as string[])
    : [];
  const sampleTexts = Array.isArray(req.body?.sampleTexts)
    ? (req.body.sampleTexts as string[])
    : [];

  if (layersFound.length === 0) {
    res.status(400).json({ error: 'No DXF layers provided.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.json({ source: 'heuristic', conventions: null });
    return;
  }

  try {
    const rawText = await generateJson(ai, `Map these raw AutoCAD DXF layer names from an architectural drawing into our parser's layer categories: wallLayers, doorLayers, windowLayers, stairLayers, textLayers, dimLayers. Only return layer names that actually appear in layersFound (or standard fallbacks like A-WALL if none match).

layersFound: ${JSON.stringify(layersFound)}
sampleTexts: ${JSON.stringify(sampleTexts.slice(0, 20))}`, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You classify AutoCAD DXF layer names into architectural entity categories (walls, doors/exits, windows, stairs, text/room tags, dimensions). Return only valid JSON.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            wallLayers: { type: Type.ARRAY, items: { type: Type.STRING } },
            doorLayers: { type: Type.ARRAY, items: { type: Type.STRING } },
            windowLayers: { type: Type.ARRAY, items: { type: Type.STRING } },
            stairLayers: { type: Type.ARRAY, items: { type: Type.STRING } },
            textLayers: { type: Type.ARRAY, items: { type: Type.STRING } },
            dimLayers: { type: Type.ARRAY, items: { type: Type.STRING } },
            rationale: { type: Type.STRING },
          },
          required: [
            'wallLayers',
            'doorLayers',
            'windowLayers',
            'stairLayers',
            'textLayers',
            'dimLayers',
            'rationale',
          ],
        },
      });

    const parsed = JSON.parse(rawText || '{}');
    res.json({ source: 'gemini', conventions: parsed });
  } catch (err) {
    console.error('Layer convention inference error:', err);
    res.json({ source: 'heuristic', conventions: null });
  }
});

// Role 7: Corrections Letter Interpreter & Resubmission Package Builder
app.post('/api/ai/interpret-corrections', async (req, res) => {
  const payload = req.body || {};
  const letterText = typeof payload.letterText === 'string' ? payload.letterText.trim() : '';
  const authorityName =
    typeof payload.authorityName === 'string' && payload.authorityName.trim()
      ? payload.authorityName.trim()
      : 'Building Approval & Plan Scrutiny Desk';

  if (!letterText) {
    res.status(400).json({ error: 'Corrections letter text is required.' });
    return;
  }

  const ai = getGeminiClient();
  if (!ai) {
    res.json({ source: 'deterministic', items: null, responseLetter: null });
    return;
  }

  try {
    const { chunks } = await hybridRetrieveClauses(
      letterText.slice(0, 800),
      payload.occupancyClass,
      6
    );
    const rawText = await generateJson(
      ai,
      `Interpret this building authority corrections/objection letter item by item, cross-reference against the active CAD audit telemetry (if supplied) and the retrieved regulatory clauses, and draft a point-by-point resubmission response letter in clear English.

STRICT RULES:
1. Only cite numerical measurements and violations present in beforeSummary/afterSummary/metrics. Never invent CAD dimensions.
2. If no CAD plan is loaded (beforeSummary is null), clearly note that geometry needs CAD upload verification.
3. Keep clauses grounded in the retrieved notes or the objection letter.

Authority: ${authorityName}
Project Name: ${payload.projectName || 'Submitted Building Project'}
Site Metrics: ${JSON.stringify(payload.metrics || null)}
Active CAD Audit (Before): ${JSON.stringify(payload.beforeSummary || null)}
Remediated Copy Audit (After): ${JSON.stringify(payload.afterSummary || null)}
Retrieved Regulatory Clauses: ${JSON.stringify(
        chunks.map((c) => ({
          clause: `${c.chunk.part} ${c.chunk.clause}`,
          basis: c.chunk.basis,
          title: c.chunk.title,
          text: c.chunk.text,
        }))
      )}

Corrections Letter:
${letterText.slice(0, 6000)}`,
      {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You are an architectural permit compliance engineer helping architects and builders respond accurately to municipal plan-check corrections letters. Never invent CAD measurements.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  itemNumber: { type: Type.STRING },
                  objectionSummary: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    enum: [
                      'Zoning & Setback',
                      'Fire & Egress',
                      'Habitability & Space',
                      'Stair Safety',
                      'Documentation',
                    ],
                  },
                  resolutionStatus: {
                    type: Type.STRING,
                    enum: [
                      'resolved_in_copy',
                      'linked_to_cad_finding',
                      'needs_designer_action',
                      'procedural_document',
                    ],
                  },
                  citedClause: { type: Type.STRING },
                  cadEvidence: { type: Type.STRING },
                  recommendedResponse: { type: Type.STRING },
                },
                required: [
                  'itemNumber',
                  'objectionSummary',
                  'category',
                  'resolutionStatus',
                  'citedClause',
                  'cadEvidence',
                  'recommendedResponse',
                ],
              },
            },
            responseLetter: { type: Type.STRING },
          },
          required: ['items', 'responseLetter'],
        },
      }
    );

    const parsed = JSON.parse(rawText || '{}');
    if (Array.isArray(parsed.items) && parsed.items.length > 0 && parsed.responseLetter) {
      res.json({
        authorityName,
        projectSummary: payload.projectName || 'Submitted Building Project',
        source: 'gemini-rag',
        items: parsed.items,
        responseLetter: parsed.responseLetter,
      });
      return;
    }
    res.json({ source: 'deterministic', items: null, responseLetter: null });
  } catch (err) {
    console.error('Corrections interpretation error:', err);
    res.json({ source: 'deterministic', items: null, responseLetter: null });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DrawFix Ai running at http://localhost:${PORT}`);
    console.log(
      getGeminiClient()
        ? `Gemini enabled (models tried in order: ${MODEL_CANDIDATES.join(', ')})`
        : 'GEMINI_API_KEY not set: explanations use fixed wording and labels use keyword matching.'
    );
  });
}

startServer();
