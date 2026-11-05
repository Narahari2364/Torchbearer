// Teach-mode Save guard for Ledgerline meal expenses. Returns ok: false to block.
// The expert's two rules from the demo script; explanations quote him from the Work Map.
// `fields` are Ledgerline data-field names the mock highlights (guests, attachments).

import type { DocFacts, ExpenseSnapshot, GuardrailResult, RuleKey, WorkMap, WorkMapStep } from "@/lib/types";

const APPROVAL_LIMIT = 30; // per person; above it the supervisor's written approval must be attached

function findStep(map: WorkMap, pattern: RegExp): WorkMapStep | undefined {
  return (
    map.steps.find((s) => pattern.test(s.title)) ??
    map.steps.find((s) => pattern.test(`${s.decision} ${s.reason} ${s.guardrails.join(" ")}`))
  );
}

function quote(step: WorkMapStep | undefined, fallback: string) {
  return `The expert said: “${step?.expertQuote || fallback}”`;
}

export function checkGuardrails(exp: ExpenseSnapshot, workMap: WorkMap): GuardrailResult {
  const violations: GuardrailResult["violations"] = [];
  const applicable: RuleKey[] = ["approval"];
  const docs = exp.attachments.map((a) => a.facts).filter(Boolean) as DocFacts[];
  const hasApproval = docs.some((d) => d.kind === "approval_email");

  // 1. Delivery apps: the receipt is not tax-compliant on its own; attach the downloaded invoice too.
  const isDelivery = docs.some((d) => d.kind === "order_confirmation" || (d.kind === "invoice" && d.issued_by));
  if (isDelivery) {
    applicable.push("delivery_docs");
    const hasReceipt = docs.some((d) => d.kind === "order_confirmation");
    const hasInvoice = docs.some((d) => d.kind === "invoice" && d.is_tax_invoice);
    if (!hasReceipt || !hasInvoice) {
      const step = findStep(workMap, /delivery|invoice|both/i);
      violations.push({
        key: "delivery_docs",
        stepId: step?.id ?? "s4",
        rule: hasInvoice
          ? "Delivery order: attach the app receipt as well as the invoice."
          : "Delivery order: the receipt alone isn't tax-compliant. Download the invoice from the app and attach it too.",
        explanation: quote(step, "The receipt just shows what I paid. The invoice has the VAT breakdown finance needs, and I have to download it separately. So for delivery I always upload both."),
        fields: ["attachments"],
        missing: hasInvoice ? "Delivery receipt missing" : "Tax invoice missing",
      });
    }
  }

  // 2. Over $30 per person: proof that the supervisor signed off.
  if ((exp.amount_per_person ?? 0) > APPROVAL_LIMIT && !hasApproval) {
    const step = findStep(workMap, /approval|per person|30/i);
    violations.push({
      key: "approval",
      stepId: step?.id ?? "s3",
      rule: `${exp.amount_per_person?.toFixed(2)} per person is over ${APPROVAL_LIMIT}, and no supervisor approval is attached.`,
      explanation: quote(step, "Over $30 a person, I need proof my supervisor actually signed off. A screenshot of an email or a chat works, as long as it shows the date, the amount and who was there."),
      fields: ["attachments"],
      missing: "Supervisor approval missing",
    });
  }

  return { ok: violations.length === 0, applicable, violations };
}
