"use client";
// Teaching loop: watch the new hire's screen (screenshot every 2 s), compare each new action
// with the expert's approved steps (/api/coach), and guide gently by voice at pauses:
// "that's right, next…" or "this might be a bit different… I've put it under review".
// Anything that might differ goes to the supervisor's review list, never "you're wrong".
// Must be used inside <ConversationProvider>.

import { useEffect, useRef, useState } from "react";
import { elapsed, resetSession } from "@/lib/events";
import { loadMastery, loadReviews, saveMastery, saveReviews } from "@/lib/session";
import { useVoiceAgent } from "@/lib/useVoiceAgent";
import type { ReviewItem, StepMastery, WorkMap } from "@/lib/types";
import { ScreenWatcher, shareErrorText, type Frame } from "./screenWatcher";

const PAUSE_MS = 2000;
// No sign-in yet, so every learner shares one progress record. Replace with the signed-in user (Cognito).
const LEARNER = "New hire";

export type CoachStatus = "idle" | "connecting" | "watching" | "reading" | "speaking" | "done";

export function useCoach(map: WorkMap, workflowId: string) {
  const agent = useVoiceAgent("tutor");
  const watcher = useRef(new ScreenWatcher());
  const [sharing, setSharing] = useState(false);
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [message, setMessage] = useState<{ text: string; verdict: "match" | "different"; time: string } | null>(null);
  const [finished, setFinished] = useState(false);
  // Learned / relearn per step: this session, and what was saved from earlier sessions.
  const [mastery, setMastery] = useState<Record<string, StepMastery>>({});
  const [sessions, setSessions] = useState(0); // bumps on start/stop so saved progress is re-read
  const [previous, setPrevious] = useState<Record<string, StepMastery>>({});
  useEffect(() => {
    let live = true;
    loadMastery(workflowId, LEARNER).then((m) => live && setPrevious(m));
    return () => {
      live = false;
    };
  }, [workflowId, sessions]);
  const [error, setError] = useState<string | null>(null);

  const live = useRef({ agent, done, flagged, reviews });
  useEffect(() => {
    live.current = { agent, done, flagged, reviews };
  });
  const lastSent = useRef<string | null>(null);
  const inFlight = useRef(false);
  const actions = useRef<{ time: string; text: string }[]>([]);
  const toSay = useRef<string | null>(null);
  const recent = useRef<string[]>([]);
  const pendingReviews = useRef<ReviewItem[]>([]); // unsubmitted items from earlier sessions
  const masteryRef = useRef<Record<string, StepMastery>>({});

  function mark(stepId: string, value: StepMastery) {
    // A step that needed a second look this session stays "relearn" until the supervisor says it's fine.
    if (value === "learned" && masteryRef.current[stepId] === "relearn") return;
    masteryRef.current = { ...masteryRef.current, [stepId]: value };
    setMastery(masteryRef.current);
    saveMastery(workflowId, LEARNER, { [stepId]: value });
  }

  const steps = map.steps.map((s) => ({
    id: s.id,
    title: (s.correction ? s.correction : s.title) + (previous[s.id] === "relearn" ? " (needed relearning last time: guide this one a bit more)" : ""),
    detail: s.decision,
    why: s.expertQuote || s.reason,
    rule: s.guardrails.join("; "),
  }));

  async function onFrame(f: Frame) {
    if (!f.changed || inFlight.current) return;
    inFlight.current = true;
    setReading(true);
    const now = elapsed();
    const l = live.current;
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame: f.dataUrl, previous: lastSent.current, steps, done: l.done, flagged: l.flagged, actions: actions.current, recent: recent.current, now }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      lastSent.current = f.dataUrl;
      setError(null);
      if (data.action) actions.current = [...actions.current, { time: now, text: data.action }];
      if (data.verdict === "match" && data.stepId) {
        if (!l.done.includes(data.stepId)) setDone((d) => [...d, data.stepId]);
        mark(data.stepId, "learned");
      }
      if (data.verdict === "different") {
        const step = map.steps.find((s) => s.id === data.stepId);
        const item: ReviewItem = {
          id: `r${Date.now()}`,
          time: now,
          screenshot: watcher.current.grab(640) ?? undefined,
          observed: data.action ?? "Something on this screen",
          expected: step ? `${step.correction || step.title}${step.guardrails[0] ? `: ${step.guardrails[0]}` : ""}` : "The expert's usual way",
          note: data.message ?? "",
          workflowId,
          stepId: data.stepId ?? undefined,
        };
        if (data.stepId) mark(data.stepId, "relearn");
        const next = [...l.reviews, item];
        setReviews(next);
        saveReviews({ learner: LEARNER, items: [...pendingReviews.current, ...next], submitted: false });
        if (data.stepId && !l.flagged.includes(data.stepId)) setFlagged((x) => [...x, data.stepId]);
      }
      if (data.message && (data.verdict === "match" || data.verdict === "different")) {
        setMessage({ text: data.message, verdict: data.verdict, time: now });
        toSay.current = data.message;
        recent.current = [...recent.current, data.message].slice(-4);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 160) : "Couldn't read the screen.");
    } finally {
      inFlight.current = false;
      setReading(false);
    }
  }

  // Speak guidance at a natural pause only.
  useEffect(() => {
    if (!agent.connected) return;
    const t = setInterval(() => {
      const a = live.current.agent;
      const text = toSay.current;
      if (!text || a.isSpeaking) return;
      if (Date.now() - watcher.current.lastChange < PAUSE_MS) return;
      if (Date.now() - a.lastUserSpeech.current < 2000) return;
      a.sendUserMessage(`[GUIDE] ${text}`);
      toSay.current = null;
    }, 800);
    return () => clearInterval(t);
  }, [agent.connected]);

  async function start() {
    setError(null);
    resetSession();
    actions.current = [];
    lastSent.current = null;
    setDone([]);
    setFlagged([]);
    setReviews([]);
    setMessage(null);
    setFinished(false);
    masteryRef.current = {};
    setMastery({});
    setSessions((n) => n + 1);
    recent.current = [];
    // Keep anything the supervisor hasn't reviewed yet; a submitted batch starts fresh.
    loadReviews().then((prev) => {
      pendingReviews.current = prev && !prev.submitted ? prev.items : [];
    });
    try {
      await watcher.current.start((f) => onFrame(f), () => setSharing(false));
      setSharing(true);
    } catch (e) {
      setError(shareErrorText(e));
      return;
    }
    agent.start();
  }

  function stop() {
    watcher.current.stop();
    setSharing(false);
    setFinished(true);
    setSessions((n) => n + 1);
    if (agent.connected) {
      agent.sendUserMessage(
        `[DONE] The new hire finished. Learned: ${Object.values(masteryRef.current).filter((m) => m === "learned").length} step(s); to relearn: ${Object.values(masteryRef.current).filter((m) => m === "relearn").length}; ${live.current.reviews.length} item(s) went to the supervisor for review. Close warmly in two sentences, without saying anything was wrong.`,
      );
      setTimeout(() => live.current.agent.endSession(), 12000);
    }
  }

  // Give the agent the Work Map once connected.
  useEffect(() => {
    if (!agent.connected) return;
    agent.sendContextualUpdate(`[WORKMAP] ${JSON.stringify(map)}`);
    const again = map.steps.filter((s) => previous[s.id] === "relearn").map((s) => s.correction || s.title);
    if (again.length) agent.sendContextualUpdate(`[PROGRESS] Last time the new hire needed to relearn: ${again.join("; ")}. Give those steps a little extra guidance.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.connected]);

  const status: CoachStatus = finished ? "done" : !sharing ? "idle" : agent.status === "connecting" ? "connecting" : agent.isSpeaking ? "speaking" : reading ? "reading" : "watching";

  return { status, sharing, done, flagged, reviews, message, finished, mastery, previous, error: error ?? agent.error, start, stop, transcript: agent.transcript, connected: agent.connected, micLevel: agent.getInputVolume };
}

export type Coach = ReturnType<typeof useCoach>;
