"use client";
// Scripted stand-in for the ElevenLabs agent (mock mode only). Same surface the panels use:
// status, connected, isSpeaking, transcript, error, start, endSession, setMuted,
// sendContextualUpdate, sendUserMessage, sendUserActivity, lastUserSpeech.
// Lines follow the team demo script (meal expenses: $30-per-person approval, delivery-app invoice).

import { useEffect, useRef, useState } from "react";
import { elapsed } from "@/lib/events";
import type { TranscriptLine } from "@/lib/types";

type Turn = { who: "agent" | "expert"; text: string };

// Learning mode: one question per pause, then the expert's (simulated) answer.
const LIVE: Turn[][] = [
  [
    { who: "agent", text: "You added a screenshot on this one that wasn't on the first one. What's that for?" },
    { who: "expert", text: "Over $30 a person, I need proof my supervisor actually signed off. A screenshot of an email or a chat works, as long as it shows the date, the amount and who was there. Under $30 I don't need that at all." },
  ],
  [
    { who: "agent", text: "You uploaded two files for the Uber Eats order. Why isn't one enough?" },
    { who: "expert", text: "They do different jobs. The receipt just shows what I paid. The invoice has the tax breakdown finance needs, and I have to download it separately from Uber Eats." },
  ],
  [
    { who: "agent", text: "Why didn't you need to do that for the other two meals?" },
    { who: "expert", text: "Those were sit-down restaurant receipts, they're already tax-compliant. It's only Uber Eats and other delivery apps where the receipt isn't enough." },
  ],
];
// Generic questions for anything else, never the same one twice in a row.
const LIVE_EXTRA: Turn[][] = [
  [
    { who: "agent", text: "Is there a limit on this one, or a moment you'd stop and ask someone?" },
    { who: "expert", text: "Under thirty a person it's simple: receipt and done." },
  ],
  [
    { who: "agent", text: "Is there anything on this one you would never do?" },
    { who: "expert", text: "Never submit a meal without the receipt, that comes straight back from finance." },
  ],
  [
    { who: "agent", text: "Who would you check with before saving something like this?" },
    { who: "expert", text: "Nobody for a normal meal. Only my supervisor when it goes over thirty a person." },
  ],
];
const DEBRIEF: Turn[] = [
  { who: "agent", text: "Quick check before I write this up. Does the $30 threshold ever change, or is it always the same number?" },
  { who: "expert", text: "Always the same. $30 a person is the line everywhere." },
  { who: "agent", text: "When you say per person, does that include you?" },
  { who: "expert", text: "Yes, everyone at the table counts, me included." },
  { who: "agent", text: "Does the invoice rule apply to other delivery apps, like DoorDash?" },
  { who: "expert", text: "Any delivery app. Their receipt is never enough on its own." },
  {
    who: "agent",
    text: "So: Restaurant meals under $30 a person, submit as-is. Over $30, attach a screenshot of your supervisor's written approval. For Uber Eats or any delivery app, always attach both the receipt and the separately downloaded invoice. Did I get that right?",
  },
  { who: "expert", text: "Yep, that's it." },
];

const TUTOR = {
  greet: "Here's a new one: $35, ordered through Uber Eats. Let's walk through it together. First step: what do you upload?",
  afterReceipt: "Right. This one's a delivery order, not a sit-down restaurant. What do you think you need besides the receipt?",
  afterInvoice: "Exactly. Delivery orders need both, restaurant receipts don't. What do you think you do next?",
  blocked: "Not yet. This one's $35. What does that number remind you of?",
  blockedAgain: "Look at the amount again, and think about what the expert said about meals over $30 a person.",
  hint: "Look at the amount. What did the expert do for meals over $30 a person?",
  done: "You've got the delivery-invoice rule down cold. The one thing to practice: catching the $30 threshold yourself, without me prompting you. That's the part you hesitated on.",
  again: "Here's another one. Take it from the top: what do you upload first?",
};

const speakMs = (text: string) => Math.min(6000, Math.max(2200, text.length * 45));

export function useMockVoiceAgent(role: "interviewer" | "tutor") {
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [isSpeaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const lastUserSpeech = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const busyUntil = useRef(0);
  const askedLive = useRef(new Set<number>());
  const extraIndex = useRef(0);
  const tutor = useRef({ greeted: false, attachments: 0, blocked: 0 });

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function later(ms: number, fn: () => void) {
    timers.current.push(setTimeout(fn, ms));
  }

  /** Plays turns one after another, after anything already queued. */
  function play(turns: Turn[]) {
    let at = Math.max(Date.now(), busyUntil.current) - Date.now() + 600;
    for (const t of turns) {
      later(at, () => {
        setTranscript((tr) => [...tr, { time: elapsed(), speaker: t.who, text: t.text }]);
        if (t.who === "agent") setSpeaking(true);
        else lastUserSpeech.current = Date.now();
      });
      const dur = t.who === "agent" ? speakMs(t.text) : 1200;
      if (t.who === "agent") later(at + dur, () => setSpeaking(false));
      at += dur + (t.who === "agent" ? 1800 : 1400);
    }
    busyUntil.current = Date.now() + at;
  }
  const say = (text: string) => play([{ who: "agent", text }]);

  // Ask the scripted question that fits what the expert just did (approval screenshot → Q1,
  // delivery-app files → Q2 then Q3), anything else gets a generic limit question.
  function pickLive(pause: string): Turn[] {
    const used = askedLive.current;
    const take = (i: number) => (used.add(i), LIVE[i]);
    if (/approval/i.test(pause) && !used.has(0)) return take(0);
    if (/bitebox|uber eats|order_confirmation|delivery/i.test(pause)) {
      if (!used.has(1)) return take(1);
      if (!used.has(2)) return take(2);
    }
    return LIVE_EXTRA[extraIndex.current++ % LIVE_EXTRA.length];
  }

  function start() {
    setStatus("connecting");
    tutor.current = { greeted: false, attachments: 0, blocked: 0 };
    askedLive.current = new Set();
    extraIndex.current = 0;
    later(700, () => setStatus("connected"));
    return Promise.resolve();
  }

  function sendUserMessage(text: string) {
    if (role === "interviewer") {
      if (text.startsWith("[PAUSE]")) play(pickLive(text));
      else if (text.startsWith("[DEBRIEF]")) play(DEBRIEF);
      return;
    }
    if (text.startsWith("[BLOCKED]")) say(tutor.current.blocked++ ? TUTOR.blockedAgain : TUTOR.blocked);
    else if (text.startsWith("[HINT]")) say(TUTOR.hint);
    else if (text.startsWith("[DONE]")) say(TUTOR.done);
  }

  function sendContextualUpdate(text: string) {
    if (role !== "tutor") return;
    const t = tutor.current;
    if (text.startsWith("[WORKMAP]") && !t.greeted) {
      t.greeted = true;
      say(TUTOR.greet);
    } else if (/another practice case/i.test(text)) {
      t.attachments = 0;
      t.blocked = 0;
      say(TUTOR.again);
    } else if (/attach/i.test(text) && !/remov/i.test(text)) {
      t.attachments++;
      if (t.attachments === 1) say(TUTOR.afterReceipt);
      else if (t.attachments === 2) say(TUTOR.afterInvoice);
    }
  }

  function endSession() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSpeaking(false);
    setStatus("disconnected");
  }

  return {
    status,
    isSpeaking,
    transcript,
    error: null as string | null,
    connected: status === "connected",
    lastUserSpeech,
    start,
    endSession,
    sendUserMessage,
    sendContextualUpdate,
    setMuted: (muted: boolean) => void muted,
    sendUserActivity: () => {},
  };
}
