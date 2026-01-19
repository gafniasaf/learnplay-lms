/**
 * fix-stuck-pipeline.ts
 * 
 * Diagnoses and fixes stuck book generation pipelines:
 * 1. Reset chapter orchestrator attempts when stuck at max attempts
 * 2. Reset stuck section jobs
 * 3. Check and queue missing index/glossary generation
 * 4. Bypass image validation for draft renders
 * 
 * Usage:
 *   npx tsx scripts/books/fix-stuck-pipeline.ts <bookVersionId> [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ BLOCKED: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface DiagnosticResult {
  bookVersionId: string;
  bookId: string | null;
  organizationId: string | null;
  authoringMode: string | null;
  stuckChapterJobs: Array<{
    jobId: string;
    chapterIndex: number;
    attempts: number;
    status: string;
    error: string | null;
    lastProgressAt: string | null;
  }>;
  stuckSectionJobs: Array<{
    jobId: string;
    chapterIndex: number;
    sectionIndex: number;
    retryCount: number;
    maxRetries: number;
    status: string;
    error: string | null;
  }>;
  missingMatter: {
    matterPack: boolean;
    indexGenerated: boolean;
    glossaryGenerated: boolean;
  };
  activeIndexJob: string | null;
  activeGlossaryJob: string | null;
  pendingRenderJobs: number;
}

async function diagnose(bookVersionId: string): Promise<DiagnosticResult> {
  // Get book version info
  const { data: version, error: vErr } = await supabase
    .from("book_versions")
    .select("book_id, authoring_mode")
    .eq("book_version_id", bookVersionId)
    .single();

  if (vErr || !version) {
    console.error(`❌ Book version ${bookVersionId} not found`);
    process.exit(1);
  }

  const bookId = version.book_id;

  // Get organization
  const { data: book } = await supabase
    .from("books")
    .select("organization_id")
    .eq("id", bookId)
    .single();

  const organizationId = book?.organization_id || null;

  // Check for stuck chapter jobs (hit max attempts or failed)
  // Status values in ai_agent_jobs: queued, processing, done, failed, dead_letter, stale
  const { data: chapterJobs } = await supabase
    .from("ai_agent_jobs")
    .select("id, status, error, payload, created_at, updated_at")
    .eq("job_type", "book_generate_chapter")
    .or(`status.eq.failed,status.eq.queued,status.eq.processing`)
    .order("created_at", { ascending: false });

  const stuckChapterJobs: DiagnosticResult["stuckChapterJobs"] = [];
  for (const job of chapterJobs || []) {
    const payload = job.payload as any;
    if (payload?.bookVersionId !== bookVersionId) continue;
    
    const attempts = typeof payload?.orchestratorAttempts === "number" ? payload.orchestratorAttempts : 0;
    const lastProgressAt = payload?.orchestratorLastProgressAt || null;
    
    // Consider stuck if: hit max attempts, or failed, or stuck for too long
    const isStuck = 
      job.status === "failed" || 
      attempts >= 600 ||
      (job.error && job.error.includes("exceeded max attempts"));
    
    if (isStuck || job.status === "processing" || job.status === "queued") {
      stuckChapterJobs.push({
        jobId: job.id,
        chapterIndex: payload?.chapterIndex ?? -1,
        attempts,
        status: job.status,
        error: job.error?.slice(0, 200) || null,
        lastProgressAt,
      });
    }
  }

  // Check for stuck section jobs
  const { data: sectionJobs } = await supabase
    .from("ai_agent_jobs")
    .select("id, status, error, payload, retry_count, max_retries")
    .eq("job_type", "book_generate_section")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(50);

  const stuckSectionJobs: DiagnosticResult["stuckSectionJobs"] = [];
  for (const job of sectionJobs || []) {
    const payload = job.payload as any;
    if (payload?.bookVersionId !== bookVersionId) continue;
    
    stuckSectionJobs.push({
      jobId: job.id,
      chapterIndex: payload?.chapterIndex ?? -1,
      sectionIndex: payload?.sectionIndex ?? -1,
      retryCount: job.retry_count || 0,
      maxRetries: job.max_retries || 3,
      status: job.status,
      error: job.error?.slice(0, 200) || null,
    });
  }

  // Check matter artifacts
  const matterBase = `books/${bookId}/${bookVersionId}/matter`;
  const [mp, idx, gloss] = await Promise.all([
    supabase.storage.from("books").download(`${matterBase}/matter-pack.json`).then(r => !!r.data).catch(() => false),
    supabase.storage.from("books").download(`${matterBase}/index.generated.json`).then(r => !!r.data).catch(() => false),
    supabase.storage.from("books").download(`${matterBase}/glossary.generated.json`).then(r => !!r.data).catch(() => false),
  ]);

  // Check for active index/glossary jobs
  const { data: indexJob } = await supabase
    .from("ai_agent_jobs")
    .select("id")
    .eq("job_type", "book_generate_index")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: glossaryJob } = await supabase
    .from("ai_agent_jobs")
    .select("id")
    .eq("job_type", "book_generate_glossary")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Count pending render jobs for this version
  const { count: renderCount } = await supabase
    .from("book_render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("book_version_id", bookVersionId)
    .in("status", ["queued", "processing", "pending"]);

  return {
    bookVersionId,
    bookId,
    organizationId,
    authoringMode: version.authoring_mode,
    stuckChapterJobs,
    stuckSectionJobs,
    missingMatter: {
      matterPack: !mp,
      indexGenerated: !idx,
      glossaryGenerated: !gloss,
    },
    activeIndexJob: indexJob?.id || null,
    activeGlossaryJob: glossaryJob?.id || null,
    pendingRenderJobs: renderCount || 0,
  };
}

async function fixChapterJob(jobId: string, dryRun: boolean): Promise<void> {
  console.log(`  🔧 Resetting chapter job ${jobId}...`);
  
  // Get current payload
  const { data: job, error: jErr } = await supabase
    .from("ai_agent_jobs")
    .select("payload")
    .eq("id", jobId)
    .single();

  if (jErr || !job) {
    console.log(`    ⚠️ Could not fetch job: ${jErr?.message || "not found"}`);
    return;
  }

  const payload = job.payload as any;
  const nowIso = new Date().toISOString();

  // Reset orchestrator state - preserve progress (nextSectionIndex) but reset attempt counters
  const newPayload = {
    ...payload,
    orchestratorAttempts: 0,
    orchestratorStartedAt: nowIso,
    orchestratorLastProgressAt: nowIso,
    // Reset progress tracking to allow retry from current section
    lastAdvancedSectionIndex: (payload.nextSectionIndex ?? 0) - 1,
    attemptsAtCurrentSection: 0,
    // Clear any pending section job reference to allow fresh scan
    pendingSectionJobId: undefined,
    pendingSectionIndex: undefined,
  };

  if (dryRun) {
    console.log(`    [DRY RUN] Would reset job to queued with nextSectionIndex=${newPayload.nextSectionIndex || 0}`);
    return;
  }

  const { error: upErr } = await supabase
    .from("ai_agent_jobs")
    .update({
      status: "queued",
      error: null,
      payload: newPayload,
      started_at: null,
      completed_at: null,
      updated_at: nowIso,
      retry_count: 0,
    })
    .eq("id", jobId);

  if (upErr) {
    console.log(`    ❌ Failed to reset: ${upErr.message}`);
  } else {
    console.log(`    ✅ Reset to pending (nextSectionIndex=${newPayload.nextSectionIndex || 0})`);
  }
}

async function fixSectionJob(jobId: string, dryRun: boolean): Promise<void> {
  console.log(`  🔧 Resetting section job ${jobId}...`);

  if (dryRun) {
    console.log(`    [DRY RUN] Would reset to queued`);
    return;
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("ai_agent_jobs")
    .update({
      status: "queued",
      error: null,
      started_at: null,
      completed_at: null,
      updated_at: nowIso,
      retry_count: 0,
    })
    .eq("id", jobId);

  if (upErr) {
    console.log(`    ❌ Failed to reset: ${upErr.message}`);
  } else {
    console.log(`    ✅ Reset to pending`);
  }
}

async function enqueueIndexGlossaryJobs(
  bookId: string,
  bookVersionId: string,
  organizationId: string,
  dryRun: boolean
): Promise<{ indexJobId: string | null; glossaryJobId: string | null }> {
  const nowIso = new Date().toISOString();
  let indexJobId: string | null = null;
  let glossaryJobId: string | null = null;

  // Fetch required metadata from skeleton or existing chapter jobs
  let language = "nl"; // Default to Dutch
  let writeModel = "anthropic:claude-sonnet-4-5"; // Default model
  
  // Try to get language/writeModel from an existing chapter job or skeleton
  const { data: existingJob } = await supabase
    .from("ai_agent_jobs")
    .select("payload")
    .eq("job_type", "book_generate_chapter")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingJob?.payload) {
    const p = existingJob.payload as Record<string, unknown>;
    if (typeof p.language === "string" && p.language.trim()) {
      language = p.language.trim();
    }
    if (typeof p.writeModel === "string" && p.writeModel.trim()) {
      writeModel = p.writeModel.trim();
    }
  }

  console.log(`  📋 Using language=${language}, writeModel=${writeModel}`);

  // Index job
  console.log(`  📇 Enqueuing book_generate_index job...`);
  if (!dryRun) {
    const { data: idxJob, error: idxErr } = await supabase
      .from("ai_agent_jobs")
      .insert({
        job_type: "book_generate_index",
        status: "queued",
        payload: {
          bookId,
          bookVersionId,
          language,
          writeModel,
        },
        organization_id: organizationId,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (idxErr) {
      console.log(`    ❌ Failed: ${idxErr.message}`);
    } else {
      indexJobId = idxJob.id;
      console.log(`    ✅ Created job ${indexJobId}`);
    }
  } else {
    console.log(`    [DRY RUN] Would create index job`);
  }

  // Glossary job
  console.log(`  📖 Enqueuing book_generate_glossary job...`);
  if (!dryRun) {
    const { data: glossJob, error: glossErr } = await supabase
      .from("ai_agent_jobs")
      .insert({
        job_type: "book_generate_glossary",
        status: "queued",
        payload: {
          bookId,
          bookVersionId,
          language,
          writeModel,
        },
        organization_id: organizationId,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (glossErr) {
      console.log(`    ❌ Failed: ${glossErr.message}`);
    } else {
      glossaryJobId = glossJob.id;
      console.log(`    ✅ Created job ${glossaryJobId}`);
    }
  } else {
    console.log(`    [DRY RUN] Would create glossary job`);
  }

  return { indexJobId, glossaryJobId };
}

async function main() {
  const args = process.argv.slice(2);
  const bookVersionId = args.find(a => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");

  if (!bookVersionId) {
    console.error("Usage: npx tsx scripts/books/fix-stuck-pipeline.ts <bookVersionId> [--dry-run]");
    process.exit(1);
  }

  console.log(`\n🔍 Diagnosing pipeline for ${bookVersionId}${dryRun ? " [DRY RUN]" : ""}...\n`);

  const diag = await diagnose(bookVersionId);

  console.log(`📊 Diagnostic Results:`);
  console.log(`   Book ID: ${diag.bookId}`);
  console.log(`   Org ID: ${diag.organizationId}`);
  console.log(`   Authoring Mode: ${diag.authoringMode}`);
  console.log();

  // Report stuck chapter jobs
  if (diag.stuckChapterJobs.length > 0) {
    console.log(`⚠️  Stuck Chapter Jobs: ${diag.stuckChapterJobs.length}`);
    for (const j of diag.stuckChapterJobs) {
      console.log(`   - Ch${j.chapterIndex}: ${j.status}, ${j.attempts} attempts${j.error ? ` (${j.error})` : ""}`);
    }
  } else {
    console.log(`✅ No stuck chapter jobs`);
  }

  // Report stuck section jobs
  if (diag.stuckSectionJobs.length > 0) {
    console.log(`⚠️  Stuck Section Jobs: ${diag.stuckSectionJobs.length}`);
    for (const j of diag.stuckSectionJobs.slice(0, 10)) {
      console.log(`   - Ch${j.chapterIndex}.${j.sectionIndex}: ${j.status}, retries ${j.retryCount}/${j.maxRetries}`);
    }
    if (diag.stuckSectionJobs.length > 10) {
      console.log(`   ... and ${diag.stuckSectionJobs.length - 10} more`);
    }
  } else {
    console.log(`✅ No stuck section jobs`);
  }

  // Report matter status
  console.log();
  console.log(`📦 Matter Artifacts:`);
  console.log(`   matter-pack.json: ${diag.missingMatter.matterPack ? "❌ MISSING" : "✅ Present"}`);
  console.log(`   index.generated.json: ${diag.missingMatter.indexGenerated ? "❌ MISSING" : "✅ Present"}`);
  console.log(`   glossary.generated.json: ${diag.missingMatter.glossaryGenerated ? "❌ MISSING" : "✅ Present"}`);
  console.log(`   Active index job: ${diag.activeIndexJob || "none"}`);
  console.log(`   Active glossary job: ${diag.activeGlossaryJob || "none"}`);
  console.log(`   Pending render jobs: ${diag.pendingRenderJobs}`);

  console.log();
  console.log(`🔧 Applying Fixes...\n`);

  // Fix 1: Reset stuck chapter jobs
  const failedChapterJobs = diag.stuckChapterJobs.filter(
    j => j.status === "failed" || j.attempts >= 600
  );
  if (failedChapterJobs.length > 0) {
    console.log(`📋 Resetting ${failedChapterJobs.length} stuck chapter job(s):`);
    for (const j of failedChapterJobs) {
      await fixChapterJob(j.jobId, dryRun);
    }
    console.log();
  }

  // Fix 2: Reset failed section jobs that have exhausted retries
  const exhaustedSectionJobs = diag.stuckSectionJobs.filter(j => j.retryCount >= j.maxRetries);
  if (exhaustedSectionJobs.length > 0) {
    console.log(`📋 Resetting ${exhaustedSectionJobs.length} exhausted section job(s):`);
    for (const j of exhaustedSectionJobs.slice(0, 20)) {
      await fixSectionJob(j.jobId, dryRun);
    }
    if (exhaustedSectionJobs.length > 20) {
      console.log(`   ... (limited to first 20)`);
    }
    console.log();
  }

  // Fix 3: Enqueue index/glossary jobs if missing and no active jobs
  const needsIndexGlossary = 
    (diag.missingMatter.indexGenerated || diag.missingMatter.glossaryGenerated) &&
    !diag.activeIndexJob &&
    !diag.activeGlossaryJob;

  if (needsIndexGlossary && diag.bookId && diag.organizationId) {
    console.log(`📋 Enqueuing missing matter generation jobs:`);
    await enqueueIndexGlossaryJobs(diag.bookId, bookVersionId, diag.organizationId, dryRun);
    console.log();
  }

  console.log(`\n✅ Pipeline fix complete${dryRun ? " [DRY RUN - no changes made]" : ""}!`);
  console.log();
  console.log(`Next steps:`);
  console.log(`  1. Trigger the job runner: curl -X POST <SUPABASE_URL>/functions/v1/ai-job-runner`);
  console.log(`  2. Monitor progress: npx tsx scripts/books/auto-poll-and-fix-bookgen.ts ${diag.bookId} ${bookVersionId}`);
  if (diag.missingMatter.indexGenerated || diag.missingMatter.glossaryGenerated) {
    console.log(`  3. Wait for index/glossary jobs to complete before triggering render`);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
