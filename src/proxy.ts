// Every page and API route needs a signed-in user, except the sign-in flow itself and /signed-out.
// Pages redirect to sign-in; API calls get 401. API routes also verify on their own (requireUser).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userFromToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const login = new URL("/api/auth/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/auth|signed-out|_next/static|_next/image|favicon.ico).*)"],
};
