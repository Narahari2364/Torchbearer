// POST /api/coach — Teaching: compare what the new hire just did on screen with the expert's
// approved steps. Returns a gentle verdict: "match" (good, go on), "different" (might differ
// from the expert → goes under review for the supervisor), or "none" (nothing to say yet).
// It never tells the new hire they are wrong.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { geminiJson } from "@/lib/gemini";
import { redact, redactDeep } from "@/lib/redact";

const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];

const COACH = `You are a calm tutor watching a new hire do a task on their screen, one screenshot every few seconds.
You know how the expert does this task: their approved STEPS, with their reasons and rules.
Ignore the browser's own bars and any small floating "Torchbearer" window.

Compare what the new hire did between the PREVIOUS and CURRENT screenshot with the expert's steps.
Return JSON only:
{
  "action": string | null,          // one sentence: what the new hire just did (name attached documents and key values). null if nothing meaningful changed.
  "stepId": string | null,          // the id of the expert's step this action belongs to
  "verdict": "match" | "different" | "none",
  "message": string | null,         // what to tell the new hire, 1–2 short sentences
  "nextHint": string | null         // optional: what the expert does next
}

verdict:
- "match": the action fits how the expert does that step (and respects their rules). message: short, warm confirmation and what comes next, e.g. "That's right, that's how it's done here. Next, check the amount per person."
- "different": the action seems to differ from the expert's way or one of their rules (e.g. a missing or extra attachment, a different choice, skipping a step, saving before something the expert always adds). message: gentle, never blaming. Start with "This might be a bit different from the usual way", give the expert's reason in a few words, and say you've put it under review for the supervisor. Example: "This might be a bit different from the usual way. The supervisor's approval gets attached when it's over 30 a person. I've put it under review for your supervisor."
- "none": nothing meaningful happened or the action is still in progress. message null.

Documents: track which documents the new hire selected or attached from the screens where their names are visible (e.g. a receipt gallery or an attachments list) and from WHAT THE NEW HIRE DID SO FAR. Never assume a document (like an approval) is attached unless you saw its name. If something is saved and a document the expert's rules require was never seen, that is "different".
Vary your wording: the RECENT MESSAGES below were already said; never start the same way or reuse the same praise. Sound like a friendly colleague, not a script.
Never use the words "wrong", "mistake", "error", "incorrect" or "failed". Don't repeat a verdict for a step already listed as DONE or UNDER REVIEW unless the new hire did something new there.
Never include personal data (emails, phone, card or bank numbers).`;

const toPart = (dataUrl: string) => ({ inlineData: { mimeType: "image/jpeg", data: dataUrl.replace(/^data:image\/\w+;base64,/, "") } });

interface Body {
  frame: string;
  previous?: string | null;
  steps: { id: string; title: string; detail: string; why: string; rule: string }[];
  done: string[];
  flagged: string[];
  actions: { time: string; text: string }[];
  recent?: string[]; // last few things the tutor said, to avoid repeating itself
  now: string;
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const b = (await req.json()) as Body;
  const context = redact(
    `NOW: ${b.now}\n\nTHE EXPERT'S APPROVED STEPS:\n${b.steps
      .map((s) => `[${s.id}] ${s.title}${s.detail ? ` | seen: ${s.detail}` : ""}${s.why ? ` | why: ${s.why}` : ""}${s.rule ? ` | rule: ${s.rule}` : ""}`)
      .join("\n")}\n\nDONE: ${b.done.join(", ") || "(none)"}\nUNDER REVIEW: ${b.flagged.join(", ") || "(none)"}\n\nWHAT THE NEW HIRE DID SO FAR:\n${
      b.actions.map((a) => `${a.time} ${a.text}`).join("\n") || "(nothing yet)"
    }\n\nRECENT MESSAGES (don't repeat their wording):\n${(b.recent ?? []).join("\n") || "(none)"}`,
  );
  const parts = [{ text: context }, ...(b.previous ? [{ text: "PREVIOUS screenshot:" }, toPart(b.previous)] : []), { text: "CURRENT screenshot:" }, toPart(b.frame)];
  const r = await geminiJson<{ action?: string | null; stepId?: string | null; verdict?: string; message?: string | null; nextHint?: string | null }>(COACH, parts, MODELS);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  const out = redactDeep(r.data);
  const verdict = out.verdict === "match" || out.verdict === "different" ? out.verdict : "none";
  // Belt and braces: the new hire is never told they were wrong.
  const message = out.message?.replace(/\b(wrong|mistake|error|incorrect|failed)\b/gi, "different") ?? null;
  return NextResponse.json({ action: out.action ?? null, stepId: out.stepId ?? null, verdict, message: verdict === "none" ? null : message, nextHint: out.nextHint ?? null });
}
