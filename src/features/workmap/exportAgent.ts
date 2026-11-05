// Stretch goal "agent-ready guardrails": the Work Map as rules an AI agent can load,
// so it follows the same steps and stops where the expert would.

import { redact } from "@/lib/redact";
import type { WorkMap } from "@/lib/types";
import { guardrailType } from "./WorkMapView";

export interface ExportOptions {
  quotes: boolean;
  guardrails: boolean;
  screenMoments: boolean;
}

export function toAgentMarkdown(map: WorkMap, opts: ExportOptions = { quotes: true, guardrails: true, screenMoments: false }): string {
  const lines = [
    `# ${map.task}: rules from the expert${map.confirmed ? " (confirmed in the teach-back)" : ""}`,
    "",
    "Follow the steps in order. If a STOP guardrail applies, do not submit: hand the case to a person and say which rule applies.",
    "",
    "## Steps",
  ];
  map.steps.forEach((s) => {
    lines.push(`${s.order}. ${s.title}${s.decision ? ` (judgment call: ${s.decision})` : ""}${opts.screenMoments ? ` [screen ${s.time}]` : ""}`);
    if (opts.quotes) lines.push(`   Expert: "${s.expertQuote}"`);
  });
  if (opts.guardrails) {
    lines.push("", "## Guardrails");
    for (const s of map.steps) for (const g of s.guardrails) lines.push(`- ${guardrailType(g)}: ${g}`);
  }
  if (map.gaps.length) lines.push("", "## Not yet clear (ask a person)", ...map.gaps.map((g) => `- ${g}`));
  // Names and card numbers are removed from the export.
  return redact(lines.join("\n")) + "\n";
}

export function toAgentJson(map: WorkMap, opts: ExportOptions): string {
  const steps = map.steps.map((s) => ({
    order: s.order,
    title: s.title,
    decision: s.decision || null,
    reason: s.reason,
    ...(opts.quotes ? { expertQuote: s.expertQuote } : {}),
    ...(opts.guardrails ? { guardrails: s.guardrails.map((g) => ({ type: guardrailType(g), text: g })) } : {}),
    ...(opts.screenMoments ? { screenMoment: s.time } : {}),
  }));
  return redact(JSON.stringify({ task: map.task, confirmed: map.confirmed, steps, openQuestions: map.gaps }, null, 2));
}

export function downloadText(filename: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
