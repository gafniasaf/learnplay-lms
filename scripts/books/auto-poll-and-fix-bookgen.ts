/**
 * Auto-poll a single book/version's BookGen jobs every N minutes and apply bounded auto-fixes.
 *
 * Usage:
 *   npx tsx scripts/books/auto-poll-and-fix-bookgen.ts <bookId> <bookVersionId> [intervalMinutes]
 *
 * Env (required):
 * - SUPABASE_URL or VITE_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - ORGANIZATION_ID
 *
 * Notes:
 * - Never prints secrets.
 * - Bounded auto-fix: if the same job keeps failing with the same signature too many times, HALT.
 * - Stops automatically if it detects the run is complete (no failed + no active jobs) for 2 polls.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    console.error(`❌ ${name} is REQUIRED`);
    process.exit(1);
  }
  return String(v).trim();
}

function getSupabaseUrl(): string {
  const v0 = typeof process.env.VITE_SUPABASE_URL === "string" ? process.env.VITE_SUPABASE_URL.trim() : "";
  if (v0) return v0.replace(/\/$/, "");
  return requireEnv("SUPABASE_URL").replace(/\/$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeSig(err: unknown): string {
  const s = typeof err === "string" ? err : err instanceof Error ? err.message : String(err ?? "");
  return s.replace(/\s+/g, " ").trim().slice(0, 220);
}

type FixStateV1 = {
  version: 1;
  bookId: string;
  bookVersionId: string;
  createdAt: string;
  updatedAt: string;
  jobs: Record<string, { attempts: number; lastSig: string; lastFixedAt: string }>;
  consecutiveCompletePolls: number;
};

async function loadState(statePath: string, bookId: string, bookVersionId: string): Promise<FixStateV1> {
  try {
    const raw = await readFile(statePath, "utf8");
    const json = JSON.parse(raw);
    if (json && json.version === 1 && json.bookId === bookId && json.bookVersionId === bookVersionId) {
      return json as FixStateV1;
    }
  } catch {
    // ignore
  }
  return {
    version: 1,
    bookId,
    bookVersionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    jobs: {},
    consecutiveCompletePolls: 0,
  };
}

async function saveState(statePath: string, state: FixStateV1): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

function stripRuntimeKeysForSection(payload: any): any {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};
  delete p.__draftAttempt;
  delete p.__draftFailureReason;
  delete p.__draftMustFillTitle;
  delete p.__llmTimeoutAttempt;
  delete p.__emptyBlocksRecoveries;
  delete p.__yieldCount;
  delete p.sectionMaxTokens;
  return p;
}

function stripRuntimeKeysForChapter(payload: any): any {
  const p = payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};
  delete p.orchestratorAttempts;
  delete p.orchestratorStartedAt;
  delete p.orchestratorLastProgressAt;
  delete p.__yieldCount;
  // Keep nextSectionIndex/pendingSectionJobId so it can resume.
  return p;
}

function applyEscalationsForSection(payload: any, sig: string, attempts: number): any {
  const p = stripRuntimeKeysForSection(payload);

  // Most common hard-fail: model returns blocks:[] (validator sees got=0).
  if (sig.includes("Numbered subparagraph count mismatch (got=0")) {
    // Escalate to OpenAI after repeated failures.
    if (attempts >= 2) {
      p.writeModel = "openai:gpt-5.2";
    }
    if (attempts >= 4) {
      p.writeModel = "openai:gpt-4o";
    }
    // Keep token budget moderate to reduce timeouts.
    p.sectionMaxTokens = 5000;
  }

  // If we hit LLM timeout many times, lower tokens and switch model.
  if (sig.toLowerCase().includes("timed out")) {
    p.sectionMaxTokens = 3500;
    if (attempts >= 2) p.writeModel = "openai:gpt-5.2";
  }

  return p;
}

async function main() {
  const bookId = String(process.argv[2] || "").trim();
  const bookVersionId = String(process.argv[3] || "").trim();
  const intervalMinutesRaw = String(process.argv[4] || "30").trim();
  const intervalMinutes = Number.parseInt(intervalMinutesRaw, 10);
  if (!bookId || !bookVersionId || !Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
    console.error("Usage: npx tsx scripts/books/auto-poll-and-fix-bookgen.ts <bookId> <bookVersionId> [intervalMinutes]");
    process.exit(1);
  }

  const SUPABASE_URL = getSupabaseUrl();
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ORG_ID = requireEnv("ORGANIZATION_ID");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stateDir = path.join(process.cwd(), "tmp", "bookgen-auto-fix");
  await mkdir(stateDir, { recursive: true });
  const statePath = path.join(stateDir, `state.${bookId}.${bookVersionId}.json`);
  const state = await loadState(statePath, bookId, bookVersionId);

  const intervalMs = intervalMinutes * 60_000;
  const MAX_POLLS = 200; // explicit termination condition
  const MAX_FIX_ATTEMPTS_PER_SIG = 6; // explicit termination condition

  console.log(
    `[auto-poll] Watching book=${bookId} version=${bookVersionId} every ${intervalMinutes}m (maxPolls=${MAX_POLLS})`,
  );

  for (let poll = 1; poll <= MAX_POLLS; poll++) {
    const now = new Date().toISOString();

    const { data: rows, error } = await supabase
      .from("ai_agent_jobs")
      .select("id,job_type,status,error,payload,created_at,updated_at")
      .eq("organization_id", ORG_ID)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error(`[auto-poll] ${now} ❌ DB query failed: ${error.message}`);
      await sleep(intervalMs);
      continue;
    }

    const jobs = (Array.isArray(rows) ? rows : []).filter((j: any) => {
      const p = j?.payload && typeof j.payload === "object" ? (j.payload as any) : null;
      return p?.bookId === bookId && p?.bookVersionId === bookVersionId;
    });

    const failed = jobs.filter((j: any) => j.status === "failed");
    const active = jobs.filter((j: any) => j.status === "queued" || j.status === "processing");
    const done = jobs.filter((j: any) => j.status === "done");

    console.log(
      `[auto-poll] ${now} poll=${poll}/${MAX_POLLS} active=${active.length} failed=${failed.length} done=${done.length} (seen=${jobs.length})`,
    );

    if (failed.length === 0 && active.length === 0 && jobs.length > 0) {
      state.consecutiveCompletePolls += 1;
      await saveState(statePath, state);
      if (state.consecutiveCompletePolls >= 2) {
        console.log(`[auto-poll] ✅ No active/failed jobs for 2 polls; assuming generation is complete. Stopping.`);
        return;
      }
    } else {
      state.consecutiveCompletePolls = 0;
    }

    let fixedAny = false;
    for (const j of failed) {
      const jobId = String(j.id || "").trim();
      const jobType = String(j.job_type || "").trim();
      const sig = normalizeSig(j.error);
      if (!jobId || !jobType) continue;

      const prev = state.jobs[jobId];
      const attempts = prev && prev.lastSig === sig ? prev.attempts + 1 : 1;
      state.jobs[jobId] = { attempts, lastSig: sig, lastFixedAt: now };

      if (attempts > MAX_FIX_ATTEMPTS_PER_SIG) {
        console.error(`[auto-poll] ❌ HALT: job ${jobId} keeps failing with same error after ${MAX_FIX_ATTEMPTS_PER_SIG} fixes.`);
        console.error(`[auto-poll]     type=${jobType} sig=${sig}`);
        await saveState(statePath, state);
        process.exit(1);
      }

      console.log(`[auto-poll] 🔧 Fixing failed job ${jobId} type=${jobType} attempt=${attempts} sig=${sig}`);

      const payload = j.payload && typeof j.payload === "object" ? (j.payload as any) : {};
      let nextPayload: any = payload;

      if (jobType === "book_generate_section") {
        nextPayload = applyEscalationsForSection(payload, sig, attempts);
      } else if (jobType === "book_generate_chapter") {
        nextPayload = stripRuntimeKeysForChapter(payload);
      } else {
        // Other job types: just reset status/error counters, keep payload.
        nextPayload = payload;
      }

      const { error: upErr } = await supabase
        .from("ai_agent_jobs")
        .update({
          status: "queued",
          error: null,
          retry_count: 0,
          started_at: null,
          completed_at: null,
          last_heartbeat: null,
          payload: nextPayload,
        })
        .eq("id", jobId);

      if (upErr) {
        console.error(`[auto-poll] ❌ Failed to reset job ${jobId}: ${upErr.message}`);
        continue;
      }
      fixedAny = true;
    }

    if (fixedAny) {
      await saveState(statePath, state);
      console.log(`[auto-poll] ✅ Applied fixes. Next poll in ${intervalMinutes}m.`);
    } else {
      await saveState(statePath, state);
    }

    await sleep(intervalMs);
  }

  console.error(`[auto-poll] ❌ HALT: exceeded MAX_POLLS=${MAX_POLLS}.`);
  process.exit(1);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ auto-poll-and-fix-bookgen failed: ${msg}`);
  process.exit(1);
});


