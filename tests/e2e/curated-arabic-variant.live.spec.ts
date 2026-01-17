import { test, expect } from "@playwright/test";
import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";
import { randomUUID } from "crypto";

// Ensure local-only env files are loaded into process.env for live E2E runs.
// This does NOT print secrets; it only populates process.env.
loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env before running live E2E`);
  }
  return String(v).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

function encodeStoragePath(p: string): string {
  return String(p || "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

test("live: curated_arabic_variant_build persists Arabic pack and renders RTL HTML (real DB + real LLM)", async ({ request, page }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const seedTag = `e2e-curated-arabic-${Date.now()}`;
  const curatedId = randomUUID();

  // Keep keyword set small to reduce LLM compliance risk in a live test.
  const nlKeywords = ["zorgprofessional", "zorgvrager", "COPD", "zuurstof", seedTag];

  const sourcePackPath = `${ORGANIZATION_ID}/${curatedId}/curated/b2.json`;
  const arabicPackPath = `${ORGANIZATION_ID}/${curatedId}/curated/ar.json`;

  const title = `E2E Curated Pack (${seedTag})`;

  const dutchHtml = [
    `<h2>${title}</h2>`,
    `<p>Deze casus gaat over <strong>COPD</strong> en zuurstoftherapie bij een zorgvrager. Je bent de zorgprofessional en je werkt stap voor stap.</p>`,
    `<ul>`,
    `<li>Let op benauwdheid en saturatie.</li>`,
    `<li>Controleer zuurstof (liters/minuut) volgens protocol.</li>`,
    `<li>Leg uit wat je doet aan de zorgvrager.</li>`,
    `</ul>`,
    `<p>Keywords (exact): ${nlKeywords.map((k) => `<code>${k}</code>`).join(" ")}</p>`,
  ].join("\n");

  const sourcePack = {
    schema_version: 1,
    id: curatedId,
    language_variant: "b2",
    title,
    kd_codes: ["WP2.3"],
    keywords: nlKeywords,
    nl_keywords: nlKeywords,
    preview: `B2 preview (${seedTag})`,
    content_html: dutchHtml,
    updated_at: new Date().toISOString(),
  };

  const agentHeaders = {
    "Content-Type": "application/json",
    "x-agent-token": AGENT_TOKEN,
    "x-organization-id": ORGANIZATION_ID,
  } as const;

  const adminHeaders = {
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  } as const;
  const storageAdminHeaders = {
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: SUPABASE_SERVICE_ROLE_KEY,
  } as const;

  let primaryError: unknown = null;
  let cleanupError: string | null = null;
  let jobId = "";

  try {
    // 0) Upload source pack JSON to Storage (private bucket, service role).
    const putSource = await request.post(`${SUPABASE_URL}/storage/v1/object/materials/${encodeStoragePath(sourcePackPath)}`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        "x-upsert": "true",
      },
      data: JSON.stringify(sourcePack, null, 2),
      timeout: 60_000,
    });
    expect(putSource.ok()).toBeTruthy();

    // 1) Create curated-material record pointing at the source variant.
    const saveResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
      headers: agentHeaders,
      data: {
        entity: "curated-material",
        values: {
          id: curatedId,
          title,
          material_type: "casus",
          kd_codes: ["WP2.3"],
          keywords: nlKeywords,
          preview: `Korte preview (${seedTag})`,
          variants: {
            b2: {
              storage_bucket: "materials",
              storage_path: sourcePackPath,
              preview: `B2 preview (${seedTag})`,
              keywords: nlKeywords,
              nl_keywords: nlKeywords,
            },
          },
        },
      },
      timeout: 60_000,
    });
    const saveJson = (await saveResp.json().catch(() => null)) as any;
    expect(saveResp.ok()).toBeTruthy();
    expect(saveJson?.ok).toBe(true);

    // 2) Enqueue Arabic variant build job (factory job; real LLM call happens in worker).
    const enqResp = await request.post(`${SUPABASE_URL}/functions/v1/enqueue-job`, {
      headers: agentHeaders,
      data: {
        jobType: "curated_arabic_variant_build",
        payload: {
          curated_material_id: curatedId,
          source_language_variant: "b2",
        },
      },
      timeout: 60_000,
    });
    const enqJson = (await enqResp.json().catch(() => null)) as any;
    expect(enqResp.ok()).toBeTruthy();
    if (enqJson?.ok !== true) {
      const msg =
        typeof enqJson?.error?.message === "string"
          ? enqJson.error.message
          : typeof enqJson?.error === "string"
            ? enqJson.error
            : "enqueue-job failed";
      throw new Error(`BLOCKED: enqueue-job did not accept curated_arabic_variant_build: ${msg}`);
    }
    jobId = String(enqJson?.jobId || "").trim();
    expect(jobId).toMatch(/[0-9a-f-]{36}/i);

    // 3) Run worker (targeted).
    const workerResp = await request.post(
      `${SUPABASE_URL}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`,
      {
        headers: { "Content-Type": "application/json" },
        data: { worker: true, queue: "agent", jobId },
        timeout: 12 * 60_000,
      },
    );
    expect(workerResp.ok()).toBeTruthy();

    // 4) Poll for completion.
    await poll({
      name: "curated_arabic_variant_build done",
      timeoutMs: 10 * 60_000,
      intervalMs: 3000,
      fn: async () => {
        const r = await request.get(`${SUPABASE_URL}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&includeEvents=true`, {
          headers: agentHeaders,
          timeout: 60_000,
        });
        if (!r.ok()) return null;
        const j = (await r.json().catch(() => null)) as any;
        const st = String(j?.job?.status || "").toLowerCase();
        if (st === "done") return j;
        if (st === "failed" || st === "dead_letter" || st === "stale") {
          throw new Error(`curated_arabic_variant_build failed (status=${st}): ${String(j?.job?.error || "unknown")}`);
        }
        return null;
      },
    });

    // 5) Verify curated record now exposes an Arabic variant path.
    const recResp = await request.get(
      `${SUPABASE_URL}/functions/v1/get-record?entity=curated-material&id=${encodeURIComponent(curatedId)}`,
      { headers: agentHeaders, timeout: 60_000 },
    );
    expect(recResp.ok()).toBeTruthy();
    const recJson = (await recResp.json().catch(() => null)) as any;
    const ar = recJson?.variants?.ar;
    expect(typeof ar?.storage_bucket).toBe("string");
    expect(String(ar?.storage_bucket)).toBe("materials");
    expect(typeof ar?.storage_path).toBe("string");
    expect(String(ar?.storage_path)).toBe(arabicPackPath);

    // 6) Download Arabic pack and verify RTL HTML renders.
    const getArabic = await request.get(`${SUPABASE_URL}/storage/v1/object/materials/${encodeStoragePath(arabicPackPath)}`, {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Cache-Control": "no-cache",
      },
      timeout: 60_000,
    });
    expect(getArabic.ok()).toBeTruthy();
    const arabicPack = (await getArabic.json().catch(() => null)) as any;
    expect(arabicPack?.schema_version).toBe(1);
    expect(String(arabicPack?.language_variant || "")).toBe("ar");
    const html = String(arabicPack?.content_html || "");
    expect(html).toContain('dir="rtl"');
    expect(containsArabic(html)).toBe(true);
    for (const kw of nlKeywords.slice(0, 4)) {
      expect(html).toContain(`<span class="nl-term">${kw}</span>`);
    }

    // Render in browser DOM to ensure the HTML is usable (RTL + nl-term spans present).
    await page.setContent(
      [
        "<!doctype html>",
        "<html><head><meta charset=\"utf-8\" />",
        "<style>.nl-term{color:#2563eb;font-weight:600}</style>",
        "</head><body>",
        html,
        "</body></html>",
      ].join("\n"),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible({ timeout: 30_000 });
    const nlCount = await page.locator(".nl-term").count();
    expect(nlCount).toBeGreaterThan(0);
    await expect(page.locator(".nl-term", { hasText: "zorgprofessional" }).first()).toBeVisible();
  } catch (e) {
    primaryError = e;
  } finally {
    // Cleanup: best-effort delete storage + entity record + job row (do not print secrets).
    const problems: string[] = [];
    try {
      const paths = [sourcePackPath, arabicPackPath].filter(Boolean);
      for (const p of paths) {
        const del = await request.delete(`${SUPABASE_URL}/storage/v1/object/materials/${encodeStoragePath(p)}`, {
          headers: storageAdminHeaders,
          timeout: 60_000,
        });
        const status = del.status();
        if ([200, 204, 404].includes(status)) continue;
        const t = await del.text().catch(() => "");
        const isNotFoundDisguised =
          status === 400 && (t.includes('"statusCode":"404"') || t.includes('"statusCode":404') || t.toLowerCase().includes("object not found"));
        if (isNotFoundDisguised) continue;
        problems.push(`storage delete failed for ${p}: ${status} ${t.slice(0, 200)}`);
      }
    } catch (err) {
      problems.push(`storage cleanup threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const delRec = await request.delete(`${SUPABASE_URL}/rest/v1/entity_records?id=eq.${encodeURIComponent(curatedId)}`, {
        headers: adminHeaders,
        timeout: 60_000,
      });
      if (![200, 204].includes(delRec.status())) {
        const t = await delRec.text().catch(() => "");
        problems.push(`db delete failed for entity_records.id=${curatedId}: ${delRec.status()} ${t.slice(0, 200)}`);
      }
    } catch (err) {
      problems.push(`db cleanup threw for entity_records.id=${curatedId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (jobId) {
      try {
        const delJob = await request.delete(`${SUPABASE_URL}/rest/v1/ai_agent_jobs?id=eq.${encodeURIComponent(jobId)}`, {
          headers: adminHeaders,
          timeout: 60_000,
        });
        if (![200, 204].includes(delJob.status())) {
          const t = await delJob.text().catch(() => "");
          problems.push(`db delete failed for ai_agent_jobs.id=${jobId}: ${delJob.status()} ${t.slice(0, 200)}`);
        }
      } catch (err) {
        problems.push(`db cleanup threw for ai_agent_jobs.id=${jobId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (problems.length) {
      cleanupError = `BLOCKED: cleanup failed for curated arabic live test: ${problems.join(" | ").slice(0, 1200)}`;
    }
  }

  if (cleanupError) {
    if (primaryError) {
      console.warn(cleanupError);
    } else {
      throw new Error(cleanupError);
    }
  }
  if (primaryError) throw primaryError;
});

