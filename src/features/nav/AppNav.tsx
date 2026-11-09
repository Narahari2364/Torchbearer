"use client";
// Top bar on every app page: the three modules as tabs (jump to any of them, in any order),
// plus the signed-in company and Sign out.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BotFace } from "@/features/observe/Launcher";

interface Me {
  email: string;
  org: string;
}

const TABS = [
  { href: "/capture", label: "Teaching", hint: "An expert teaches", match: ["/capture"] },
  { href: "/vault", label: "Workflows", hint: "View and approve", match: ["/vault", "/map", "/process", "/review"] },
  { href: "/teach", label: "Training", hint: "A new hire trains", match: ["/teach"] },
];

/** Pages without the bar: the public signed-out page. */
const HIDDEN = ["/signed-out"];

const companyName = (org: string) =>
  org.startsWith("user-") ? "Your workspace" : org.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AppNav() {
  const path = usePathname() ?? "";
  const [me, setMe] = useState<Me | null>(null);
  const hidden = HIDDEN.some((p) => path.startsWith(p));

  useEffect(() => {
    if (hidden) return;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {});
  }, [hidden]);

  if (hidden) return null;
  return (
    <header className="shrink-0 border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Link prefetch={false} href="/vault" className="flex shrink-0 items-center gap-2 py-2" aria-label="TorchBearer, workflow vault">
          <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-indigo">
            <BotFace size={22} />
          </span>
          <span className="hidden leading-tight md:block">
            <span className="block text-[15px] font-medium text-[#1f2d3d]">TorchBearer</span>
            {me && me.org !== "torchbearer" && (
              <span className="block max-w-[160px] truncate text-[12px] text-[#667085]">{companyName(me.org)}</span>
            )}
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 justify-center" aria-label="Modules">
          {TABS.map((t) => {
            const active = t.match.some((m) => path === m || path.startsWith(m + "/"));
            return (
              <Link
                key={t.href}
                prefetch={false}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-2.5 py-2.5 text-center sm:px-5 ${active ? "text-indigo" : "text-[#475467] hover:text-[#1f2d3d]"}`}
              >
                <span className={`block text-[14.5px] sm:text-[15px] ${active ? "font-medium" : ""}`}>{t.label}</span>
                <span className="hidden text-[12px] text-[#98a2b3] sm:block">{t.hint}</span>
                {active && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-indigo" aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          {me && <span className="hidden max-w-[200px] truncate text-[13px] text-[#475467] lg:inline">{me.email}</span>}
          <a href="/api/auth/logout" className="text-[13px] text-[#667085] hover:text-indigo">Sign out</a>
        </div>
      </div>
    </header>
  );
}
