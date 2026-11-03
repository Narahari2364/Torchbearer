"use client";
// Teaching loop: watch the new hire's screen (screenshot every 2 s) and send each change to
// /api/coach with only the workflow's id. The server grades against chunks it retrieves from
// that workflow in the database; this hook adds no steps, rules or hints of its own.
// Only "match" / "different" verdicts backed by a quoted chunk are shown or spoken.
// Anything that might differ goes to the supervisor's review list, never "you're wrong".
// Must be used inside <ConversationProvider>.

import { useEffect, useRef, useState } from "react";
import { elapsed, resetSession } from "@/lib/events";
import { loadMastery, loadReviews, saveMastery, saveReviews } from "@/lib/session";
import { useVoiceAgent } from "@/lib/useVoiceAgent";
import type { ReviewItem, StepMastery, WorkflowRecord } from "@/lib/types";
import { ScreenWatcher, shareErrorText, type Frame } from "./screenWatcher";

const PAUSE_MS = 2000;
const LEARNER = "Maya Chen";

export type CoachStatus = "idle" | "connecting" | "watching" | "reading" | "speaking" | "done";

export interface CoachMessage {
  text: string;
  verdict: "match" | "different";
  time: string;
  stepTitle: string; // the expert's step the verdict is grounded in
  evidence: string; // the exact words from that step
}

export function useCoach(workflow: WorkflowRecord | null) {
  const workflowId = workflow?.id ?? "";
  const agent = useVoiceAgent("tutor");
  const watcher = useRef(new ScreenWatcher());
  const [sharing, setSharing] = useState(false);
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [message, setMessage] = useState<CoachMessage | null>(null);
  const [uncovered, setUncovered] = useState<string | null>(null); // last action the expert's recording doesn't cover
  const [finished, setFinished] = useState(false);
  // Learned / relearn per step: this session, and what was saved from earlier sessions.
  const [mastery, setMastery] = useState<Record<string, StepMastery>>({});
  const [sessions, setSessions] = useState(0); // bumps on start/stop so saved progress is re-read
  const [previous, setPrevious] = useState<Record<string, StepMastery>>({});
  useEffect(() => {
    let live = true;
    if (workflowId) loadMastery(workflowId, LEARNER).then((m) => live && setPrevious(m));
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
    if (workflowId) saveMastery(workflowId, LEARNER, { [stepId]: value });
  }

  async function onFrame(f: Frame) {
    if (!f.changed || inFlight.current || !workflowId) return;
    inFlight.current = true;
    setReading(true);
    const now = elapsed();
    const l = live.current;
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, frame: f.dataUrl, previous: lastSent.current, recent: recent.current, history: actions.current.slice(-5).map((a) => a.text) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      lastSent.current = f.dataUrl;
      setError(null);
      if (data.action) actions.current = [...actions.current, { time: now, text: data.action }];
      if (data.verdict === "no_match" && data.action) setUncovered(data.action);
      if (data.verdict === "match" || data.verdict === "different") setUncovered(null);
      if (data.verdict === "match" && data.stepId) {
        if (!l.done.includes(data.stepId)) setDone((d) => [...d, data.stepId]);
        mark(data.stepId, "learned");
      }
      if (data.verdict === "different") {
        const item: ReviewItem = {
          id: `r${Date.now()}`,
          time: now,
          screenshot: watcher.current.grab(640) ?? undefined,
          observed: data.action ?? "Something on this screen",
          expected: `${data.stepTitle}: "${data.evidence}"`, // the expert's own words, quoted from the retrieved step
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
      if (data.message && data.evidence && (data.verdict === "match" || data.verdict === "different")) {
        setMessage({ text: data.message, verdict: data.verdict, time: now, stepTitle: data.stepTitle, evidence: data.evidence });
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
    setUncovered(null);
    setFinished(false);
    masteryRef.current = {};
    setMastery({});
    setSessions((n) => n + 1);
    recent.current = [];
    // Keep anything the supervisor hasn't reviewed yet; a submitted batch starts fresh.
    loadReviews().then((prev) => {
      pendingReviews.current = prev && !prev.submitted ? prev.items : [];
    });
    if (!workflowId) {
      setError("Pick an approved workflow first.");
      return;
    }
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
        `[DONE] Maya finished. Learned: ${Object.values(masteryRef.current).filter((m) => m === "learned").length} step(s); to relearn: ${Object.values(masteryRef.current).filter((m) => m === "relearn").length}; ${live.current.reviews.length} item(s) went to the supervisor for review. Close warmly in two sentences, without saying anything was wrong.`,
      );
      setTimeout(() => live.current.agent.endSession(), 12000);
    }
  }

  // The voice agent gets no Work Map: it only reads out [GUIDE] lines, which come from the
  // server already grounded in a quoted step. It can't improvise rules from a map it never saw.

  const status: CoachStatus = finished ? "done" : !sharing ? "idle" : agent.status === "connecting" ? "connecting" : agent.isSpeaking ? "speaking" : reading ? "reading" : "watching";

  return { status, sharing, done, flagged, reviews, message, uncovered, finished, mastery, previous, error: error ?? agent.error, start, stop, transcript: agent.transcript, connected: agent.connected, micLevel: agent.getInputVolume };
}

export type Coach = ReturnType<typeof useCoach>;
