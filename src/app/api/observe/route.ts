// POST /api/observe — the screenshot-only Torchbearer's brain. Two modes:
//  "observe"   (screenshots) what the user just did, the updated workflow, and an optional
//              question about something the screenshots alone cannot explain.
//  "integrate" (text only, fast) write the expert's spoken answers into the workflow.
import { NextResponse } from "next/server";
import { geminiJson } from "@/lib/gemini";
import { redact, redactDeep } from "@/lib/redact";
import type { ObservedStep, ObserveQA } from "@/lib/types";

// Fast models first: one call per changed screen must take a couple of seconds, not tens.
const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];

const STEP_SHAPE = `{ "id": "w1", "title": string, "detail": string, "why": string | null, "rule": string | null, "time": "mm:ss" }`;

const OBSERVE = `You are an apprentice watching an expert do a task on their screen, one screenshot every few seconds.
Your job: write down the expert's workflow as it happens, and notice what the screenshots alone cannot explain.
Ignore the browser's own bars and any small floating "Torchbearer" window; look only at the app the expert works in.

You get the PREVIOUS screenshot (if any), the CURRENT screenshot, the ACTION LOG (what the expert did so far), the WORKFLOW so far, and the QUESTIONS already asked.

Return JSON only:
{
  "action": string | null,
  "workflow": [ ${STEP_SHAPE} ],
  "question": string | null
}

action: one sentence on what the expert did between PREVIOUS and CURRENT, with the specifics a colleague would need: which record or item, key values, and the NAMES of any documents attached or removed. null if nothing meaningful changed (scrolling, mouse moves, typing in progress).

workflow: the FULL workflow so far, in order. Keep every existing step, its id, why and rule. Add a step only for a new meaningful kind of action; when the expert repeats an earlier kind of action differently, add a step for the difference. Use NOW as time for new steps. Leave why and rule as they are; never invent them.

question: this is what makes you an apprentice, not a recorder. Compare the CURRENT action with the ACTION LOG.
- Best question: the expert handled a similar thing differently than before in the ACTION LOG (an extra or missing attachment, a different choice for a similar item). Ask what the difference is for.
- On the first time you see a kind of action, ask only if a choice looks unusual or like a rule, limit or exception. Routine form-filling (entering amounts, names, dates) is not worth a question.
- Never ask about what the screen already shows. Never repeat an asked question.
- At most 15 words, friendly, about what just happened on screen.
- Otherwise null.

Never include personal data (emails, phone, card or bank numbers).`;

const INTEGRATE = `You keep an expert's workflow. The expert just answered questions out loud.
Write each answer into the workflow step it is about:
- "why": the reason, close to the expert's own words (one or two sentences). Only what the expert said.
- "rule": any limit, exception or stop condition they state, as a short rule in the expert's own terms and numbers. null if none. Never add a limit, number or condition the expert did not say.
If an answer describes a rule that applies to a step not in the workflow yet, add that step with the answer's time.
Keep all steps, ids, titles and times. Return JSON only: { "workflow": [ ${STEP_SHAPE} ] }`;

const toPart = (dataUrl: string) => ({
  inlineData: { mimeType: "image/jpeg", data: dataUrl.replace(/^data:image\/\w+;base64,/, "") },
});

interface Body {
  mode?: "observe" | "integrate";
  frame?: string;
  previous?: string | null;
  workflow: ObservedStep[];
  actions?: { time: string; text: string }[];
  qa: ObserveQA[];
  asked: string[];
  now: string;
}

const clean = (steps: ObservedStep[] | undefined, fallback: ObservedStep[]) =>
  (steps ?? fallback).map((s, i) => ({ ...s, id: s.id || `w${i + 1}`, why: s.why ?? null, rule: s.rule ?? null }));

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const { workflow, qa, asked, now } = body;

  if (body.mode === "integrate") {
    const text = redact(`NOW: ${now}\n\nWORKFLOW:\n${JSON.stringify(workflow)}\n\nQUESTIONS AND THE EXPERT'S ANSWERS:\n${qa.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n\n")}`);
    const r = await geminiJson<{ workflow?: ObservedStep[] }>(INTEGRATE, [{ text }], MODELS);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json({ workflow: clean(redactDeep(r.data).workflow, workflow) });
  }

  const context = redact(
    `NOW: ${now}\n\nACTION LOG:\n${(body.actions ?? []).map((a) => `${a.time} ${a.text}`).join("\n") || "(nothing yet)"}\n\nWORKFLOW SO FAR:\n${JSON.stringify(workflow)}\n\nALREADY ASKED (do not repeat):\n${asked.join("\n") || "(none)"}`,
  );
  const parts = [
    { text: context },
    ...(body.previous ? [{ text: "PREVIOUS screenshot:" }, toPart(body.previous)] : []),
    { text: "CURRENT screenshot:" },
    toPart(body.frame ?? ""),
  ];
  const r = await geminiJson<{ action?: string | null; workflow?: ObservedStep[]; question?: string | null }>(OBSERVE, parts, MODELS);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });

  const out = redactDeep(r.data);
  return NextResponse.json({
    action: out.action ?? null,
    workflow: clean(out.workflow, workflow),
    question: out.question && !asked.includes(out.question) ? out.question : null,
  });
}
