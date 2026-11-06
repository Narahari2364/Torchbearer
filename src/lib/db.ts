// Server-only database: a PRIVATE Amazon S3 bucket (S3_BUCKET, S3_REGION).
// Each company's data lives under its own prefix, orgs/<org>/ (use orgDb(user.org) in routes).
// Everything is a JSON document:
//   workflows/index.json            summaries of all trained workflows
//   workflows/<id>.json             a full workflow (steps, reasons, rules, screenshots)
//   progress/<workflow>/<learner>.json   learned / relearn per step
//   reviews/current.json            the supervisor's review batch
// S3 reads are strongly consistent, so a save is visible right away (e.g. a just-approved workflow).
// Credentials: on Amplify, the app's IAM compute role; locally, your AWS profile (AWS_PROFILE).
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const Bucket = process.env.S3_BUCKET!;
const s3 = new S3Client({ region: process.env.S3_REGION || "us-east-1" });

export async function readJson<T>(pathname: string): Promise<T | null> {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket, Key: pathname }));
    const text = await r.Body?.transformToString();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null; // not found yet
  }
}

export async function writeJson(pathname: string, data: unknown): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: pathname,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    }),
  );
}

export async function remove(pathname: string): Promise<void> {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket, Key: pathname }));
  } catch {
    /* already gone */
  }
}

/** Only letters, digits, dash, underscore and space in path segments. */
export const safe = (s: string) => s.replace(/[^\w\- ]/g, "_").slice(0, 80);

/** Storage for one company: every key is placed under orgs/<org>/, so companies never see each other's data. */
export function orgDb(org: string) {
  const key = (p: string) => `orgs/${safe(org)}/${p}`;
  return {
    readJson: <T>(p: string) => readJson<T>(key(p)),
    writeJson: (p: string, data: unknown) => writeJson(key(p), data),
    remove: (p: string) => remove(key(p)),
  };
}
