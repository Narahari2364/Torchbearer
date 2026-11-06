// POST /api/workmap { events, transcript } → WorkMap JSON, built by Gemini.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { geminiJson } from "@/lib/gemini";
import { redact, redactDeep } from "@/lib/redact";
import type { ScreenEvent, TranscriptLine, WorkMap } from "@/lib/types";

const INSTRUCTIONS = `You turn a recorded expert work session into a Work Map that a new hire can learn from.
You get screen events (what happened on screen, with mm:ss times) and the voice transcript between the expert and an apprentice agent (questions, answers, debrief, teach-back).

Return JSON only, exactly this shape:
{
  "task": string,                       // one line, what the expert was doing
  "steps": [{
    "id": "s1", "order": 1,
    "title": string,                    // short imperative, e.g. "Attach supervisor approval when over $30 a person"
    "short": string,                    // 2–4 word timeline label, e.g. "Approval over $30"
    "time": "mm:ss",                    // the screen event time this step links to
    "decision": string,                 // "" for routine steps; for judgment calls what was decided, e.g. "Changed Type of Meal to Eat In"
    "reason": string,                   // the reason, paraphrased
    "expertQuote": string,              // the expert's OWN words from the transcript, verbatim
    "guardrails": string[]              // limits, exceptions, when to stop and ask; short imperative sentences
  }],
  "gaps": string[],                     // questions still unanswered after the debrief
  "confirmed": boolean                  // true only if the expert confirmed the apprentice's teach-back
}
Events come from the app itself [dom] and from a vision model reading the screen [vision]; the same action may appear twice, so merge duplicates.
Rules: 5–9 steps in chronological order. Every judgment call and guardrail must come from the transcript or events, never invented. Prefer generalised steps ("Attach the PL approval when over $30 per person") over one-off ones.`;

export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { events, transcript } = (await req.json()) as { events: ScreenEvent[]; transcript: TranscriptLine[] };
  const input =
    "SCREEN EVENTS:\n" +
    events.map((e) => `${e.time} [${e.source}] ${e.description}`).join("\n") +
    "\n\nTRANSCRIPT:\n" +
    transcript.map((t) => `${t.time} ${t.speaker.toUpperCase()}: ${t.text}`).join("\n");

  // Personal data never reaches the model or the stored Work Map.
  const result = await geminiJson<WorkMap>(INSTRUCTIONS, [{ text: redact(input) }]);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const map = redactDeep(result.data);
  map.steps = (map.steps ?? []).map((s, i) => ({ ...s, id: s.id || `s${i + 1}`, order: i + 1, guardrails: s.guardrails ?? [] }));
  map.gaps = map.gaps ?? [];
  return NextResponse.json(map);
}
