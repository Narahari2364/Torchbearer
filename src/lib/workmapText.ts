// The Work Map as short plain text for the voice tutor. The stored map carries a screenshot per
// step (hundreds of KB of base64); sending that to the voice agent buried the expert's reasons
// and rules under image data, so the tutor lagged and ignored what the expert had said.
import { redact } from "./redact";
import type { WorkMap } from "./types";

export function workMapText(map: WorkMap): string {
  const lines = [`TASK: ${map.task || "(unnamed)"}`, "", "THE EXPERT'S STEPS, in order:"];
  map.steps.forEach((s, i) => {
    const title = s.correction || s.title;
    lines.push(`${i + 1}. ${title}`);
    if (s.decision) lines.push(`   What the expert did: ${s.decision}`);
    const why = s.expertQuote || s.reason;
    if (why) lines.push(`   Why (the expert's words): ${why}`);
    if (s.guardrails.length) lines.push(`   Rules: ${s.guardrails.join("; ")}`);
    const p = s.process;
    if (p) {
      if (p.tool && p.tool !== "unknown") lines.push(`   Where: ${p.tool}`);
      if (p.inputs.length) lines.push(`   Needs: ${p.inputs.map((x) => `${x.name} (from ${x.source})`).join(", ")}`);
    }
  });
  if (map.gaps.length) lines.push("", `Open questions the expert hasn't answered: ${map.gaps.join("; ")}`);
  return redact(lines.join("\n"));
}
