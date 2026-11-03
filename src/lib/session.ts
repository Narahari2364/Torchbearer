// Client storage helpers. Trained workflows, progress and reviews live in the DATABASE (see /api, src/lib/db.ts).
import type { ReviewBatch, ScreenEvent, StepMastery, TranscriptLine, WorkMap, WorkflowRecord, WorkflowSummary } from "./types";
export type { ReviewBatch } from "./types";

const SESSION_KEY = "apprentice.session";
const WORKMAP_KEY = "apprentice.workmap";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // e.g. storage full
  }
}

export interface CapturedSession {
  events: ScreenEvent[];
  transcript: TranscriptLine[];
}

const seconds = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
};

/** Give each step the screenshot taken closest to its screen moment. */
export function attachScreenshots(map: WorkMap, shots: Record<string, string>): WorkMap {
  const times = Object.keys(shots);
  if (!times.length) return map;
  return {
    ...map,
    steps: map.steps.map((step) => {
      const t = seconds(step.time);
      const best = times.reduce((a, b) => (Math.abs(seconds(b) - t) < Math.abs(seconds(a) - t) ? b : a));
      return { ...step, screenshot: shots[best] };
    }),
  };
}

/** Link each step to the Ledgerline document touched closest to its screen moment (within 90 s). */
export function attachDocs(map: WorkMap, events: ScreenEvent[]): WorkMap {
  const withDocs = events.filter((e) => e.docId);
  if (!withDocs.length) return map;
  return {
    ...map,
    steps: map.steps.map((step) => {
      if (step.docId) return step;
      const t = seconds(step.time);
      const best = withDocs.reduce((a, b) => (Math.abs(seconds(b.time) - t) < Math.abs(seconds(a.time) - t) ? b : a));
      return Math.abs(seconds(best.time) - t) <= 90 ? { ...step, docId: best.docId } : step;
    }),
  };
}

export const loadSession = () => read<CapturedSession>(SESSION_KEY);
export const saveSession = (s: CapturedSession) => write(SESSION_KEY, s);
export const loadWorkMap = () => read<WorkMap>(WORKMAP_KEY);
export const saveWorkMap = (m: WorkMap) => write(WORKMAP_KEY, m);

// ---------- Database (server: private Vercel Blob store, see src/lib/db.ts) ----------
// Trained workflows, learner progress and supervisor reviews live in the database, so every
// device sees the same trained Torchbearer. These helpers call the app's own /api routes.

const json = { "Content-Type": "application/json" };

export async function listWorkflows(): Promise<WorkflowSummary[]> {
  try {
    const r = await fetch("/api/workflows", { cache: "no-store" });
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

export async function getWorkflow(id: string | null | undefined): Promise<WorkflowRecord | null> {
  if (!id) return null;
  try {
    const r = await fetch(`/api/workflows/${encodeURIComponent(id)}`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function saveWorkflow(record: WorkflowRecord): Promise<boolean> {
  try {
    const r = await fetch(`/api/workflows/${encodeURIComponent(record.id)}`, { method: "PUT", headers: json, body: JSON.stringify(record) });
    return r.ok;
  } catch {
    return false;
  }
}

const progressUrl = (workflowId: string, learner: string) =>
  `/api/progress?workflow=${encodeURIComponent(workflowId)}&learner=${encodeURIComponent(learner)}`;

export async function loadMastery(workflowId: string, learner: string): Promise<Record<string, StepMastery>> {
  try {
    const r = await fetch(progressUrl(workflowId, learner), { cache: "no-store" });
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

export async function saveMastery(workflowId: string, learner: string, patch: Record<string, StepMastery>) {
  try {
    await fetch(progressUrl(workflowId, learner), { method: "PUT", headers: json, body: JSON.stringify(patch) });
  } catch {
    /* best effort */
  }
}

export async function loadReviews(): Promise<ReviewBatch | null> {
  try {
    const r = await fetch("/api/reviews", { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export async function saveReviews(batch: ReviewBatch) {
  try {
    await fetch("/api/reviews", { method: "PUT", headers: json, body: JSON.stringify(batch) });
  } catch {
    /* best effort */
  }
}
