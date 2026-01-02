import { test, expect } from "@playwright/test";
import { loadLearnPlayEnv } from "../helpers/parse-learnplay-env";

// Load local-only env files into process.env for live E2E runs.
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

test("live: Expertcollege exercise generation editor generates + edits + saves exercises (real DB + real LLM)", async ({ page, request }) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || requireEnv("SUPABASE_URL");
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || requireEnv("SUPABASE_ANON_KEY");
  const AGENT_TOKEN = requireEnv("AGENT_TOKEN");
  const ORGANIZATION_ID = requireEnv("ORGANIZATION_ID");

  const courseId = `e2e-ecgen-${Date.now()}`;
  const title = `E2E ECGen ${new Date().toISOString().slice(0, 19)}`;

  // Seed a playable course with study texts.
  const seedCourseEnvelope = {
    id: courseId,
    format: "practice",
    version: 1,
    content: {
      id: courseId,
      title,
      subject: "E2E Expertcollege",
      gradeBand: "HBO",
      visibility: "org",
      organization_id: ORGANIZATION_ID,
      contentVersion: new Date().toISOString(),
      studyTexts: [
        {
          id: "st-1",
          title: "Menstruatiestoornissen (kort)",
          order: 1,
          content:
            "Menstruatiestoornissen kunnen zich uiten als amenorroe (uitblijven van de menstruatie) of menorragie (hevige bloedingen). " +
            "Bij anovulatie blijft de eisprong uit, waardoor progesteron laag blijft. Progesteron stabiliseert het endometrium; " +
            "zonder progesteron kan onregelmatig bloedverlies ontstaan. Behandeling kan bestaan uit leefstijladvies, hormonale therapie of verwijzing.",
        },
        {
          id: "st-2",
          title: "Hormonen (kort)",
          order: 2,
          content:
            "Oestrogeen stimuleert de opbouw van het endometrium. Progesteron zorgt daarna voor secretiefase en stabilisatie. " +
            "Bij een hormonale disbalans kunnen klachten ontstaan zoals onregelmatig bloedverlies of uitblijven van de menstruatie.",
        },
      ],
      groups: [{ id: 1, name: "Seed Group" }],
      levels: [{ id: 1, title: "All Content", start: 1, end: 1 }],
      items: [
        {
          id: 1,
          groupId: 1,
          text: "<p>Wat is de functie van progesteron in de cyclus?</p>",
          explain: "",
          clusterId: "seed",
          variant: "1",
          mode: "options",
          options: ["Stabiliseren van het endometrium", "Vorming van hemoglobine", "Verlagen van bloeddruk"],
          correctIndex: 0,
        },
      ],
    },
  };

  const saveResp = await request.post(`${SUPABASE_URL}/functions/v1/save-course`, {
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": AGENT_TOKEN,
      // Mirror frontend behavior (not required by save-course but safe)
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      "x-organization-id": ORGANIZATION_ID,
    },
    data: seedCourseEnvelope,
    timeout: 60_000,
  });
  const saveJson = (await saveResp.json().catch(() => null)) as any;
  expect(saveResp.ok()).toBeTruthy();
  expect(saveJson?.ok).toBe(true);

  // Ensure course appears in catalog (org-scoped) so the selector page can find it.
  await poll({
    name: "course appears in list-courses",
    timeoutMs: 60_000,
    intervalMs: 1500,
    fn: async () => {
      const r = await request.get(`${SUPABASE_URL}/functions/v1/list-courses?search=${encodeURIComponent(courseId)}&limit=20`, {
        headers: {
          "x-agent-token": AGENT_TOKEN,
          "x-organization-id": ORGANIZATION_ID,
        },
        timeout: 60_000,
      });
      if (!r.ok()) return null;
      const j = (await r.json().catch(() => null)) as any;
      const items = Array.isArray(j?.items) ? j.items : [];
      const found = items.find((x: any) => String(x?.id) === courseId);
      return found ? found : null;
    },
  });

  // E2E courses are intentionally hidden from user-facing selectors (to keep the UI clean).
  // Navigate directly to the editor for this course.
  await page.goto(`/admin/expertcollege-exercise-generation/${encodeURIComponent(courseId)}`);
  await expect(page).toHaveURL(
    new RegExp(`/admin/expertcollege-exercise-generation/${courseId.replace(/[-/\\.^$*+?()[\]{}|]/g, "\\$&")}$`),
    { timeout: 60_000 }
  );
  await page.locator('[data-cta-id="cta-ecgen-start"]').waitFor({ state: "visible", timeout: 60_000 });

  // Start generation (single study text)
  await page.locator('[data-cta-id="cta-ecgen-start"]').click();
  await expect(page.getByText("Generation progress")).toBeVisible({ timeout: 60_000 });

  // Extract jobId from the progress list
  const jobLine = page.locator("text=/jobId:\\s*[0-9a-f-]{36}/i").first();
  await jobLine.waitFor({ state: "visible", timeout: 60_000 });
  const jobText = (await jobLine.textContent()) || "";
  const jobIdMatch = jobText.match(/jobId:\s*([0-9a-f-]{36})/i);
  expect(jobIdMatch?.[1]).toBeTruthy();
  const jobId = String(jobIdMatch?.[1]);

  // Drive the worker with agent token so the async job completes (real LLM calls happen in Edge)
  const procResp = await request.get(
    `${SUPABASE_URL}/functions/v1/process-pending-jobs?jobId=${encodeURIComponent(jobId)}&mediaN=0`,
    { headers: { "x-agent-token": AGENT_TOKEN }, timeout: 10 * 60_000 }
  );
  if (!procResp.ok()) {
    const bodyText = await procResp.text().catch(() => "");
    throw new Error(`process-pending-jobs failed (HTTP ${procResp.status()}): ${bodyText.slice(0, 800)}`);
  }
  const procJson = (await procResp.json().catch(() => null)) as any;
  expect(procJson?.ok).toBe(true);

  // Wait for review state in UI
  await expect(page.getByText("Review generated exercises")).toBeVisible({ timeout: 6 * 60_000 });

  // Expand first generated item
  await page.locator('[data-cta-id^="cta-ecgen-item-toggle-"]').first().click();
  await expect(page.getByText("Stem")).toBeVisible({ timeout: 30_000 });

  // AI rewrite a distractor option (uses ai-rewrite-text)
  await page.locator('[data-cta-id^="cta-ecgen-option-ai-rewrite-"]').first().click();
  await page.getByText("AI rewrite applied").waitFor({ timeout: 3 * 60_000 });

  // AI image for an option (uses ai-generate-media)
  await page.locator('[data-cta-id^="cta-ecgen-option-ai-image-"]').first().click();
  await page.getByText("Option image added").waitFor({ timeout: 6 * 60_000 });

  // Save selected exercises into the target course
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.locator('[data-cta-id="cta-ecgen-save-to-course"]').click();
  await page.getByText(/Saved \d+ exercise\(s\) to course/i).waitFor({ timeout: 2 * 60_000 });

  // Verify persisted course.json contains the new group and items with relatedStudyTextIds and optionMedia
  const finalCourse = await poll<any>({
    name: "course.json updated with Expertcollege Generated items",
    timeoutMs: 3 * 60_000,
    intervalMs: 2000,
    fn: async () => {
      const url = `${SUPABASE_URL}/storage/v1/object/public/courses/${encodeURIComponent(courseId)}/course.json?cb=${Date.now()}`;
      const r = await request.get(url, { headers: { "Cache-Control": "no-cache" } });
      if (!r.ok()) return null;
      const j = await r.json().catch(() => null);
      if (!j) return null;
      const content = j && typeof j === "object" && "content" in j && "format" in j ? (j as any).content : j;
      const groups = Array.isArray(content?.groups) ? content.groups : [];
      const items = Array.isArray(content?.items) ? content.items : [];
      const g = groups.find((x: any) => String(x?.name) === "Expertcollege Generated");
      if (!g) return null;
      const gid = Number(g.id);
      const added = items.filter((it: any) => Number(it?.groupId) === gid);
      if (added.length < 1) return null;
      return content;
    },
  });

  const finalGroups = Array.isArray(finalCourse?.groups) ? finalCourse.groups : [];
  const finalItems = Array.isArray(finalCourse?.items) ? finalCourse.items : [];
  const g = finalGroups.find((x: any) => String(x?.name) === "Expertcollege Generated");
  expect(g).toBeTruthy();
  const gid = Number(g.id);
  const addedItems = finalItems.filter((it: any) => Number(it?.groupId) === gid);
  expect(addedItems.length).toBeGreaterThanOrEqual(1);
  expect(addedItems.some((it: any) => Array.isArray(it?.relatedStudyTextIds) && it.relatedStudyTextIds.length >= 1)).toBe(true);
  expect(
    addedItems.some(
      (it: any) =>
        Array.isArray(it?.optionMedia) &&
        it.optionMedia.some((m: any) => m && typeof m === "object" && typeof m.url === "string" && m.url.startsWith("http"))
    )
  ).toBe(true);
});


