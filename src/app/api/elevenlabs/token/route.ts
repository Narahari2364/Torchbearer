// Returns a short-lived conversation token so the API key never reaches the browser.
// GET /api/elevenlabs/token?role=interviewer|tutor
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const role = new URL(req.url).searchParams.get("role");
  const agentId =
    role === "tutor" ? process.env.ELEVENLABS_TUTOR_AGENT_ID : process.env.ELEVENLABS_INTERVIEWER_AGENT_ID;
  if (!agentId || !process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json({ error: "Agent ID or API key missing in .env.local" }, { status: 500 });
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: `ElevenLabs ${res.status}: ${await res.text()}` }, { status: 502 });
  }
  const { token } = await res.json();
  return NextResponse.json({ token });
}
