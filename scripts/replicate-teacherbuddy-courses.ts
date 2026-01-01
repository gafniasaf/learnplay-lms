#!/usr/bin/env tsx
/**
 * Replicate Teacherbuddy MES-cached courses into LearnPlay's course storage format.
 *
 * Source (Teacherbuddy Supabase):
 * - public.mes_course
 * - public.mes_course_content
 *
 * Target (LearnPlay Supabase):
 * - Upload `courses/{id}/course.json` via Edge Function: /functions/v1/save-course
 * - Course metadata is maintained by the save-course function.
 *
 * This script is resumable and idempotent (re-running upserts the same course.json).
 *
 * IMPORTANT:
 * - Do not print secrets.
 * - Do not use fallback secret values.
 * - Provide explicit organization_id in the uploaded payload to avoid org guessing.
 *
 * Usage:
 *   npx tsx scripts/replicate-teacherbuddy-courses.ts --resume
 *
 * Required env:
 *   TEACHERBUDDY_SUPABASE_URL
 *   TEACHERBUDDY_SERVICE_ROLE_KEY
 *   SUPABASE_URL (LearnPlay target)
 *   AGENT_TOKEN (LearnPlay edge auth)
 *   ORGANIZATION_ID (LearnPlay org that should own imported courses)
 *
 * Optional flags:
 *   --env-file <path>          Load additional KEY=VALUE env vars (does not overwrite existing)
 *   --format <mes|library>     Envelope format (default: mes)
 *   --visibility <org|global>  Visibility written into content.visibility (default: org)
 *   --page-size <n>            Source page size (default: 200)
 *   --concurrency <n>          Upload concurrency 1..8 (default: 3)
 *   --checkpoint <path>        Checkpoint file path (default: artifacts/replicate-teacherbuddy-checkpoint.json)
 *   --resume                   Resume from checkpoint
 *   --retry-failed             After normal pass, retry failed IDs from checkpoint once
 *   --only-failed              Only process failed IDs from checkpoint
 *   --max <n>                  Process at most N courses (for smoke testing)
 *   --dry-run                  Do not write to LearnPlay (still reads source)
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

type MesCourseRow = {
  mes_course_id: number;
  mes_course_name: string;
  mes_course_type: string | null;
  mes_course_language: string | null;
  mes_course_properties: string | null;
  imported_at: string;
  updated_at: string;
  // Optional columns may exist in later migrations/scripts
  education_level?: string | null;
  category_path?: string | null;
};

type MesCourseContentRow = {
  course_id: number;
  content: Json;
  imported_at: string;
  updated_at: string;
};

type Checkpoint = {
  version: 1;
  started_at: string;
  updated_at: string;
  last_mes_course_id: number;
  ok_count: number;
  fail_count: number;
  failed: Record<string, { message: string; at: string }>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseIntArg(flag: string, fallback: number): number {
  const raw = argValue(flag);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function loadEnvFile(filePath: string): void {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.error(`[replicate-teacherbuddy] ❌ Env file not found: ${abs}`);
    process.exit(1);
  }
  const content = fs.readFileSync(abs, "utf8");
  for (const raw of content.split(/\r?\n/g)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnvVar(name: string): string {
  const v = process.env[name];
  if (!v || String(v).trim() === "") {
    console.error(`[replicate-teacherbuddy] ❌ BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return String(v);
}

function normalizeSupabaseBaseUrl(url: string): string {
  const u = String(url).trim().replace(/\/+$/, "");
  if (!u) return u;
  return u;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function readCheckpoint(cpPath: string): Checkpoint | null {
  if (!fs.existsSync(cpPath)) return null;
  try {
    const raw = fs.readFileSync(cpPath, "utf8");
    const parsed = JSON.parse(raw) as Checkpoint;
    if (!parsed || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCheckpoint(cpPath: string, cp: Checkpoint): void {
  const dir = path.dirname(cpPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cpPath, JSON.stringify(cp, null, 2) + "\n", "utf8");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function toSafeId(mesCourseId: number): string {
  return `mes-${mesCourseId}`;
}

function mapToEnvelope(
  row: MesCourseRow,
  content: MesCourseContentRow | null,
  opts: { organizationId: string; visibility: "org" | "global"; format: string },
): { id: string; format: string; version: number; content: Record<string, unknown> } {
  const courseId = toSafeId(row.mes_course_id);
  const title = String(row.mes_course_name || courseId);
  const locale = row.mes_course_language ? String(row.mes_course_language) : null;
  const subject = row.mes_course_type ? String(row.mes_course_type) : "Library";

  const payload = content?.content ?? null;

  return {
    id: courseId,
    format: opts.format,
    version: 1,
    content: {
      // REQUIRED for LearnPlay multi-tenant correctness
      organization_id: opts.organizationId,
      visibility: opts.visibility,

      // Basic catalog fields
      title,
      subject,
      description: "",

      // Provenance
      source: "teacherbuddy",
      source_kind: "mes_cache",
      source_course_id: row.mes_course_id,
      locale,
      category_path: (row as any).category_path ?? null,
      education_level: (row as any).education_level ?? null,

      // Raw source metadata (small)
      mes_meta: {
        mes_course_id: row.mes_course_id,
        mes_course_type: row.mes_course_type,
        mes_course_language: row.mes_course_language,
        mes_course_properties: row.mes_course_properties,
        imported_at: row.imported_at,
        updated_at: row.updated_at,
      },

      // Raw source content payload (can be large)
      source_payload: payload,
    },
  };
}

async function promisePool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  const q = [...items];
  const runners = Array.from({ length: concurrency }, async () => {
    while (q.length > 0) {
      const item = q.shift();
      if (!item) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  // Load LearnPlay env (does not print values)
  loadLearnPlayEnv();

  const envFile = argValue("--env-file");
  if (envFile) {
    loadEnvFile(envFile);
  }

  const format = (argValue("--format") ?? "mes").trim();
  const visibilityRaw = (argValue("--visibility") ?? "org").trim();
  const visibility = visibilityRaw === "global" ? "global" : "org";

  const pageSize = clamp(parseIntArg("--page-size", 200), 10, 1000);
  const concurrency = clamp(parseIntArg("--concurrency", 3), 1, 8);

  const cpPath = path.resolve(
    process.cwd(),
    argValue("--checkpoint") ?? "artifacts/replicate-teacherbuddy-checkpoint.json",
  );
  const resume = hasFlag("--resume");
  const retryFailed = hasFlag("--retry-failed");
  const onlyFailed = hasFlag("--only-failed");
  const dryRun = hasFlag("--dry-run");
  const max = parseIntArg("--max", 0);
  const hasMax = Boolean(argValue("--max"));

  const sourceUrl = normalizeSupabaseBaseUrl(requireEnvVar("TEACHERBUDDY_SUPABASE_URL"));
  const sourceServiceRole = requireEnvVar("TEACHERBUDDY_SERVICE_ROLE_KEY");

  // Target LearnPlay supabase base URL (not the functions URL).
  const targetUrl = normalizeSupabaseBaseUrl(requireEnvVar("SUPABASE_URL"));
  const agentToken = requireEnvVar("AGENT_TOKEN");
  const organizationId = requireEnvVar("ORGANIZATION_ID");

  const saveCourseUrl = `${targetUrl}/functions/v1/save-course`;

  const source = createClient(sourceUrl, sourceServiceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let cp: Checkpoint | null = null;
  if (resume || retryFailed || onlyFailed) {
    cp = readCheckpoint(cpPath);
  }
  if (!cp) {
    cp = {
      version: 1,
      started_at: nowIso(),
      updated_at: nowIso(),
      last_mes_course_id: 0,
      ok_count: 0,
      fail_count: 0,
      failed: {},
    };
  }

  function markOk(_mesCourseId: number): void {
    cp!.ok_count += 1;
    cp!.updated_at = nowIso();
    writeCheckpoint(cpPath, cp!);
  }

  function markFailed(mesCourseId: number, message: string): void {
    cp!.fail_count += 1;
    cp!.failed[String(mesCourseId)] = { message: message.slice(0, 500), at: nowIso() };
    cp!.updated_at = nowIso();
    writeCheckpoint(cpPath, cp!);
  }

  async function uploadOne(row: MesCourseRow, contentRow: MesCourseContentRow | null): Promise<void> {
    const envelope = mapToEnvelope(row, contentRow, { organizationId, visibility, format });

    if (dryRun) {
      return;
    }

    const res = await fetchWithTimeout(
      saveCourseUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Token": agentToken,
        },
        body: JSON.stringify(envelope),
      },
      120_000,
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`save-course failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const json = (await res.json().catch(() => null)) as any;
    if (!json || json.ok !== true) {
      throw new Error(`save-course returned non-ok response`);
    }
  }

  async function processCourseId(mesCourseId: number): Promise<void> {
    // Fetch metadata
    const { data: courseRows, error: courseErr } = await source
      .from("mes_course")
      .select("*")
      .eq("mes_course_id", mesCourseId)
      .limit(1);
    if (courseErr) throw new Error(`source mes_course read failed: ${courseErr.message}`);
    const row = (courseRows?.[0] ?? null) as MesCourseRow | null;
    if (!row) throw new Error(`source mes_course_id ${mesCourseId} not found`);

    // Fetch content
    const { data: contentRows, error: contentErr } = await source
      .from("mes_course_content")
      .select("course_id, content, imported_at, updated_at")
      .eq("course_id", mesCourseId)
      .limit(1);
    if (contentErr) throw new Error(`source mes_course_content read failed: ${contentErr.message}`);
    const contentRow = (contentRows?.[0] ?? null) as MesCourseContentRow | null;

    await uploadOne(row, contentRow);
    // If it succeeds, remove from failed set if present.
    delete cp!.failed[String(mesCourseId)];
    markOk(mesCourseId);
  }

  async function processPage(rows: MesCourseRow[]): Promise<void> {
    const ids = rows.map((r) => r.mes_course_id);
    const { data: contentRows, error: contentErr } = await source
      .from("mes_course_content")
      .select("course_id, content, imported_at, updated_at")
      .in("course_id", ids);
    if (contentErr) {
      throw new Error(`source mes_course_content batch read failed: ${contentErr.message}`);
    }
    const byId = new Map<number, MesCourseContentRow>();
    for (const c of (contentRows ?? []) as MesCourseContentRow[]) {
      byId.set(Number(c.course_id), c);
    }

    let processed = 0;

    await promisePool(rows, concurrency, async (row) => {
      const id = row.mes_course_id;
      try {
        await uploadOne(row, byId.get(id) ?? null);
        delete cp!.failed[String(id)];
        markOk(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        markFailed(id, msg);
      } finally {
        processed += 1;
        if (hasMax && max > 0 && cp!.ok_count + cp!.fail_count >= max) {
          // No-op: checked by the outer loop; we still let in-flight work finish.
        }
        if (processed % 25 === 0) {
          console.log(`[replicate-teacherbuddy] Progress: attempted ${processed}/${rows.length} in current page`);
        }
      }
    });

    // Advance checkpoint cursor to the end of the page (even if some failed).
    const maxId = Math.max(...rows.map((r) => r.mes_course_id));
    if (Number.isFinite(maxId)) {
      cp!.last_mes_course_id = Math.max(cp!.last_mes_course_id, maxId);
      cp!.updated_at = nowIso();
      writeCheckpoint(cpPath, cp!);
    }
  }

  console.log(`[replicate-teacherbuddy] Starting replication (dryRun=${dryRun})`);
  console.log(`[replicate-teacherbuddy] Source: ${sourceUrl}`);
  console.log(`[replicate-teacherbuddy] Target: ${targetUrl}`);
  console.log(`[replicate-teacherbuddy] format=${format}, visibility=${visibility}, pageSize=${pageSize}, concurrency=${concurrency}`);
  console.log(`[replicate-teacherbuddy] checkpoint=${path.relative(process.cwd(), cpPath)}`);

  if (onlyFailed) {
    const failedIds = Object.keys(cp.failed).map((s) => Number(s)).filter((n) => Number.isFinite(n));
    if (failedIds.length === 0) {
      console.log("[replicate-teacherbuddy] No failed IDs in checkpoint.");
      return;
    }
    console.log(`[replicate-teacherbuddy] Processing failed IDs only: ${failedIds.length}`);
    for (const id of failedIds) {
      try {
        await processCourseId(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        markFailed(id, msg);
      }
    }
    return;
  }

  let lastId = resume ? cp.last_mes_course_id : 0;
  let totalLoop = 0;

  while (true) {
    if (hasMax && max > 0 && cp.ok_count + cp.fail_count >= max) {
      console.log(`[replicate-teacherbuddy] Max reached (${max}); stopping.`);
      break;
    }

    const { data, error } = await source
      .from("mes_course")
      .select("*")
      .gt("mes_course_id", lastId)
      .order("mes_course_id", { ascending: true })
      .limit(pageSize);

    if (error) {
      console.error(`[replicate-teacherbuddy] ❌ Source page fetch failed: ${error.message}`);
      process.exit(1);
    }

    const rows = (data ?? []) as MesCourseRow[];
    if (rows.length === 0) break;

    console.log(`[replicate-teacherbuddy] Page: mes_course_id ${rows[0]!.mes_course_id}..${rows[rows.length - 1]!.mes_course_id} (${rows.length})`);

    await processPage(rows);

    lastId = rows[rows.length - 1]!.mes_course_id;
    totalLoop += rows.length;

    // Respect --max (stop early)
    if (hasMax && max > 0 && cp.ok_count + cp.fail_count >= max) {
      console.log(`[replicate-teacherbuddy] Max reached (${max}); stopping.`);
      break;
    }
  }

  console.log(`[replicate-teacherbuddy] Initial pass complete. ok=${cp.ok_count}, failed=${Object.keys(cp.failed).length}, cursor=${cp.last_mes_course_id}`);

  if (retryFailed && Object.keys(cp.failed).length > 0) {
    const failedIds = Object.keys(cp.failed).map((s) => Number(s)).filter((n) => Number.isFinite(n));
    console.log(`[replicate-teacherbuddy] Retrying failed IDs once (${failedIds.length})...`);
    for (const id of failedIds) {
      try {
        await processCourseId(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        markFailed(id, msg);
      }
    }
    console.log(`[replicate-teacherbuddy] Retry pass complete. ok=${cp.ok_count}, failed=${Object.keys(cp.failed).length}`);
  }

  console.log(`[replicate-teacherbuddy] Done. Attempted=${totalLoop}, ok=${cp.ok_count}, failed=${Object.keys(cp.failed).length}`);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[replicate-teacherbuddy] ❌ Fatal: ${msg}`);
  process.exit(1);
});



