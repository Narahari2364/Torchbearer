// GET / PUT / DELETE /api/workflows/<id> — one trained workflow of the signed-in user's company
// (steps, the expert's reasons and rules, screenshots, approval state).
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { orgDb, safe } from "@/lib/db";
import type { WorkflowRecord, WorkflowSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const INDEX = "workflows/index.json";

const summary = (w: WorkflowRecord, trainedBy?: string): WorkflowSummary => ({
  id: w.id,
  name: w.name,
  createdAt: w.createdAt,
  published: !!w.map.published,
  stepCount: w.map.steps.length,
  ...(trainedBy ? { trainedBy } : {}),
});

export async function GET(_req: Request, { params }: Ctx) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const { id } = await params;
  const record = await orgDb(u.org).readJson<WorkflowRecord>(`workflows/${safe(id)}.json`);
  return record ? NextResponse.json(record) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const db = orgDb(u.org);
  const { id } = await params;
  const record = (await req.json()) as WorkflowRecord;
  if (!record?.map?.steps || record.id !== id) return NextResponse.json({ error: "Bad workflow" }, { status: 400 });
  await db.writeJson(`workflows/${safe(id)}.json`, record);
  const index = (await db.readJson<WorkflowSummary[]>(INDEX)) ?? [];
  const before = index.find((w) => w.id === id);
  await db.writeJson(INDEX, [summary(record, before?.trainedBy ?? u.name), ...index.filter((w) => w.id !== id)]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  const db = orgDb(u.org);
  const { id } = await params;
  await db.remove(`workflows/${safe(id)}.json`);
  const index = (await db.readJson<WorkflowSummary[]>(INDEX)) ?? [];
  await db.writeJson(INDEX, index.filter((w) => w.id !== id));
  return NextResponse.json({ ok: true });
}
