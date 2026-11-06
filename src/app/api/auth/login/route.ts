// GET /api/auth/login?next=/vault — sends the browser to the Cognito sign-in page.
// A random state (checked on return) and a PKCE verifier ride along in a short-lived cookie.
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appOrigin, cognito } from "@/lib/auth";

export const dynamic = "force-dynamic";

const b64url = (b: Buffer) => b.toString("base64url");

export async function GET(req: Request) {
  const nextParam = new URL(req.url).searchParams.get("next") ?? "/vault";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/vault"; // same-site only
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const q = new URLSearchParams({
    client_id: cognito.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: `${appOrigin(req)}/api/auth/callback`,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const res = NextResponse.redirect(`${cognito.domain}/oauth2/authorize?${q}`);
  res.cookies.set("tb_login", JSON.stringify({ state, verifier, next }), {
    httpOnly: true,
    secure: !appOrigin(req).startsWith("http://"),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
