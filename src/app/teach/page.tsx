"use client";
// Module 3 · Teaching: one click launches Torchbearer into an always-on-top floating window.
// It first asks which saved, approved workflow Maya wants to practise. She starts recording and
// works in any browser tab; matching steps are marked Learned, anything that might differ is never
// called wrong: it's marked Relearn and goes under review for the supervisor (/review).

import { createPortal } from "react-dom";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ConversationProvider } from "@elevenlabs/react";
import CoachPanel from "@/features/observe/CoachPanel";
import Launcher from "@/features/observe/Launcher";
import { useCoach } from "@/features/observe/useCoach";
import { pipSupported, usePip } from "@/features/observe/usePip";
import { requestMic } from "@/lib/useVoiceAgent";
import { getWorkflow, listWorkflows } from "@/lib/session";
import type { WorkflowRecord, WorkflowSummary } from "@/lib/types";

const readId = () => {
  try {
    return new URLSearchParams(window.location.search).get("id");
  } catch {
    return null;
  }
};

export default function TeachPage() {
  return (
    <ConversationProvider>
      <Teach />
    </ConversationProvider>
  );
}

function Teach() {
  const idParam = useSyncExternalStore(() => () => {}, readId, () => null);
  // From the database only: the workflows experts recorded. No built-in examples.
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  useEffect(() => {
    listWorkflows().then(setWorkflows);
  }, []);
  const [picked, setPicked] = useState<string | null | undefined>(undefined); // undefined = use ?id
  const selectedId = picked === undefined ? idParam : picked;
  const [selectedRaw, setSelectedRaw] = useState<WorkflowRecord | null>(null);
  useEffect(() => {
    let live = true;
    getWorkflow(selectedId).then((w) => live && setSelectedRaw(w));
    return () => {
      live = false;
    };
  }, [selectedId]);
  const selected = selectedRaw && selectedRaw.id === selectedId && selectedRaw.map.published ? selectedRaw : null; // only approved workflows teach

  const c = useCoach(selected);
  const pip = usePip();
  const [micError, setMicError] = useState<string | null>(null);
  const canPip = useSyncExternalStore(() => () => {}, pipSupported, () => true);
  const bot = <CoachPanel c={c} workflows={workflows} selected={selected} onSelect={setPicked} />;
  const startArea = !selected ? (
    <p className="text-[15px] text-[#475467]">First pick a workflow in the floating Torchbearer.</p>
  ) : c.sharing ? (
    <div className="text-[15px]">
      <div className="font-medium text-err">● Recording · {selected.name}</div>
      <p className="mt-1 text-[14px] text-[#475467]">Switch to Maya&apos;s work. Stop recording in the floating Torchbearer when she&apos;s done.</p>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="text-[15px]">Practising: <b>{selected.name}</b></div>
      <button onClick={c.start} className="h-11 rounded-sm bg-indigo text-[16px] text-white hover:bg-indigo-dark">
        {c.finished ? "● Practise again" : "● Start recording"}
      </button>
      <p className="text-[13px] text-[#667085]">Chrome will ask what to share: choose <b>Entire screen</b>.</p>
      {c.error && <p className="rounded-sm bg-err-soft px-3 py-2 text-[13.5px] text-[#8E1B1B]">{c.error}</p>}
    </div>
  );

  return (
    <>
      <Launcher
        eyebrow="Module 3 · Teaching"
        title={<>Torchbearer <span className="font-medium text-indigo">guides the new hire</span></>}
        text="Launch it and it floats on Maya's screen. She picks a workflow, starts recording and works as usual. Torchbearer marks each step learned or to relearn, and anything that might differ goes to her supervisor, never called wrong."
        launched={pip.isOpen}
        canPip={canPip}
        failed={pip.failed}
        onLaunch={() => {
          // Same click: open the bot (needs the click) and ask for the mic while this page is in front.
          pip.open();
          requestMic().then(setMicError);
        }}
        micError={micError}
        panel={bot}
        startArea={startArea}
        links={[{ href: "/capture", label: "← Capture" }, { href: "/map", label: "← Mapping" }, { href: "/review", label: "Supervisor review →" }]}
        demo={{ href: "/ledgerline/index.html?user=maya", label: "Demo app: open Ledgerline as Maya" }}
      />
      {pip.container && createPortal(bot, pip.container)}
    </>
  );
}
