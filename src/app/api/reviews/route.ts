// GET / PUT /api/reviews — the supervisor's review batch (items Teaching flagged as "might differ").
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import type { ReviewBatch } from "@/lib/types";

export const dynamic = "force-dynamic";

const PATH = "reviews/current.json";

export async function GET() {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  return NextResponse.json(await orgDb(u.org).readJson<ReviewBatch>(PATH));
}

export async function PUT(req: Request) {
  const u = await requireUser();
  if (u instanceof NextResponse) return u;
  await orgDb(u.org).writeJson(PATH, (await req.json()) as ReviewBatch);
  return NextResponse.json({ ok: true });
}
