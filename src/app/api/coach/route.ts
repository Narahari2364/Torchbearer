// POST /api/coach — Teaching: compare what the new hire just did on screen with the expert's
// approved steps. Returns a verdict: "match" (good, go on), "different" (not how the expert
// does it: say plainly what isn't right and why; also goes under review for the supervisor),
// or "none" (nothing to say yet).
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { geminiJson } from "@/lib/gemini";
import { redact, redactDeep } from "@/lib/redact";

const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-3.1-flash-lite"];

const COACH = `You are a calm tutor watching a new hire do a task on their screen, one screenshot every few seconds.
You know how the expert does this task: their approved STEPS, with their reasons and rules.
Ignore the browser's own bars and any small floating "Torchbearer" window.

Compare what the new hire did between the PREVIOUS and CURRENT screenshot with the expert's steps.
The new hire is on a DIFFERENT case than the expert. The expert's specific values (project numbers, people's names, restaurants, amounts, dates) are examples, not rules: never tell the new hire to use them. Judge only against the kind of action, the expert's reasons and their stated rules (e.g. which documents a case like this needs, a limit that triggers an approval).
Return JSON only:
{
  "action": string | null,          // one sentence: what the new hire just did (name attached documents and key values). null if nothing meaningful changed.
  "stepId": string | null,          // the id of the expert's step this action belongs to
  "verdict": "match" | "different" | "none",
  "message": string | null,         // what to tell the new hire, 1–2 short sentences
  "nextHint": string | null,        // optional: what the expert does next
  "saved": boolean,                 // true if the CURRENT screen shows the new hire just saved or submitted something
  "rules": [{ "stepId": string, "rule": string, "applies": boolean, "met": boolean, "why": string }]  // when saved: EVERY rule of the expert, checked against this case
}

verdict:
- "match": the action fits how the expert does that step (and respects their rules). message: short, warm confirmation and, if useful, what comes next in general terms (never a specific value from the expert's case), e.g. "That's right, that's how it's done here. Next, check the amount per person."
- "different": the action breaks one of the expert's rules or differs from their way (e.g. a missing or extra attachment, a different choice, skipping a step, saving before something the expert always adds). message: say clearly and kindly what is not right, then the expert's reason in a few words, then what to do instead. Be direct, not blaming, e.g. "That one isn't quite right: your expert always attaches the approval when it's over the limit. Add it before you save." Only call it "different" when you are sure from the screen; if you can't tell, use "none".
- "none": nothing meaningful happened, the action is still in progress, or you can't tell. message null.

Rule check at every save: when the new hire saves or submits ("saved": true), go through EVERY rule in the expert's steps. For each one, "applies" says whether this case meets the rule's condition (e.g. the amount is above the rule's limit), and "met" whether what the rule asks for was done (e.g. the required document is in the attachments you saw). An order confirmation, booking or photo is not a receipt or invoice unless the rule says it counts. Use the values on the new hire's own screen. If a rule applies and is not met, the verdict is "different".

Documents: track which documents the new hire selected or attached from the screens where their names are visible (e.g. a receipt gallery or an attachments list) and from WHAT THE NEW HIRE DID SO FAR. Never assume a document (like an approval) is attached unless you saw its name. If something is saved and a document the expert's rules require was never seen, that is "different".
Vary your wording: the RECENT MESSAGES below were already said; never start the same way or reuse the same praise. Sound like a friendly colleague, not a script.
Never mock or blame the new hire. Don't repeat a verdict for a step already listed as DONE or UNDER REVIEW unless the new hire did something new there.
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
  type Out = { action?: string | null; stepId?: string | null; verdict?: string; message?: string | null; nextHint?: string | null; saved?: boolean; rules?: { stepId?: string; rule?: string; applies?: boolean; met?: boolean; why?: string }[] };
  const r = await geminiJson<Out>(COACH, parts, MODELS);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  const out = redactDeep(r.data);
  let verdict = out.verdict === "match" || out.verdict === "different" ? out.verdict : "none";
  let message = out.message ?? null;
  // A save that breaks one of the expert's rules is never "looks right", whatever the verdict said.
  const broken = out.saved && Array.isArray(out.rules) ? out.rules.find((x) => x?.applies === true && x?.met === false && x.rule) : undefined;
  if (broken && verdict !== "different") {
    verdict = "different";
    const ruleStep = b.steps.find((s) => s.id === broken.stepId) ?? b.steps.find((s) => s.rule && s.rule.toLowerCase().includes(String(broken.rule).toLowerCase().slice(0, 25)));
    if (ruleStep) out.stepId = ruleStep.id;
    message = `That one isn't quite right yet: your expert's rule is "${broken.rule}".${broken.why ? ` ${broken.why}` : ""} Fix it before you move on.`;
  }
  return NextResponse.json({ action: out.action ?? null, stepId: out.stepId ?? null, verdict, message: verdict === "none" ? null : message, nextHint: out.nextHint ?? null });
}
