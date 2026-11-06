"use client";
// The company's workflow vault: every workflow its experts have taught TorchBearer.
// Approved workflows can train a new hire right away; drafts go to the Work Map for approval.
// Any workflow can be deleted (asks once, inline).

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BotFace } from "@/features/observe/Launcher";
import type { WorkflowSummary } from "@/lib/types";

interface Me {
  email: string;
  name: string;
  org: string;
}

const companyName = (org: string) =>
  org.startsWith("user-") ? "Your workspace" : org.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export default function VaultPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [list, setList] = useState<WorkflowSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "approved" | "draft">("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async (id: string) => {
    setDeleting(id);
    setDeleteError(null);
    try {
      const r = await fetch(`/api/workflows/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setList((l) => (l ?? []).filter((w) => w.id !== id));
      setConfirming(null);
    } catch {
      setDeleteError("Couldn't delete it. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) window.location.href = "/api/auth/login?next=/vault";
      else if (r.ok) setMe(await r.json());
    });
    fetch("/api/workflows", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: WorkflowSummary[]) => setList(l))
      .catch(() => setList([]));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? [])
      .filter((w) => (filter === "all" ? true : filter === "approved" ? w.published : !w.published))
      .filter((w) => !q || w.name.toLowerCase().includes(q) || (w.trainedBy ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [list, query, filter]);
  const approved = (list ?? []).filter((w) => w.published).length;

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f3f2ff_0%,#ffffff_45%)]">
      <header className="border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-indigo">
            <BotFace size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-medium text-[#1f2d3d]">TorchBearer</div>
            {me && <div className="truncate text-[13px] text-[#667085]">{companyName(me.org)}</div>}
          </div>
          {me && <span className="hidden truncate text-[13.5px] text-[#475467] sm:inline">{me.email}</span>}
          <a href="/api/auth/logout" className="text-[13.5px] text-[#667085] hover:text-indigo">Sign out</a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-light tracking-tight text-[#1f2d3d]">Workflow vault</h1>
            <p className="mt-1 text-[15px] text-[#475467]">
              Everything your experts have taught TorchBearer.{" "}
              {list && `${list.length} workflow${list.length === 1 ? "" : "s"}, ${approved} ready to teach.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link prefetch={false} href="/review" className="btn">Supervisor review</Link>
            <Link prefetch={false} href="/capture" className="inline-flex h-10 items-center rounded-sm bg-indigo px-4 text-[15px] text-white hover:bg-indigo-dark">
              ● Record a new workflow
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by workflow or expert"
            aria-label="Search workflows"
            className="h-10 min-w-0 flex-1 rounded-sm border border-line bg-white px-3 text-[15px] outline-none focus:border-indigo sm:max-w-sm"
          />
          <div className="flex rounded-sm border border-line bg-white text-[14px]" role="group" aria-label="Filter">
            {(["all", "approved", "draft"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`h-10 px-3 ${filter === f ? "bg-indigo-soft font-medium text-indigo" : "text-[#475467] hover:bg-panel"}`}
              >
                {f === "all" ? "All" : f === "approved" ? "Ready to teach" : "Needs approval"}
              </button>
            ))}
          </div>
        </div>

        {list === null ? (
          <p className="mt-10 text-[15px] text-[#667085]">Loading your workflows…</p>
        ) : list.length === 0 ? (
          <div className="mt-8 rounded-md border border-dashed border-[#c9c6f5] bg-white p-8 text-center">
            <h2 className="text-[18px] font-medium text-[#1f2d3d]">No workflows yet</h2>
            <p className="mx-auto mt-2 max-w-md text-[15px] text-[#475467]">
              Ask an experienced colleague to record a task they know well. TorchBearer watches, asks why at the pauses, and turns it into a
              Work Map you can teach from.
            </p>
            <Link prefetch={false} href="/capture" className="mt-5 inline-flex h-10 items-center rounded-sm bg-indigo px-4 text-[15px] text-white hover:bg-indigo-dark">
              Record the first workflow
            </Link>
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-10 text-[15px] text-[#667085]">No workflows match.</p>
        ) : (
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {shown.map((w) => (
              <li key={w.id} className="flex flex-col rounded-md border border-line bg-white p-4 shadow-[0_4px_14px_rgba(16,24,40,.04)]">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 text-[16.5px] font-medium leading-snug text-[#1f2d3d]">{w.name || "Untitled workflow"}</h2>
                  {w.published ? (
                    <span className="pill shrink-0 bg-ok-soft text-ok">Ready to teach</span>
                  ) : (
                    <span className="pill shrink-0 bg-warn-soft text-[#7a5a00]">Needs approval</span>
                  )}
                </div>
                <p className="mt-1 text-[13.5px] text-[#667085]">
                  {w.stepCount} step{w.stepCount === 1 ? "" : "s"}
                  {w.trainedBy ? ` · taught by ${w.trainedBy}` : ""}
                  {day(w.createdAt) ? ` · ${day(w.createdAt)}` : ""}
                </p>
                {confirming === w.id ? (
                  <div className="mt-4 rounded-sm border border-[#f3c2c2] bg-err-soft px-3 py-2.5" role="alert">
                    <p className="text-[14px] text-[#8E1B1B]">Delete &ldquo;{w.name || "Untitled workflow"}&rdquo;? This can&apos;t be undone.</p>
                    {deleteError && <p className="mt-1 text-[13px] text-[#8E1B1B]">{deleteError}</p>}
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => remove(w.id)}
                        disabled={deleting === w.id}
                        className="inline-flex h-9 items-center rounded-sm bg-err px-3 text-[14px] text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {deleting === w.id ? "Deleting…" : "Delete"}
                      </button>
                      <button
                        onClick={() => { setConfirming(null); setDeleteError(null); }}
                        className="inline-flex h-9 items-center rounded-sm border border-line bg-white px-3 text-[14px] text-[#344054] hover:bg-panel"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {w.published ? (
                    <>
                      <Link prefetch={false} href={`/teach?id=${encodeURIComponent(w.id)}`} className="inline-flex h-9 items-center rounded-sm bg-indigo px-3 text-[14px] text-white hover:bg-indigo-dark">
                        Train a new hire
                      </Link>
                      <Link prefetch={false} href={`/map?id=${encodeURIComponent(w.id)}`} className="inline-flex h-9 items-center rounded-sm border border-line px-3 text-[14px] text-[#344054] hover:bg-panel">
                        View Work Map
                      </Link>
                    </>
                  ) : (
                    <Link prefetch={false} href={`/map?id=${encodeURIComponent(w.id)}`} className="inline-flex h-9 items-center rounded-sm border border-indigo px-3 text-[14px] text-indigo hover:bg-indigo-soft">
                      Review and approve
                    </Link>
                  )}
                  <button
                    onClick={() => { setConfirming(w.id); setDeleteError(null); }}
                    className="ml-auto inline-flex h-9 items-center rounded-sm px-2 text-[14px] text-[#667085] hover:bg-err-soft hover:text-err"
                    aria-label={`Delete ${w.name || "workflow"}`}
                  >
                    Delete
                  </button>
                </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
