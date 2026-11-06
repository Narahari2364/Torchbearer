// GET /api/auth/me — who is signed in (name, email, company).
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await requireUser();
  return u instanceof NextResponse ? u : NextResponse.json(u);
}
