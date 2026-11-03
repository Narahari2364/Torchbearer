// Server-only retrieval over ONE workflow's reasoned chunks (the steps an expert recorded,
// explained and approved in Mapping). The Coach may only grade against what this returns.
import type { WorkflowRecord } from "./types";

export interface Chunk {
  id: string;
  title: string;
  did: string; // what the expert did / what was seen when recording
  why: string; // the expert's own reasoning
  rule: string; // the expert's stated rule or condition
  status: "confirmed" | "low_value"; // from the expert's check in Mapping
  text: string; // everything above, for matching and for verifying quotes
}

export function chunksOf(w: WorkflowRecord): Chunk[] {
  return w.map.steps.map((s) => {
    const title = s.title ?? "";
    // "Corrected by Paul (Torchbearer saw: …)" records a mis-observation, not Paul's way of working.
    const did = /^Corrected by /.test(s.decision ?? "") ? "" : (s.decision ?? "");
    const why = s.expertQuote || s.reason || "";
    const rule = s.guardrails.join(" ");
    return {
      id: s.id,
      title,
      did,
      why,
      rule,
      status: s.review === "not_needed" ? "low_value" : "confirmed",
      text: [title, did, why, rule].filter(Boolean).join(" \n"),
    };
  });
}

const EMBED_MODEL = "gemini-embedding-001";

async function embed(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((t) => ({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text: t }] }, taskType, outputDimensionality: 768 })),
    }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
  const data = (await res.json()) as { embeddings: { values: number[] }[] };
  return data.embeddings.map((e) => e.values);
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
};

// Chunk embeddings per workflow version (warm server instances reuse them).
const cache = new Map<string, number[][]>();

/**
 * Minimum similarity for a chunk to count as "plausibly about" the learner's action.
 * Calibrated on gemini-embedding-001: on-task actions scored 0.63–0.76 against their steps,
 * off-task actions (another app, another task) 0.50–0.62.
 */
export const MATCH_THRESHOLD = 0.625;

/** The chunks of THIS workflow that plausibly match the action, best first. Empty = no match. */
export async function retrieve(workflow: WorkflowRecord, action: string, topK = 3): Promise<{ chunk: Chunk; score: number }[]> {
  const chunks = chunksOf(workflow).filter((c) => c.text.trim());
  if (!chunks.length || !action.trim()) return [];
  const version = `${workflow.id}\u0000${chunks.map((c) => `${c.id}:${c.text}`).join("\u0000")}`;
  let vecs = cache.get(version);
  if (!vecs) {
    vecs = await embed(chunks.map((c) => c.text), "RETRIEVAL_DOCUMENT");
    cache.set(version, vecs);
  }
  const [q] = await embed([action], "RETRIEVAL_QUERY");
  return chunks
    .map((chunk, i) => ({ chunk, score: cosine(q, vecs![i]) }))
    .filter((r) => r.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"'‘’`]/g, "").replace(/\s+/g, " ").trim();

/** True when `evidence` is really (word for word) part of the chunk. */
export function quoteIsInChunk(evidence: string, chunk: Chunk): boolean {
  const e = norm(evidence).replace(/[.,;:!?]+$/, "");
  return e.length >= 8 && norm(chunk.text).includes(e);
}

/** Every number in the message must appear in the chunk (no invented thresholds or amounts). */
export function numbersComeFromChunk(message: string, chunk: Chunk): boolean {
  const nums = message.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const inChunk = new Set((chunk.text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));
  return nums.every((n) => inChunk.has(n.replace(",", ".")));
}
