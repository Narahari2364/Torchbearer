// POST /api/vision { frame, previous? } (base64 JPEG data URLs) → { events } describing what changed.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { geminiJson, VISION_MODELS } from "@/lib/gemini";
import { redactDeep } from "@/lib/redact";
import type { ScreenEvent } from "@/lib/types";

const INSTRUCTIONS = `You watch an employee's screen while they file expenses in an expense tool (reports, expense forms, receipts, guests, attachments). You get the PREVIOUS frame (if any) and the CURRENT frame.
Report only what CHANGED between them that matters for the work: a report or expense form opened, a receipt or document opened, a field value changed (e.g. Spent, Type of Meal, Location, Business Purpose), a guest added or removed, an attachment added, a save or an error/warning banner.
Return JSON: {"events":[{"invoiceId": string, "type": "screen_opened"|"document_opened"|"field_changed"|"guest_added"|"attachment_added"|"saved"|"error_shown", "field"?: string, "from"?: string, "to"?: string, "description": string}]}
- invoiceId: the receipt/invoice/report number if visible, else "".
- description: one short sentence, e.g. "Type of Meal changed from Take Away to Eat In".
- Return {"events": []} if nothing meaningful changed (scrolling, mouse movement, typing in progress).
- Privacy: never include personal names, emails, IBANs or bank details; refer to documents by their number.`;

const toPart = (dataUrl: string) => ({
  inlineData: { mimeType: "image/jpeg", data: dataUrl.replace(/^data:image\/\w+;base64,/, "") },
});

export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { frame, previous } = (await req.json()) as { frame: string; previous?: string | null };
  const parts = previous
    ? [{ text: "PREVIOUS frame:" }, toPart(previous), { text: "CURRENT frame:" }, toPart(frame)]
    : [{ text: "CURRENT frame (no previous):" }, toPart(frame)];

  const result = await geminiJson<{ events?: Omit<ScreenEvent, "time" | "source">[] }>(INSTRUCTIONS, parts, VISION_MODELS);
  if (!result.ok) return NextResponse.json({ error: result.error, events: [] }, { status: 502 });
  return NextResponse.json({ events: redactDeep(result.data.events ?? []) });
}
