// GET /api/workflows — summaries of every workflow trained at the signed-in user's company.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import type { WorkflowSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const index = (await orgDb(u.org).readJson<WorkflowSummary[]>("workflows/index.json")) ?? [];
  return NextResponse.json(index);
}
