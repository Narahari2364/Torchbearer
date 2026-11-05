"use client";
// The Apprentice in teaching mode (/teach), following the Teaching-mode design:
// start card → popup with the coaching conversation (Hint / End practice) → when a save
// is held, the tutor's hint question plus a replay card of the expert's moment (I'll fix it)
// → "Practice complete" session report.

import { useEffect, useRef, useState } from "react";
import { ConversationProvider } from "@elevenlabs/react";
import { resetSession, subscribe } from "@/lib/events";
import { sendCommand } from "@/lib/ledgerline";
import { loadTeachingMap } from "@/lib/session";
import { useApprenticeAgent } from "@/features/mock/useApprenticeAgent";
import { redact } from "@/lib/redact";
import type { GuardrailResult } from "@/lib/types";
import Popup, { ListeningBars } from "@/features/apprentice/Popup";
import StartCard from "@/features/apprentice/StartCard";
import Dialog, { btnIndigo, btnIndigoOutline } from "@/features/apprentice/Dialog";
import { sessionReport, type RowStatus, type TeachProgress } from "./progress";

export type TeachStage = "closed" | "intro" | "live";

const NEW_HIRE = "New hire";

interface Props {
  stage: TeachStage;
  setStage: (s: TeachStage) => void;
  violations: GuardrailResult["violations"];
  progress: TeachProgress;
  onReset: () => void;
}

export default function TutorPanel(props: Props) {
  return (
    <ConversationProvider>
      <Tutor {...props} />
    </ConversationProvider>
  );
}

function Tutor({ stage, setStage, violations, progress, onReset }: Props) {
  const agent = useApprenticeAgent("tutor");
  const [held, setHeld] = useState(false); // a save is held and the hint/replay card is showing
  const [finished, setFinished] = useState(false);
  const [shared, setShared] = useState(false);
  const agentRef = useRef(agent);
  const chat = useRef<HTMLOListElement>(null);
  const map = loadTeachingMap();
  const step = violations.length ? map.steps.find((s) => s.id === violations[0].stepId) : undefined;

  useEffect(() => {
    agentRef.current = agent;
  });

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight });
  }, [agent.transcript.length, held]);

  useEffect(() => {
    if (!agent.connected) return;
    agentRef.current.sendContextualUpdate(`[WORKMAP] ${JSON.stringify(loadTeachingMap())}`);
    return subscribe((e) => {
      if (e.type === "save_blocked") {
        setHeld(true);
        agentRef.current.sendUserMessage(
          redact(`[BLOCKED] The new hire tried to save but: ${e.description}. A replay of the expert's screen moment is showing next to you. Step in now with a hint question.`),
        );
      } else {
        if (e.type === "expense_saved") setHeld(false);
        agentRef.current.sendContextualUpdate(redact(`[SCREEN] ${e.time} ${e.description}`));
      }
    });
  }, [agent.connected]);

  function start() {
    setStage("live");
    resetSession();
    onReset();
    setFinished(false);
    agent.start();
  }

  function hint() {
    agent.sendUserMessage("[HINT] The new hire asks for a hint. Give one short hint question about their next decision, in the expert's terms. Don't give the answer.");
  }

  function endPractice() {
    const r = sessionReport(progress);
    setFinished(true);
    setShared(false);
    if (agent.connected) {
      agent.sendUserMessage(
        `[DONE] The new hire is finished. How it went: ${r.rows.map((x) => `${x.label}: ${x.note}`).join("; ")}. Give them the short closing now.`,
      );
    }
  }

  function practiseAnother() {
    setFinished(false);
    setHeld(false);
    onReset();
    sendCommand({ cmd: "clear_highlight" });
    if (agent.connected) agent.sendContextualUpdate("[SCREEN] The new hire starts another practice case.");
  }

  function openReplay() {
    if (step?.docId) sendCommand({ cmd: "open_document", doc_id: step.docId });
  }

  if (stage === "closed") return null;

  if (stage === "intro") {
    return (
      <StartCard
        title="Apprentice"
        subtitle="Learn the task the way your expert does it."
        modeLabel="TEACHING MODE"
        taskLabel="Task you'll practise"
        tasks={["Meal expense report"]}
        expectations={[
          "Coaches you with <b>your expert's Work Map</b>: their steps, their reasons, their words.",
          "Asks you to predict each decision before you make it.",
          "Steps in <b>before</b> you save something your expert would never save.",
          "Can replay your expert's screen moment when it helps.",
          "Names and card numbers are hidden automatically.",
        ]}
        startLabel="Start practice"
        onStart={start}
        onClose={() => setStage("closed")}
      />
    );
  }

  if (finished) {
    const r = sessionReport(progress);
    const closing = [...agent.transcript].reverse().find((t) => t.speaker === "agent");
    const ICON: Record<RowStatus, [string, string]> = {
      alone: ["✓", "bg-ok"],
      done: ["✓", "bg-ok"],
      hint: ["!", "bg-warn"],
      open: ["×", "bg-err"],
    };
    return (
      <Dialog
        title="Practice complete"
        subtitle={`${NEW_HIRE} · unseen case: $35 delivery dinner`}
        modeLabel="TEACHING MODE"
        footer={
          <>
            <span className="flex-1 text-[13px] text-muted">{shared ? "Shared with your manager (demo, nothing is sent)." : ""}</span>
            <button className={btnIndigoOutline} onClick={() => setStage("closed")}>Close</button>
            <button className={btnIndigoOutline} onClick={() => setShared(true)} disabled={shared}>Send to my manager</button>
            <button className={btnIndigo} onClick={practiseAnother}>Practice another case</button>
          </>
        }
      >
        <div className="grid md:grid-cols-2">
          <div className="border-line p-5 md:border-r">
            <div className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[#333]">How it went</div>
            {r.rows.map((row) => (
              <div key={row.label} className="flex items-start gap-3 border-b border-[#eee] py-2.5 last:border-b-0">
                <span className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-[13px] font-bold text-white ${ICON[row.status][1]}`}>{ICON[row.status][0]}</span>
                <div className="flex-1 text-[16px]">
                  {row.label}
                  {row.detail && <div className="text-[13.5px] text-[#7a5a00]">{row.detail}</div>}
                </div>
                <span className="text-[13px] text-[#444]">{row.note}</span>
              </div>
            ))}
          </div>
          <div className="p-5">
            <div className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[#333]">Practice next</div>
            <div className="rounded-sm border border-[#c9c4f5] bg-indigo-soft px-4 py-3 text-[16px]" dangerouslySetInnerHTML={{ __html: r.practise[0] ?? "Nothing. Ready for real cases." }} />
            {closing && (
              <p className="mt-4 text-[15px] leading-snug">
                <b className="text-indigo">Tutor</b> {closing.text}
              </p>
            )}
          </div>
        </div>
      </Dialog>
    );
  }

  const status = !agent.connected ? (agent.status === "connecting" ? "Connecting…" : "Not connected") : agent.isSpeaking ? "Speaking…" : "Listening…";

  return (
    <Popup title="Apprentice" subtitle="Coaching the new hire" modeLabel="TEACHING MODE" initial={{ left: 24, bottom: 110 }} width={440} foldable>
      <div className="px-4 pb-2 pt-3">
        <div className="mb-1 text-[12.5px] text-muted">Practice case · not shown by the expert</div>
        <ol ref={chat} className="max-h-60 space-y-1.5 overflow-y-auto text-[15px] leading-snug">
          {agent.transcript.length === 0 && <li className="text-[#444]">{agent.connected ? "Starting…" : "Connecting…"}</li>}
          {agent.transcript.slice(-8).map((t, i) => (
            <li key={i}>
              <b className={t.speaker === "agent" ? "font-medium text-indigo" : "font-medium text-[#c2410c]"}>{t.speaker === "agent" ? "Tutor" : "You"}</b> {t.text}
            </li>
          ))}
        </ol>
        {held && step && (
          <button onClick={openReplay} className="mt-2 flex w-full items-center gap-3 rounded-sm border border-line bg-panel-2 p-2 text-left hover:border-indigo" title="Open the expert's document in Ledgerline">
            {step.screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={step.screenshot} alt="" className="h-16 w-24 flex-none rounded-sm border border-line object-cover" />
            ) : (
              <span className="grid h-16 w-24 flex-none place-items-center rounded-sm border border-line bg-white">
                <span className="h-0 w-0 border-y-[9px] border-l-[14px] border-y-transparent border-l-indigo" />
              </span>
            )}
            <span className="min-w-0 text-[14px] leading-snug">
              “{step.expertQuote}”
              <span className="mt-0.5 block text-[12px] text-muted">Expert · {step.time} · replaying</span>
            </span>
          </button>
        )}
        {agent.error && <p className="mt-2 border-l-4 border-err bg-err-soft px-3 py-1.5 text-[13px] text-[#8E1B1B]">{agent.error}</p>}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px] text-indigo">
          {status === "Listening…" && <ListeningBars active />}
          {status}
        </span>
        <button className="h-9 rounded-sm border border-indigo bg-white px-3 text-[14px] text-indigo hover:bg-indigo-soft disabled:opacity-50" onClick={hint} disabled={!agent.connected}>
          Hint
        </button>
        {held ? (
          <button className="h-9 rounded-sm bg-indigo px-3 text-[14px] text-white hover:bg-indigo-dark" onClick={() => setHeld(false)}>
            I&apos;ll fix it
          </button>
        ) : (
          <button className="h-9 rounded-sm border border-indigo bg-white px-3 text-[14px] text-indigo hover:bg-indigo-soft" onClick={endPractice}>
            End practice
          </button>
        )}
      </div>
    </Popup>
  );
}
