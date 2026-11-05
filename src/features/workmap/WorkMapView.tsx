"use client";
// Work Map, following the Review-mode design: a clickable timeline (◆ judgment call,
// ● routine step), the selected step (screen moment, decision, reason in the expert's words,
// typed guardrails), and a column with all guardrails, off-the-record gaps and open questions.

import type { ReactNode } from "react";
import type { WorkMap, WorkMapStep } from "@/lib/types";

export type GuardrailType = "LIMIT" | "RULE" | "EXCEPTION" | "STOP";

/** Classify a guardrail sentence so the map shows more than the happy path. */
export function guardrailType(text: string): GuardrailType {
  if (/\bonly\b|except|don't need|not needed|restaurant/i.test(text)) return "EXCEPTION";
  if (/\bstop\b|don't submit|do not submit|before submitting/i.test(text)) return "STOP";
  if (/\bover\b|\bunder\b|limit|\d/i.test(text)) return "LIMIT";
  return "RULE";
}

const TYPE_STYLE: Record<GuardrailType, { chip: string; bar: string; icon: string }> = {
  LIMIT: { chip: "border-[#E2A100] bg-warn-soft text-[#7a5a00]", bar: "bg-[#E2A100]", icon: "≤" },
  RULE: { chip: "border-brand bg-brand-soft text-brand", bar: "bg-brand", icon: "§" },
  EXCEPTION: { chip: "border-indigo bg-indigo-soft text-indigo", bar: "bg-indigo", icon: "↺" },
  STOP: { chip: "border-err bg-err-soft text-err", bar: "bg-err", icon: "✋" },
};

export function TypeChip({ type }: { type: GuardrailType }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] font-bold tracking-wide ${TYPE_STYLE[type].chip}`}>
      <span aria-hidden="true">{TYPE_STYLE[type].icon}</span>
      {type}
    </span>
  );
}

const shortLabel = (s: WorkMapStep) => s.short || s.title.split(/\s+/).slice(0, 4).join(" ");

const card = "rounded-md border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_rgba(16,24,40,.05)]";

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[12px] font-bold uppercase tracking-[.12em] text-[#667085]">{children}</div>;
}

interface Props {
  map: WorkMap;
  selected: WorkMapStep;
  onSelect: (step: WorkMapStep) => void;
  onReplay: (step: WorkMapStep) => void;
}

export default function WorkMapView({ map, selected, onSelect, onReplay }: Props) {
  const allGuardrails = map.steps.flatMap((s) => s.guardrails.map((g) => ({ g, step: s, type: guardrailType(g) })));
  const selectedIndex = map.steps.findIndex((s) => s.id === selected.id);
  const progress = map.steps.length > 1 ? (selectedIndex / (map.steps.length - 1)) * 100 : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* timeline */}
      <section className={`${card} px-6 pb-5 pt-5`}>
        <div className="flex items-center">
          <Label>Timeline of the session</Label>
          <span className="mb-2 ml-auto flex items-center gap-4 text-[12.5px] text-[#667085]">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-brand bg-white" /> routine step</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 bg-indigo" /> judgment call</span>
          </span>
        </div>
        <div className="overflow-x-auto pt-3">
          <ol className="relative flex min-w-max justify-between gap-6">
            <span className="absolute left-[72px] right-[72px] top-[11px] h-[3px] rounded-full bg-[#e4e7ec]" aria-hidden="true">
              <span className="block h-full rounded-full bg-gradient-to-r from-brand to-indigo transition-all duration-500" style={{ width: `${progress}%` }} />
            </span>
            {map.steps.map((s) => {
              const on = s.id === selected.id;
              return (
                <li key={s.id} className="relative flex w-36 flex-col items-center text-center">
                  <button onClick={() => onSelect(s)} className="group flex flex-col items-center gap-2" aria-current={on ? "step" : undefined}>
                    {s.decision ? (
                      <span className={`h-[20px] w-[20px] rotate-45 bg-indigo transition group-hover:scale-110 ${on ? "ring-[5px] ring-indigo/20" : ""}`} />
                    ) : (
                      <span className={`h-[24px] w-[24px] rounded-full border-[3px] bg-white transition group-hover:scale-110 ${on ? "border-indigo ring-[5px] ring-indigo/20" : "border-brand"}`} />
                    )}
                    <span className={`text-[14px] leading-tight transition ${on ? "font-medium text-indigo" : "text-[#344054] group-hover:text-indigo"}`}>
                      {s.order} · {shortLabel(s)}
                    </span>
                    <span className="font-mono text-[12px] text-[#98a2b3]">{s.time}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* selected step */}
        <section key={selected.id} className={`${card} rise min-w-0 p-6`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f2f4f7] px-2.5 py-0.5 text-[12.5px] font-medium text-[#344054]">
              Step {selected.order} of {map.steps.length}
            </span>
            {selected.decision ? (
              <span className="rounded-full bg-indigo-soft px-2.5 py-0.5 text-[12.5px] font-medium text-indigo">◆ Judgment call</span>
            ) : (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[12.5px] font-medium text-brand">● Routine step</span>
            )}
          </div>
          <h2 className="mt-3 text-[26px] font-light leading-tight text-[#1f2d3d]">{selected.title}</h2>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <Label>Screen moment · {selected.time}</Label>
              <div className="overflow-hidden rounded-md border border-line">
                {selected.screenshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.screenshot} alt={`Expert's screen at ${selected.time}`} className="w-full" />
                ) : (
                  <div className="bg-[linear-gradient(135deg,#2F74D0,#5146d9)] px-4 py-6 text-white">
                    <div className="text-[12px] uppercase tracking-wide opacity-80">Ledgerline · Meals / Drinks</div>
                    <div className="mt-1 text-[18px]">{shortLabel(selected)}</div>
                    <div className="mt-0.5 font-mono text-[13px] opacity-80">at {selected.time}</div>
                  </div>
                )}
                <div className="flex items-center justify-between bg-[#f9fafb] px-3 py-2">
                  <span className="text-[12.5px] text-[#667085]">{selected.docId ? "Opens the expert's document" : selected.screenshot ? "Saved screenshot" : "No recording"}</span>
                  <button
                    onClick={() => onReplay(selected)}
                    disabled={!selected.docId && !selected.screenshot}
                    className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-indigo px-3 text-[14px] text-white transition hover:bg-indigo-dark disabled:opacity-40"
                  >
                    ▶ Replay {selected.time}
                  </button>
                </div>
              </div>
            </div>
            <div>
              {selected.decision && (
                <>
                  <Label>Decision</Label>
                  <p className="mb-5 text-[16px] leading-snug text-[#1f2d3d]">{selected.decision}</p>
                </>
              )}
              <Label>Reason, in the expert&apos;s words</Label>
              <figure className="relative rounded-md bg-indigo-soft/60 px-5 pb-4 pt-6">
                <span className="absolute left-3 top-0 font-serif text-[54px] leading-none text-indigo/30" aria-hidden="true">“</span>
                <blockquote className="text-[16.5px] leading-snug text-[#1f2d3d]">{selected.expertQuote}</blockquote>
                <figcaption className="mt-3 flex items-center gap-2 text-[13px] text-[#667085]">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0f766e] text-[10.5px] font-medium text-white">PA</span>
                  Expert · {selected.time}
                </figcaption>
              </figure>
            </div>
          </div>

          {selected.guardrails.length > 0 && (
            <div className="mt-6">
              <Label>Guardrails on this step</Label>
              <ul className="space-y-2">
                {selected.guardrails.map((g) => (
                  <li key={g} className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2 text-[15.5px]">
                    <TypeChip type={guardrailType(g)} /> {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {map.confirmed && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-ok-soft px-3 py-1 text-[13.5px] text-ok">✓ Confirmed by the expert in the teach-back</p>
          )}
        </section>

        {/* all guardrails, gaps, open questions */}
        <aside className="flex flex-col gap-5">
          <section className={`${card} p-5`}>
            <Label>All guardrails · {allGuardrails.length}</Label>
            <ul className="space-y-2">
              {allGuardrails.map(({ g, step, type }) => (
                <li key={g}>
                  <button
                    onClick={() => onSelect(step)}
                    className={`relative w-full overflow-hidden rounded-md border bg-white py-2.5 pl-4 pr-3 text-left text-[14.5px] leading-snug transition hover:border-indigo hover:shadow-sm ${step.id === selected.id ? "border-indigo" : "border-line"}`}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${TYPE_STYLE[type].bar}`} aria-hidden="true" />
                    <TypeChip type={type} /> {g}
                    <span className="mt-1 block text-[12.5px] text-[#98a2b3]">Step {step.order} · ▶ replay</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {(map.offRecord ?? []).length > 0 && (
            <section className={`${card} p-5`}>
              <Label>Off the record</Label>
              {(map.offRecord ?? []).map((r) => (
                <p key={r.from} className="rounded-md border border-dashed border-[#b9bdc4] px-3 py-2 text-[13.5px] text-[#555]">
                  <span className="font-mono">{r.from}–{r.to}</span> · nothing saved, no questions asked
                </p>
              ))}
            </section>
          )}

          <section className={`${card} p-5`}>
            <Label>Open questions</Label>
            {map.gaps.length ? (
              <ul className="space-y-1.5 text-[14.5px]">
                {map.gaps.map((q) => (
                  <li key={q} className="flex gap-2">
                    <span className="text-warn">?</span> {q}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14.5px] text-ok">None · all answered in the debrief</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
