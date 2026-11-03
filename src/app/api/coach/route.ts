// POST /api/coach — Teaching. Grades what the new hire just did ONLY against reasoned chunks
// retrieved, at call time, from the selected expert workflow stored in the database.
//
//   1. describe   — a vision call writes one neutral sentence about what changed on screen.
//                   It knows nothing about the workflow or any business rules.
//   2. retrieve   — that sentence is embedded and matched against THIS workflow's chunks only.
//                   Nothing similar enough → "no_match" (no guidance at all).
//   3. grade      — a text-only call sees the action + the retrieved chunks and nothing else.
//   4. validate   — the cited chunk must be one we retrieved, the evidence must be a real quote
//                   from it, and every number in the message must appear in it. Otherwise "unclear".
//
// No rules, thresholds or domain examples live in this file or its prompts: if the expert
// didn't record it, the Coach can't say it. It never tells the new hire they are wrong.
import { NextResponse } from "next/server";
import { readJson, safe } from "@/lib/db";
import { geminiJson } from "@/lib/gemini";
import { redact } from "@/lib/redact";
import { numbersComeFromChunk, quoteIsInChunk, retrieve, type Chunk } from "@/lib/retrieval";
import type { WorkflowRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];

const DESCRIBE = `You see two screenshots of someone's screen: PREVIOUS and CURRENT.
Describe, in one plain sentence, what the person has done that is now visible on the CURRENT screen and was not on PREVIOUS: the result they produced (a record created or saved, items attached, fields filled, a choice made), with the names, values and counts visible on CURRENT.
If there is no PREVIOUS screenshot, describe what the CURRENT screen shows the person is working on.
Only describe what is visible. Do not judge it, do not guess intentions, do not add any rule or advice.
Ignore the browser's own bars and any small floating "Torchbearer" window.
Return JSON only: { "action": string | null }   // null if nothing meaningful changed or it is still loading`;

const GRADE = `You compare one ACTION (plus what the same person did just before it, as observed on screen) with the attached CHUNKS. Each chunk is a step an expert recorded, with the expert's own reasons and conditions.
Grade only against the attached chunks. Do not use outside knowledge, common practice, or assumptions about the business. Do not invent rules, limits, numbers or requirements.
If the chunks do not clearly say whether the action fits, answer "unclear".

Return JSON only:
{
  "verdict": "match" | "different" | "unclear",
  "chunkId": string | null,   // the id of the chunk you graded against
  "evidence": string | null,  // an exact, word-for-word quote from that chunk that supports your verdict
  "message": string | null    // 1–2 short, friendly sentences for the new hire
}

- "match": the action is what the chunk describes. The message must quote or paraphrase that chunk; no generic praise.
- "different": the action clearly departs from something the chunk states. The message starts with "This might be a bit different from how the expert recorded it", restates the chunk's own words, and says it has been put under review for the supervisor. Never blame.
- "unclear": anything else. message null.
Never say "wrong", "mistake", "error", "incorrect" or "failed". Vary wording from RECENT MESSAGES.`;

const toPart = (dataUrl: string) => ({ inlineData: { mimeType: "image/jpeg", data: dataUrl.replace(/^data:image\/\w+;base64,/, "") } });

interface Body {
  workflowId: string;
  frame: string;
  previous?: string | null;
  recent?: string[];
  history?: string[]; // the learner's own earlier actions, as described from the screen (observations, never rules)
}

type Verdict = "match" | "different" | "unclear" | "no_match" | "none";

const reply = (verdict: Verdict, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ verdict, action: null, stepId: null, stepTitle: null, evidence: null, message: null, ...extra });

const chunkBlock = (c: Chunk) =>
  `[${c.id}] (${c.status === "confirmed" ? "confirmed by the expert" : "low value: the expert marked this not needed"})\nStep: ${c.title}${c.did ? `\nWhat the expert did: ${c.did}` : ""}${c.why ? `\nExpert's reason: ${c.why}` : ""}${c.rule ? `\nExpert's condition: ${c.rule}` : ""}`;

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  const t0 = Date.now();
  const ms: Record<string, number> = {};
  const lap = (k: string) => (ms[k] = Date.now() - t0 - Object.values(ms).reduce((a, x) => a + x, 0));

  // The grading source: this workflow, read from the database right now. Nothing else.
  const workflow = b.workflowId ? await readJson<WorkflowRecord>(`workflows/${safe(b.workflowId)}.json`) : null;
  if (!workflow || !workflow.map.published) return reply("none", { reason: "workflow_unavailable" });

  // 1. Describe — no workflow, no rules.
  const parts = [...(b.previous ? [{ text: "PREVIOUS screenshot:" }, toPart(b.previous)] : []), { text: "CURRENT screenshot:" }, toPart(b.frame)];
  const d = await geminiJson<{ action?: string | null }>(DESCRIBE, parts, MODELS);
  lap("describe");
  if (!d.ok) return NextResponse.json({ error: d.error }, { status: 502 });
  const action = d.data.action?.trim() ? redact(d.data.action.trim()) : null;
  if (!action) return reply("none");

  // 2. Retrieve from this workflow's chunks only.
  let hits: { chunk: Chunk; score: number }[];
  try {
    hits = await retrieve(workflow, action);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Retrieval failed" }, { status: 502 });
  }
  lap("retrieve");
  if (!hits.length) return reply("no_match", { action, ms });

  // 3. Grade against the retrieved chunks only.
  const history = (b.history ?? []).slice(-5);
  const context = `EARLIER ACTIONS (observed):\n${history.join("\n") || "(none)"}\n\nACTION: ${action}\n\nCHUNKS:\n${hits.map((h) => chunkBlock(h.chunk)).join("\n\n")}\n\nRECENT MESSAGES:\n${(b.recent ?? []).join("\n") || "(none)"}`;
  const g = await geminiJson<{ verdict?: string; chunkId?: string | null; evidence?: string | null; message?: string | null }>(GRADE, [{ text: redact(context) }], MODELS);
  lap("grade");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: 502 });

  // 4. Validate: anything not traceable to the retrieved chunk is dropped.
  const chunk = hits.find((h) => h.chunk.id === g.data.chunkId)?.chunk;
  let verdict: Verdict = g.data.verdict === "match" || g.data.verdict === "different" ? g.data.verdict : "unclear";
  const evidence = g.data.evidence?.trim() ?? "";
  const message = (g.data.message ?? "").replace(/\b(wrong|mistake|error|incorrect|failed)\b/gi, "different").trim();
  if (verdict !== "unclear") {
    const traceable = !!chunk && quoteIsInChunk(evidence, chunk) && !!message && numbersComeFromChunk(message, chunk);
    if (!traceable) verdict = "unclear";
    else if (verdict === "different" && chunk.status === "low_value") verdict = "unclear"; // the expert said this step isn't needed
  }
  if (verdict === "unclear" || !chunk) return reply("unclear", { action, stepId: chunk?.id ?? hits[0].chunk.id, ms });

  return reply(verdict, {
    action,
    stepId: chunk.id,
    stepTitle: chunk.title,
    evidence,
    message: redact(message),
    ms,
    score: Number(hits.find((h) => h.chunk.id === chunk.id)!.score.toFixed(3)),
  });
}
