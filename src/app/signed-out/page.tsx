// Shown after signing out, or when sign-in could not finish (?error=...). Public.
import { BotFace } from "@/features/observe/Launcher";

const WEBSITE = "https://main.d3dd61qwuyekg8.amplifyapp.com";

export default async function SignedOut({ searchParams }: PageProps<"/signed-out">) {
  const error = (await searchParams).error;
  return (
    <section className="grid min-h-full place-items-center bg-[linear-gradient(180deg,#f3f2ff_0%,#ffffff_70%)] px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-[18px] bg-indigo">
          <BotFace size={44} />
        </div>
        <h1 className="mt-5 text-[28px] font-light text-[#1f2d3d]">{error ? "Couldn't sign you in" : "You're signed out"}</h1>
        <p className="mt-2 text-[15px] text-[#475467]">{typeof error === "string" ? error : "See you next time."}</p>
        <div className="mt-6 flex justify-center gap-3">
          <a href="/api/auth/login?next=/vault" className="inline-flex h-10 items-center rounded-sm bg-indigo px-4 text-[15px] text-white hover:bg-indigo-dark">Sign in</a>
          <a href={WEBSITE} className="btn">TorchBearer website</a>
        </div>
      </div>
    </section>
  );
}
