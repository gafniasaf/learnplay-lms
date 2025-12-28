/**
 * EC Expert Approval Suite (REAL DB + REAL LLM)
 *
 * Reads ExpertCollege-style study texts from `exerciseexamplefeedback/_extracted/*.txt`,
 * generates exercises via the existing Edge pipeline (enqueue-job -> process-pending-jobs),
 * and writes a human-reviewable markdown report to `reports/ec-expert-approval-suite.<timestamp>.md`.
 *
 * Usage:
 *   npx tsx scripts/ec-expert-approval-suite.ts
 *   npx tsx scripts/ec-expert-approval-suite.ts --limit 3
 *   npx tsx scripts/ec-expert-approval-suite.ts --input exerciseexamplefeedback/_extracted --limit 4
 *
 * NOTE: This uses real LLM calls (costs apply).
 */

import path from "node:path";
import fs from "node:fs/promises";

import { loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

type CaseInput = {
  sourceFile: string;
  sourceLabel: string;
  audience: string;
  subject: string;
  studyText: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env`);
  }
  return String(v).trim();
}

function requireEitherEnv(primary: string, secondary: string): string {
  const a = process.env[primary];
  if (a && String(a).trim()) return String(a).trim();
  const b = process.env[secondary];
  if (b && String(b).trim()) return String(b).trim();
  throw new Error(`BLOCKED: ${primary} or ${secondary} is REQUIRED - set it in the environment or learnplay.env`);
}

function parseArgs(argv: string[]) {
  const args: { input?: string; limit?: number } = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" && argv[i + 1]) {
      args.input = argv[i + 1];
      i++;
      continue;
    }
    if (a === "--limit" && argv[i + 1]) {
      args.limit = Number(argv[i + 1]);
      i++;
      continue;
    }
  }
  return args;
}

function slugify(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function detectAudienceFromFilename(file: string): string {
  const name = path.basename(file).toLowerCase();
  if (name.includes("hbo")) return "HBO";
  if (name.includes("mbo")) return "MBO";
  return "UNKNOWN";
}

function extractFirstSubject(lines: string[]): string | null {
  for (const l of lines) {
    const m = l.match(/^Subject:\s*(.+)\s*$/i);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function extractStudyTextBlocks(lines: string[]): Array<{ subject: string | null; studyText: string; startLine: number }> {
  let currentSubject: string | null = null;
  const blocks: Array<{ subject: string | null; studyText: string; startLine: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    const subj = l.match(/^Subject:\s*(.+)\s*$/i);
    if (subj?.[1]) {
      currentSubject = subj[1].trim();
      continue;
    }

    if (!/^Image ID:\s*/i.test(l)) continue;

    const start = i + 1;
    let end = lines.length;
    for (let j = start; j < lines.length; j++) {
      const lj = lines[j] ?? "";
      if (/^Leerdoel:\s*/i.test(lj)) {
        end = j;
        break;
      }
      // Safety: if the format is unexpected and a new Image ID starts before Leerdoel,
      // don't merge two blocks together.
      if (/^Image ID:\s*/i.test(lj)) {
        end = j;
        break;
      }
    }

    const chunk = lines.slice(start, end).join("\n").trim();
    if (chunk.length >= 80) {
      blocks.push({ subject: currentSubject, studyText: chunk, startLine: start + 1 });
    }

    i = end - 1;
  }

  return blocks;
}

function extractFirstStudyText(lines: string[]): string | null {
  // Heuristic for the extracted .txt format:
  // - Find first "Image ID:" line, then capture until the first "Leerdoel:" line.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^Image ID:\s*/i.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^Leerdoel:\s*/i.test(lines[i])) {
      end = i;
      break;
    }
  }
  const chunk = lines.slice(start, end).join("\n").trim();
  if (chunk.length < 80) return null;
  return chunk;
}

async function listExtractedTxtFiles(inputDir: string): Promise<string[]> {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) continue;
    const name = e.name;
    if (!name.toLowerCase().endsWith(".txt")) continue;
    if (name.toLowerCase().endsWith(".comments.txt")) continue;
    files.push(path.join(inputDir, name));
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

async function buildCases(inputDir: string, limit: number): Promise<CaseInput[]> {
  const files = await listExtractedTxtFiles(inputDir);
  if (files.length === 0) {
    throw new Error(`BLOCKED: No .txt files found in ${inputDir}`);
  }

  // Build a pool of study-text blocks per file, then pick cases round-robin to maximize variety.
  const perFile = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(file, "utf-8");
      const lines = raw.split(/\r?\n/);
      const blocks = extractStudyTextBlocks(lines);
      return {
        file,
        audience: detectAudienceFromFilename(file),
        fallbackSubject: extractFirstSubject(lines) || path.basename(file).replace(/\.txt$/i, "").trim(),
        blocks,
      };
    })
  );

  const ordered = perFile
    .filter((x) => x.blocks.length > 0)
    .sort((a, b) => a.file.localeCompare(b.file));

  if (ordered.length === 0) {
    throw new Error(`BLOCKED: No study text blocks found in ${inputDir} (expected Image ID -> Leerdoel sections)`);
  }

  const indices = new Map<string, number>();
  for (const f of ordered) indices.set(f.file, 0);

  const cases: CaseInput[] = [];
  while (cases.length < limit) {
    let progressed = false;
    for (const f of ordered) {
      if (cases.length >= limit) break;
      const idx = indices.get(f.file) ?? 0;
      const block = f.blocks[idx];
      if (!block) continue;

      progressed = true;
      indices.set(f.file, idx + 1);

      const subject = (block.subject && block.subject.trim()) || f.fallbackSubject;
      const base = path.basename(f.file);
      const sourceLabel = `${base} (block ${idx + 1}, line ${block.startLine})`;

      cases.push({
        sourceFile: f.file,
        sourceLabel,
        audience: f.audience,
        subject,
        studyText: block.studyText,
      });
    }
    if (!progressed) break;
  }

  if (cases.length < limit) {
    console.warn(
      `[approval-suite] Only found ${cases.length} study text blocks in ${inputDir}; requested ${limit}.`
    );
  }

  return cases;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callProcessPendingJobs(args: {
  supabaseUrl: string;
  agentToken: string;
  jobId: string;
}): Promise<{ ok: boolean; status: number; bodyText: string }> {
  const { supabaseUrl, agentToken, jobId } = args;
  const url = `${supabaseUrl}/functions/v1/process-pending-jobs?jobId=${encodeURIComponent(jobId)}&mediaN=0`;

  // NOTE: Node fetch has no default timeout; avoid hanging the approval suite indefinitely.
  // AbortSignal.timeout is available in modern Node (18+); if unavailable, fetch will just run normally.
  const signal = (AbortSignal as any)?.timeout ? (AbortSignal as any).timeout(120_000) : undefined;

  let r: Response;
  let bodyText = "";
  try {
    r = await fetch(url, {
      method: "GET",
      headers: { "x-agent-token": agentToken },
      ...(signal ? { signal } : {}),
    });
    bodyText = await r.text().catch(() => "");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[approval-suite] process-pending-jobs request failed for ${jobId}: ${msg}`);
    return { ok: false, status: 0, bodyText: "" };
  }
  let ok = false;
  try {
    const j = JSON.parse(bodyText || "null");
    ok = r.ok && j?.ok === true;
  } catch {
    ok = false;
  }

  if (!ok) {
    const snippet = (bodyText || "").replace(/\s+/g, " ").trim().slice(0, 280);
    console.warn(`[approval-suite] process-pending-jobs returned ${r.status} for ${jobId}${snippet ? `: ${snippet}` : ""}`);
  }

  return { ok, status: r.status, bodyText };
}

async function requeueJobBestEffort(args: { supabaseUrl: string; agentToken: string; jobId: string }): Promise<void> {
  const { supabaseUrl, agentToken, jobId } = args;
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/requeue-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agent-token": agentToken },
      body: JSON.stringify({ jobId }),
    });
    const t = await r.text().catch(() => "");
    if (!r.ok) {
      console.warn(`[approval-suite] requeue-job returned ${r.status} for ${jobId}: ${t.replace(/\\s+/g, " ").trim().slice(0, 200)}`);
    } else {
      console.warn(`[approval-suite] requeued job ${jobId}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[approval-suite] requeue-job request failed for ${jobId}: ${msg}`);
  }
}

async function poll<T>(args: {
  name: string;
  timeoutMs: number;
  intervalMs: number;
  fn: () => Promise<T | null>;
}): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < args.timeoutMs) {
    const res = await args.fn();
    if (res !== null) return res;
    await sleep(args.intervalMs);
  }
  throw new Error(`Timed out waiting for ${args.name} after ${args.timeoutMs}ms`);
}

async function main(): Promise<void> {
  loadLearnPlayEnv();

  const SUPABASE_URL = requireEitherEnv("VITE_SUPABASE_URL", "SUPABASE_URL");
  const SUPABASE_ANON_KEY = requireEitherEnv("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const args = parseArgs(process.argv);
  const inputDir = args.input || "exerciseexamplefeedback/_extracted";
  const limit = Number.isFinite(args.limit as number) ? Math.max(1, Math.min(20, args.limit as number)) : 3;

  const cases = await buildCases(inputDir, limit);

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const outDir = "reports";
  await fs.mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, `ec-expert-approval-suite.${stamp}.md`);

  const lines: string[] = [];
  lines.push(`# EC Expert Approval Suite`);
  lines.push(``);
  lines.push(`- Generated at: ${now.toISOString()}`);
  lines.push(`- Cases: ${cases.length}`);
  lines.push(`- Mode: REAL DB + REAL LLM (costs apply)`);
  lines.push(``);

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const courseId = `ec-approval-${slugify(c.subject).slice(0, 32) || "course"}-${Date.now()}-${i + 1}`;

    console.log(`[approval-suite] (${i + 1}/${cases.length}) enqueue ${courseId} (${c.audience}) from ${path.basename(c.sourceFile)}`);

    const enqueueResp = await fetch(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-token": AGENT_TOKEN,
        "x-organization-id": ORGANIZATION_ID,
      },
      body: JSON.stringify({
        jobType: "ai_course_generate",
        payload: {
          course_id: courseId,
          subject: c.subject,
          grade_band: c.audience,
          grade: c.audience,
          // Must be divisible by 3 for EC Expert cluster variants
          items_per_group: 3,
          mode: "options",
          protocol: "ec-expert",
          notes: "EC Expert approval suite run",
          study_text: c.studyText,
        },
      }),
    });
    const enqueueJson = (await enqueueResp.json().catch(() => null)) as any;
    if (!enqueueResp.ok || !enqueueJson?.ok || !enqueueJson?.jobId) {
      throw new Error(`enqueue-job failed for ${courseId}: ${JSON.stringify(enqueueJson)}`);
    }
    const jobId = String(enqueueJson.jobId);

    // Drive the worker for this job (best-effort).
    // NOTE: In preview environments we sometimes get non-JSON gateway errors (timeouts).
    // We don't fail immediately; instead we keep driving in the poll loop below.
    await callProcessPendingJobs({ supabaseUrl: SUPABASE_URL, agentToken: AGENT_TOKEN, jobId });

    // Wait for job done OR course.json exists.
    await poll({
      name: `job done (${courseId})`,
      timeoutMs: 12 * 60_000,
      intervalMs: 4000,
      fn: async () => {
        // Keep driving work while we wait (best-effort).
        // If this returns non-JSON/504, the warning is already logged by callProcessPendingJobs.
        await callProcessPendingJobs({ supabaseUrl: SUPABASE_URL, agentToken: AGENT_TOKEN, jobId });

        const r = await fetch(`${SUPABASE_URL}/functions/v1/list-course-jobs?jobId=${encodeURIComponent(jobId)}`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        });
        if (!r.ok) return null;
        const j = (await r.json().catch(() => null)) as any;
        const job = Array.isArray(j?.jobs) ? j.jobs[0] : null;
        if (job?.status === "failed") {
          const err = String(job?.error || "unknown");
          // Preview envs occasionally return a transient 504 from generate-course.
          // Best-effort: requeue once, then keep polling.
          if (err.includes("generate-course failed (504)") && Number(job?.retry_count || 0) < 1) {
            await requeueJobBestEffort({ supabaseUrl: SUPABASE_URL, agentToken: AGENT_TOKEN, jobId });
            return null;
          }
          throw new Error(`Job failed (${courseId}): ${err}`);
        }
        if (job?.status === "done") return job;
        return null;
      },
    });

    const courseEnvelope = await poll<any>({
      name: `course.json (${courseId})`,
      timeoutMs: 6 * 60_000,
      intervalMs: 2500,
      fn: async () => {
        const url = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json?cb=${Date.now()}`;
        const r = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
        if (!r.ok) return null;
        return (await r.json().catch(() => null)) as any;
      },
    });

    const course = (courseEnvelope && typeof courseEnvelope === "object" && "content" in courseEnvelope)
      ? (courseEnvelope as any).content
      : courseEnvelope;

    const groups: Array<{ id: number; name: string }> = Array.isArray(course?.groups) ? course.groups : [];
    const items: any[] = Array.isArray(course?.items) ? course.items : [];

    lines.push(`## Case ${i + 1}: ${c.subject}`);
    lines.push(``);
    lines.push(`- **Audience**: ${c.audience}`);
    lines.push(`- **Source**: \`${path.relative(process.cwd(), c.sourceFile)}\` (${c.sourceLabel})`);
    lines.push(`- **Course ID**: \`${courseId}\``);
    lines.push(`- **Items**: ${items.length}`);
    lines.push(``);
    lines.push(`### Study text (excerpt)`);
    lines.push(``);
    const excerpt = c.studyText.replace(/\s+/g, " ").trim().slice(0, 500);
    lines.push(`> ${excerpt}${c.studyText.length > 500 ? "…" : ""}`);
    lines.push(``);

    // Group items by groupId then clusterId and sort by variant.
    const groupMap = new Map<number, { name: string; clusters: Map<string, any[]> }>();
    for (const g of groups) {
      groupMap.set(g.id, { name: g.name, clusters: new Map() });
    }
    for (const it of items) {
      const gid = typeof it?.groupId === "number" ? it.groupId : -1;
      const cid = typeof it?.clusterId === "string" ? it.clusterId : "unknown";
      if (!groupMap.has(gid)) groupMap.set(gid, { name: `Group ${gid}`, clusters: new Map() });
      const entry = groupMap.get(gid)!;
      if (!entry.clusters.has(cid)) entry.clusters.set(cid, []);
      entry.clusters.get(cid)!.push(it);
    }

    lines.push(`### Generated exercises`);
    lines.push(``);
    for (const [groupId, entry] of Array.from(groupMap.entries()).sort((a, b) => a[0] - b[0])) {
      lines.push(`#### Group ${groupId}: ${entry.name}`);
      lines.push(``);
      for (const [clusterId, clusterItems] of Array.from(entry.clusters.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const sorted = clusterItems.slice().sort((a, b) => String(a?.variant || "").localeCompare(String(b?.variant || "")));
        lines.push(`- **Cluster**: \`${clusterId}\``);
        for (const it of sorted) {
          const variant = String(it?.variant || "");
          const stem = String(it?.text || "").trim();
          const optionsArr: string[] = Array.isArray(it?.options) ? it.options.map(String) : [];
          const correctIndex = typeof it?.correctIndex === "number" ? it.correctIndex : -1;
          const explain = String(it?.explain || "").trim();
          lines.push(`  - **Variant ${variant}**`);
          lines.push(`    - Stem: ${stem}`);
          if (optionsArr.length > 0) {
            const opts = optionsArr.map((o, idx) => (idx === correctIndex ? `**${o}**` : o)).join(" | ");
            lines.push(`    - Options: ${opts}`);
          }
          if (explain) {
            lines.push(`    - Explanation: ${explain}`);
          }
        }
        lines.push(``);
      }
    }

    lines.push(`---`);
    lines.push(``);
  }

  await fs.writeFile(reportPath, lines.join("\n"), "utf-8");
  console.log(`[approval-suite] wrote report: ${reportPath}`);
}

main().catch((e) => {
  console.error(String(e?.stack || e?.message || e));
  process.exit(1);
});


