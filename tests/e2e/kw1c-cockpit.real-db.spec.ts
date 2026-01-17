import { test, expect } from "@playwright/test";
import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";
import { loadLocalEnvForTests } from "../helpers/load-local-env";
import { randomUUID } from "node:crypto";

// Attempt to auto-resolve required env vars from local env files (learnplay.env), without printing secrets.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`BLOCKED: ${name} is REQUIRED - set it in the environment or learnplay.env before running real-db E2E`);
  }
  return String(v).trim();
}

function parseCount(label: string, raw: string | null): number {
  const t = String(raw || "").trim();
  if (!t) throw new Error(`Expected ${label} to have a value, got empty`);
  if (t === "…" || t === "—") throw new Error(`Expected ${label} to load a numeric value, got '${t}'`);
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Expected ${label} to be a number, got '${t}'`);
  return Math.floor(n);
}

function encodeStoragePath(path: string): string {
  return String(path || "")
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

test("real-db: KW1C cockpit loads overview, navigates to KD, and searches curated materials (B2/B1/A2/AR)", async ({ page, request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

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

  const seedToken = `e2e-kw1c-${Date.now()}`;

  // Seed deterministic records (real DB, no live generation).
  const materialId = randomUUID();
  const standardsId = randomUUID();
  const curatedId = randomUUID();

  const materialTitle = `E2E KW1C Material (${seedToken})`;
  const standardsTitle = `E2E KW1C KD Document (${seedToken})`;
  const curatedTitle = `E2E KW1C Casus COPD (${seedToken})`;

  let primaryError: unknown = null;
  let cleanupError: string | null = null;

  try {
    // 1) Seed a library material record (for cockpit count + standards mapping selection)
    const saveMaterialResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
      headers: agentHeaders,
      data: {
        entity: "library-material",
        values: {
          id: materialId,
          title: materialTitle,
          source: "e2e",
          storage_bucket: "materials",
          storage_path: `${ORGANIZATION_ID}/${materialId}/upload/${seedToken}.txt`,
          status: "uploaded",
          analysis_summary: {},
        },
      },
      timeout: 60_000,
    });
    const saveMaterialJson = (await saveMaterialResp.json().catch(() => null)) as any;
    expect(saveMaterialResp.ok()).toBeTruthy();
    expect(saveMaterialJson?.ok).toBe(true);

    // 2) Seed a standards document record (for cockpit KD docs count + standards mapping selection)
    const saveStandardsResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
      headers: agentHeaders,
      data: {
        entity: "standards-document",
        values: {
          id: standardsId,
          title: standardsTitle,
          source: "e2e",
          locale: "nl-NL",
          file_name: `${seedToken}.txt`,
          content_type: "text/plain",
          storage_bucket: "materials",
          storage_path: `${ORGANIZATION_ID}/${standardsId}/upload/${seedToken}.txt`,
          status: "uploaded",
          item_count: 0,
          items: [],
          ingest_summary: {},
        },
      },
      timeout: 60_000,
    });
    const saveStandardsJson = (await saveStandardsResp.json().catch(() => null)) as any;
    expect(saveStandardsResp.ok()).toBeTruthy();
    expect(saveStandardsJson?.ok).toBe(true);

    // 3) Seed a curated material pack (entity_records: curated-material) with all language variants.
    const saveCuratedResp = await request.post(`${SUPABASE_URL}/functions/v1/save-record`, {
      headers: agentHeaders,
      data: {
        entity: "curated-material",
        values: {
          id: curatedId,
          title: curatedTitle,
          material_type: "casus",
          kd_codes: ["WP2.3"],
          keywords: ["COPD", seedToken],
          preview: `Korte preview voor curated pack (${seedToken})`,
          variants: {
            b2: {
              storage_bucket: "materials",
              storage_path: `${ORGANIZATION_ID}/${curatedId}/variants/b2/${seedToken}.json`,
              preview: `B2 preview (${seedToken})`,
              keywords: ["COPD", "klinisch redeneren"],
              nl_keywords: ["zorgprofessional", "zorgvrager"],
            },
            b1: {
              storage_bucket: "materials",
              storage_path: `${ORGANIZATION_ID}/${curatedId}/variants/b1/${seedToken}.json`,
              preview: `B1 preview (${seedToken})`,
              keywords: ["COPD"],
              nl_keywords: ["zorgprofessional", "zorgvrager"],
            },
            a2: {
              storage_bucket: "materials",
              storage_path: `${ORGANIZATION_ID}/${curatedId}/variants/a2/${seedToken}.json`,
              preview: `A2 preview (${seedToken})`,
              keywords: ["COPD"],
              nl_keywords: ["zorgprofessional", "zorgvrager"],
            },
            ar: {
              storage_bucket: "materials",
              storage_path: `${ORGANIZATION_ID}/${curatedId}/variants/ar/${seedToken}.json`,
              preview: `نسخة عربية (${seedToken})`,
              keywords: ["COPD"],
              nl_keywords: ["zorgprofessional", "zorgvrager"],
            },
          },
        },
      },
      timeout: 60_000,
    });
    const saveCuratedJson = (await saveCuratedResp.json().catch(() => null)) as any;
    expect(saveCuratedResp.ok()).toBeTruthy();
    expect(saveCuratedJson?.ok).toBe(true);

    // 3b) Seed the actual pack files in Storage (materials bucket) so "Open" can render HTML.
    const nowIso = new Date().toISOString();
    const mkPack = (lang: "b2" | "b1" | "a2" | "ar") => ({
      schema_version: 1,
      id: curatedId,
      title: curatedTitle,
      material_type: "casus",
      language_variant: lang,
      kd_codes: ["WP2.3"],
      keywords: ["COPD", seedToken],
      nl_keywords: ["zorgprofessional", "zorgvrager"],
      preview: `Pack preview ${lang} (${seedToken})`,
      content_html:
        lang === "ar"
          ? `<h2>حالة COPD <span class="nl-term">(zorgprofessional)</span></h2><p>هذه مادة مُعدة مسبقًا <span class="nl-term">(zorgvrager)</span>.</p>`
          : `<h2>Casus COPD (${lang.toUpperCase()})</h2><p>Vooraf gebouwde casus voor ${seedToken}. Termen: <span class="nl-term">zorgprofessional</span>, <span class="nl-term">zorgvrager</span>.</p>`,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const variantPaths: Record<"b2" | "b1" | "a2" | "ar", string> = {
      b2: `${ORGANIZATION_ID}/${curatedId}/variants/b2/${seedToken}.json`,
      b1: `${ORGANIZATION_ID}/${curatedId}/variants/b1/${seedToken}.json`,
      a2: `${ORGANIZATION_ID}/${curatedId}/variants/a2/${seedToken}.json`,
      ar: `${ORGANIZATION_ID}/${curatedId}/variants/ar/${seedToken}.json`,
    };

    for (const lang of ["b2", "b1", "a2", "ar"] as const) {
      const p = variantPaths[lang];
      const upload = await request.post(`${SUPABASE_URL}/storage/v1/object/materials/${encodeStoragePath(p)}`, {
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
          "x-upsert": "true",
        },
        data: Buffer.from(JSON.stringify(mkPack(lang), null, 2), "utf-8"),
        timeout: 60_000,
      });
      expect(upload.ok()).toBeTruthy();
    }

    // Ensure the run exercises real Supabase session auth (not dev-agent mode).
    await page.addInitScript(() => {
      try { window.localStorage.setItem("iz_dev_agent_disabled", "1"); } catch {}
      try { window.sessionStorage.setItem("iz_dev_agent_disabled", "1"); } catch {}
    });

    // Guardrail: cockpit must not enqueue any jobs during search/recommend flows.
    const enqueueCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/functions/v1/enqueue-job")) enqueueCalls.push(`${req.method()} ${req.url()}`);
    });

    // 4) Open cockpit and verify overview loads (counts should resolve; materials/KD docs should include our seeded rows).
    await page.goto("/teacher/kw1c-cockpit", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Docent Cockpit (KW1C)" })).toBeVisible({ timeout: 30_000 });

    // CTA parity with mockup/coverage (ensures cta-smoke/coverage checks won’t drift).
    await expect(page.locator('[data-cta-id="cta-kw1c-to-teacher-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-open-teachergpt-chat"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-open-classes"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-open-students"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-open-materials"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-open-standards"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-open-lesson-kits"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-open-mes"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-type"]')).toBeVisible();
    await expect(page.locator('[data-cta-id="cta-kw1c-language"]')).toBeVisible();

    const materialsValue = page.locator(".stat-card").filter({ hasText: "Materialen" }).locator(".stat-value");
    const standardsValue = page.locator(".stat-card").filter({ hasText: "KD documenten" }).locator(".stat-value");

    await expect(materialsValue).not.toHaveText("…", { timeout: 30_000 });
    await expect(standardsValue).not.toHaveText("…", { timeout: 30_000 });

    const materialsCount = parseCount("materials count", await materialsValue.textContent());
    const standardsCount = parseCount("standards docs count", await standardsValue.textContent());
    expect(materialsCount).toBeGreaterThanOrEqual(1);
    expect(standardsCount).toBeGreaterThanOrEqual(1);

    // 5) KD mapping surface: navigate to Standards from cockpit and confirm the seeded options exist.
    await page.locator(".stat-card").filter({ hasText: "KD documenten" }).click();
    await expect(page).toHaveURL(/\/teacher\/standards/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Standards", exact: true })).toBeVisible({ timeout: 30_000 });

    const standardsSelect = page.locator('[data-cta-id="cta-teacher-standards-select-standards"]');
    const materialSelect = page.locator('[data-cta-id="cta-teacher-standards-select-material"]');
    await expect(standardsSelect).toBeVisible({ timeout: 30_000 });
    await expect(materialSelect).toBeVisible({ timeout: 30_000 });
    await standardsSelect.selectOption({ value: standardsId });
    await materialSelect.selectOption({ value: materialId });

    // 6) Curated search: verify language variants are selectable and return our seeded record.
    await page.goto("/teacher/kw1c-cockpit", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Docent Cockpit (KW1C)" })).toBeVisible({ timeout: 30_000 });

    await page.locator('[data-cta-id="cta-kw1c-query"]').fill(seedToken);
    await page.locator('[data-cta-id="cta-kw1c-kd-code"]').fill("WP2.3");

    const typeSelect = page.getByLabel("Type");
    const languageSelect = page.getByLabel("Taalvariant");
    await typeSelect.selectOption("casus");

    for (const variant of ["b2", "b1", "a2", "ar"] as const) {
      await languageSelect.selectOption(variant);

      const waitSearch = page.waitForResponse(
        (r) => r.url().includes("/functions/v1/search-curated-materials") && r.request().method() === "GET",
        { timeout: 60_000 }
      );

      await page.locator('[data-cta-id="cta-kw1c-search"]').click();
      const resp = await waitSearch;
      expect(resp.ok()).toBeTruthy();
      const json = (await resp.json().catch(() => null)) as any;
      expect(json?.ok).toBe(true);

      const resultsList = page.locator('ul[data-list="curated_results"]');
      await expect(resultsList).toContainText(curatedTitle, { timeout: 30_000 });

      const row = resultsList.locator("li").filter({ hasText: curatedTitle }).first();
      await expect(row).toContainText(variant.toUpperCase());
      await expect(row.locator('[data-cta-id="cta-kw1c-open-result"]')).toBeVisible();

      // Smoke: Open the curated item and ensure the modal renders some pre-rendered content.
      if (variant === "b2" || variant === "ar") {
        await row.locator('[data-cta-id="cta-kw1c-open-result"]').click();
        await expect(page.getByRole("dialog", { name: "Curated materiaal" })).toBeVisible({ timeout: 30_000 });
        if (variant === "ar") {
          await expect(page.getByText("zorgprofessional")).toBeVisible({ timeout: 30_000 });
        } else {
          await expect(page.getByText("Casus COPD").first()).toBeVisible({ timeout: 30_000 });
        }
        await page.getByRole("button", { name: "Sluiten" }).click();
        await expect(page.getByRole("dialog", { name: "Curated materiaal" })).toBeHidden({ timeout: 30_000 });
      }
    }

    expect(enqueueCalls, "Cockpit should not enqueue jobs during curated search").toHaveLength(0);
  } catch (e) {
    primaryError = e;
  } finally {
    // Cleanup: remove seeded entity_records (best-effort; do not print secrets).
    const problems: string[] = [];

    // Cleanup Storage objects for the seeded curated packs (best-effort).
    try {
      const variantPaths: string[] = [
        `${ORGANIZATION_ID}/${curatedId}/variants/b2/${seedToken}.json`,
        `${ORGANIZATION_ID}/${curatedId}/variants/b1/${seedToken}.json`,
        `${ORGANIZATION_ID}/${curatedId}/variants/a2/${seedToken}.json`,
        `${ORGANIZATION_ID}/${curatedId}/variants/ar/${seedToken}.json`,
      ];
      for (const p of variantPaths) {
        const delObj = await request.delete(`${SUPABASE_URL}/storage/v1/object/materials/${encodeStoragePath(p)}`, {
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
          },
          timeout: 60_000,
        });
        // Storage delete returns 200-ish when it succeeds; ignore failures but record status.
        if (![200, 204].includes(delObj.status())) {
          problems.push(`delete storage materials/${p} failed: ${delObj.status()}`);
        }
      }
    } catch (err) {
      problems.push(`delete storage objects threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    const ids = [materialId, standardsId, curatedId].filter(Boolean);
    for (const id of ids) {
      try {
        const del = await request.delete(`${SUPABASE_URL}/rest/v1/entity_records?id=eq.${encodeURIComponent(id)}`, {
          headers: adminHeaders,
          timeout: 60_000,
        });
        if (![200, 204].includes(del.status())) {
          const t = await del.text().catch(() => "");
          problems.push(`delete entity_records.id=${id} failed: ${del.status()} ${t.slice(0, 240)}`);
        }
      } catch (err) {
        problems.push(`delete entity_records.id=${id} threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (problems.length) {
      cleanupError = `BLOCKED: cleanup failed for kw1c cockpit seeds: ${problems.join(" | ").slice(0, 1200)}`;
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

