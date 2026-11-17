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
const PORT = 3000;

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
        model: 'gemini-embedding-2',
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
        model: 'gemini-embedding-2',
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

// Role 2: Fuzzy CAD room label reconciliation -> fixed BNBC taxonomy
app.post('/api/ai/reconcile-labels', async (req, res) => {
  const labels = (req.body?.labels as LabelInput[]) || [];
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
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Reconcile these architectural CAD room labels (which may use English abbreviations or Bangla script) to exactly one taxonomy from: ["bedroom", "cabin", "corridor", "stair", "exit", "workfloor", "utility", "lobby"].\n\nLabels:\n${JSON.stringify(labels)}`,
      config: {
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
      },
    });

    const raw = (response.text ?? '[]').trim();
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
  const violations = (req.body?.violations as ViolationInput[]) || [];
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
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Explain each deterministic BNBC / Imarat rule violation below in clear English and natural Bangla (বাংলা).
STRICT GUARDRAIL: Never state any measurement, distance, width, FAR/MGC ratio, or clause number that is not explicitly present in the input JSON object for that violation.

Violations JSON:
${JSON.stringify(violations)}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You are a building code compliance explainer for RAJUK / FSCD reviewers and real estate developers in Bangladesh. You only translate and explain deterministic rule-engine findings in concise English and Bangla. Do NOT compute measurements or invent clause numbers.',
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
      },
    });

    const raw = (response.text ?? '[]').trim();
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
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Summarize what geometric remediations were applied to the parsed floor plan JSON and how escape times changed.
STRICT GUARDRAIL: Only reference numbers and changes explicitly provided in this JSON. State clearly that the original DXF file is unchanged and this is a JSON geometry preview.

Payload:
${JSON.stringify(payload)}`,
      config: {
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
      },
    });

    const raw = (response.text ?? '{}').trim();
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
  }));

  const ai = getGeminiClient();
  if (!ai) {
    const top = chunks[0]?.chunk;
    res.json({
      source: 'lexical-rag',
      retrievalMode,
      citations,
      answerEn: top
        ? `Based on ${top.part} (${top.clause}): ${top.text}`
        : 'No matching BNBC / Imarat Bidhimala clause found.',
      answerBn: top
        ? `${top.part} (${top.clause}) অনুযায়ী: ${top.title}। বিস্তারিত নিয়মাবলি নিচের উদ্ধৃত ধারায় দেখুন।`
        : 'সংশ্লিষ্ট কোনো বিধি পাওয়া যায়নি।',
    });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Answer the user's Bangladesh building code / RAJUK / FSCD question strictly using the RETRIEVED CLAUSES and ACTIVE PROJECT TELEMETRY below.
STRICT GUARDRAILS:
1. Do NOT invent any clause numbers, setbacks, FAR ratios, or distances outside the provided clauses and project telemetry.
2. Cite the exact doc/clause IDs from RETRIEVED CLAUSES in your answer.
3. Provide a clear, concise answer in both English and natural Bangla (বাংলা).

User Question: ${question}

Retrieved Clauses:
${JSON.stringify(
  chunks.map((c) => ({
    docId: c.chunk.docId,
    clause: `${c.chunk.part} ${c.chunk.clause}`,
    title: c.chunk.title,
    text: c.chunk.text,
  }))
)}

Active Building Telemetry (deterministic rule-engine state):
${JSON.stringify(projectContext)}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You are PlanCheck AI Grounded Regulatory Copilot for RAJUK officers, FSCD inspectors, and real-estate developers in Bangladesh. Never hallucinate code thresholds; synthesize strictly from retrieved chunks and deterministic project telemetry.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answerEn: { type: Type.STRING },
            answerBn: { type: Type.STRING },
          },
          required: ['answerEn', 'answerBn'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
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
    querySeed || 'BNBC fire egress FAR MGC setback scrutiny',
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
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Draft a formal pre-submission / RAJUK & FSCD scrutiny deficiency memo in English AND official Bangla (বাংলা) strictly grounded in the deterministic audit data below.
STRICT GUARDRAIL: Never fabricate measurements, clause numbers, plot sizes, or room names not present in the input JSON. Clearly label this as an automated engineering pre-scrutiny memo requiring human officer sign-off.

Audit Data:
${JSON.stringify(payload)}

Retrieved Regulatory Reference Clauses:
${JSON.stringify(chunks.map((c) => ({ clause: `${c.chunk.part} ${c.chunk.clause}`, title: c.chunk.title })))}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You draft concise, formal RAJUK / FSCD plan scrutiny deficiency memos in English and official Bangla for Bangladesh municipal and developer workflows. Every number and citation must come verbatim from the supplied audit JSON.',
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
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({
      source: 'gemini-rag',
      decisionStatus,
      citedClauses,
      subjectEn: parsed.subjectEn || `Plan Scrutiny Memo — ${payload.projectName || 'Building'}`,
      subjectBn: parsed.subjectBn || `নকশা যাচাই স্মারক — ${payload.projectName || 'ভবন'}`,
      memoBodyEn: parsed.memoBodyEn || '',
      memoBodyBn: parsed.memoBodyBn || '',
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
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Map these raw AutoCAD DXF layer names from an architectural drawing into our parser's layer categories: wallLayers, doorLayers, windowLayers, stairLayers, textLayers, dimLayers. Only return layer names that actually appear in layersFound (or standard fallbacks like A-WALL if none match).

layersFound: ${JSON.stringify(layersFound)}
sampleTexts: ${JSON.stringify(sampleTexts.slice(0, 20))}`,
      config: {
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
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({ source: 'gemini', conventions: parsed });
  } catch (err) {
    console.error('Layer convention inference error:', err);
    res.json({ source: 'heuristic', conventions: null });
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
    console.log(`PlanCheck AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
