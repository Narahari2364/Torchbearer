import type { ScreenEvent, TranscriptLine } from "@/lib/types";

// The expert's session from the demo script, as Ledgerline events + the voice transcript.
// Use this to build the Work Map / debrief without running a live capture.

const e = (time: string, type: string, description: string, extra: Partial<ScreenEvent> = {}): ScreenEvent => ({
  time, invoiceId: "", type, description, source: "dom", ...extra,
});

export const fakeEvents: ScreenEvent[] = [
  e("00:20", "report_opened", 'Opened expense report "Food – October" (€0.00)'),
  e("00:35", "expense_form_opened", "Opened a new Meals / Drinks expense form"),
  e("00:50", "attachment_added", "Attached Receipt – Trattoria da Lupo.jpg (invoice)", { docId: "p1-inv" }),
  e("01:05", "expense_saved", "Saved the expense at Trattoria da Lupo: €25.00, Eat In, 1 guests (€25.00 pp), attachments: Receipt – Trattoria da Lupo.jpg"),
  e("01:40", "expense_form_opened", "Opened a new Meals / Drinks expense form"),
  e("01:55", "attachment_added", "Attached Receipt – Brauhaus Kesselmann.jpg (invoice)", { docId: "p2-inv" }),
  e("02:25", "attachment_added", "Attached Screenshot – approval J. Weber (dinner 30.09.).png (approval_email)", { docId: "p2-ok" }),
  e("02:50", "expense_saved", "Saved the expense at Brauhaus Kesselmann: €40.00, Eat In, 1 guests (€40.00 pp), attachments: receipt, approval screenshot"),
  e("03:30", "expense_form_opened", "Opened a new Meals / Drinks expense form"),
  e("03:45", "attachment_added", "Attached Bitebox receipt 48213.pdf (order_confirmation)", { docId: "p3-conf" }),
  e("04:00", "attachment_added", "Attached Bitebox invoice BBX-DE-2026-48213.pdf (invoice)", { docId: "p3-inv" }),
  e("05:10", "expense_saved", "Saved the expense at Saigon Kitchen: €26.78, Take Away, 1 guests (€26.78 pp), attachments: Bitebox receipt, Bitebox invoice"),
];

export const fakeTranscript: TranscriptLine[] = [
  { time: "00:10", speaker: "expert", text: "Hey ElevenLabs agent, I'm going to record my workflow for how I submit expenses, and I'll call out the different rules as I go. First, I'm going to enter some food expenses." },
  { time: "02:30", speaker: "agent", text: "You added a screenshot on this one that wasn't on the first one. What's that for?" },
  { time: "02:34", speaker: "expert", text: "Over $30 a person, I need proof my supervisor actually signed off. A screenshot of an email or a chat works, as long as it shows the date, the amount and who was there. Under $30, I don't need that at all, I can just submit it myself." },
  { time: "03:25", speaker: "expert", text: "Now I'm going to enter my last food expense, a meal I ordered on a delivery app." },
  { time: "04:05", speaker: "agent", text: "Why isn't one enough?" },
  { time: "04:08", speaker: "expert", text: "They do different jobs. The receipt just shows what I paid. It's not tax-compliant on its own. The invoice has the actual VAT breakdown finance needs, and it doesn't come to me automatically. I have to go into the app separately and download it. So for this one, I always upload both." },
  { time: "04:35", speaker: "agent", text: "Why didn't you need to do this for the other two meals?" },
  { time: "04:38", speaker: "expert", text: "Those were sit-down restaurant receipts. Those are already tax-compliant on their own, they have all the detail built in. It's really only Uber Eats and other delivery apps where the default receipt isn't enough." },
  { time: "05:30", speaker: "agent", text: "Quick check before I write this up. Does the 30 threshold ever change, or is it always the same number?" },
  { time: "05:33", speaker: "expert", text: "Always the same. $30 a person is the line everywhere." },
  { time: "05:50", speaker: "agent", text: "So: restaurant meals under $30 a person, submit as-is. Over $30, attach a screenshot of your supervisor's written approval. For delivery apps, always attach both the receipt and the separately downloaded invoice. Restaurant receipts don't need that second step. Did I get that right?" },
  { time: "06:05", speaker: "expert", text: "Yep, that's it." },
];
