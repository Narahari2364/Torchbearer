// Server-only sign-in with Amazon Cognito (managed login, OAuth code flow).
// The browser holds one httpOnly cookie: the Cognito ID token (valid 12 hours).
// Every API route calls requireUser(), which verifies that token's signature and expiry
// and returns the user's company ("org"). All data is stored under that company's prefix.
// Invited users carry a company ID (custom:org, which users can't change). People who sign up on their own
// get a private workspace keyed to their Cognito user ID, so they never see another company's data.
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SESSION_COOKIE = "tb_session";

export const cognito = {
  userPoolId: process.env.COGNITO_USER_POOL_ID ?? "",
  clientId: process.env.COGNITO_CLIENT_ID ?? "",
  clientSecret: process.env.COGNITO_CLIENT_SECRET ?? "",
  domain: process.env.COGNITO_DOMAIN ?? "", // e.g. https://torchbearer.auth.us-east-1.amazoncognito.com
};

export interface User {
  email: string;
  name: string;
  org: string;
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create<{ userPoolId: string; tokenUse: "id"; clientId: string }>> | null = null;
const getVerifier = () =>
  (verifier ??= CognitoJwtVerifier.create({ userPoolId: cognito.userPoolId, tokenUse: "id", clientId: cognito.clientId }));

/** Prefix of the private workspace given to people who signed up themselves. */
export const PERSONAL_ORG_PREFIX = "user-";

/** The signed-in user for an ID token, or null if it is missing, forged or expired. */
export async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token || !cognito.userPoolId) return null;
  try {
    const p = await getVerifier().verify(token);
    const org = typeof p["custom:org"] === "string" && p["custom:org"] ? p["custom:org"] : `${PERSONAL_ORG_PREFIX}${p.sub}`;
    const email = typeof p.email === "string" ? p.email : "";
    const name = typeof p.name === "string" && p.name ? p.name : email.split("@")[0];
    return { email, name, org };
  } catch {
    return null;
  }
}

/** For API routes: the user, or a 401 response to return as is. */
export async function requireUser(): Promise<User | NextResponse> {
  const user = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  return user ?? NextResponse.json({ error: "Not signed in" }, { status: 401 });
}

/** The app's own address as the browser sees it (Amplify sits behind a proxy). */
export function appOrigin(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto.split(",")[0]}://${host.split(",")[0]}`;
}
