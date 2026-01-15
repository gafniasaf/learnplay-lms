/**
 * KW1C teacher search evaluation pipeline (LLM expectations + LLM verification).
 * Uses real LLM providers and the deployed search-curated-materials function.
 */

import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";
import { loadLearnPlayEnv, parseLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

// Polyfill Deno for shared Edge utilities (must run before dynamic import).
if (!globalThis.Deno) {
  // @ts-ignore
  globalThis.Deno = {
    env: {
      get: (key: string) => process.env[key],
    },
  };
}

type GenerateJson = typeof import("../supabase/functions/_shared/ai.ts").generateJson;

type TestCase = {
  id: string;
  query?: string;
  filters: {
    material_type?: string;
    source?: string;
    category?: string;
    language_variant?: string;
    limit?: number;
  };
};

type SearchResult = {
  title?: string;
  course_name?: string;
  category?: string;
  preview?: string;
  material_type?: string;
  source?: string;
  mbo_level?: string;
  language_variant?: string;
  score?: number;
};

const TEST_CASES: TestCase[] = [
  { id: "zorgplicht", query: "zorgplicht", filters: { material_type: "oefening", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "privacy", query: "privacy", filters: { material_type: "oefening", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "wet-zorg-en-dwang", query: "wet zorg en dwang", filters: { material_type: "oefening", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "zorgverzekeringswet", query: "zorgverzekeringswet", filters: { material_type: "oefening", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "anatomie-fysiologie", query: "anatomie fysiologie", filters: { material_type: "theorie", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "klinisch-redeneren", query: "klinisch redeneren", filters: { material_type: "theorie", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "hygiene", query: "hygiene", filters: { material_type: "theorie", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "communicatie-client", query: "communicatie client", filters: { material_type: "oefening", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "veiligheid-incident", query: "veiligheid incident", filters: { material_type: "oefening", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "wondzorg", query: "wondzorg", filters: { material_type: "theorie", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "wetgeving", query: "wetgeving", filters: { material_type: "oefening", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "medicatie", query: "medicatie", filters: { material_type: "theorie", source: "expertcollege-mes", language_variant: "b2" } },
  { id: "wetgeving-category-filter", query: "wetgeving", filters: { material_type: "oefening", source: "expertcollege-mes", category: "Wetgeving en beleid", language_variant: "b2" } },
];

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    console.error(`❌ Missing ${name} environment variable`);
    process.exit(1);
  }
  return value;
}

function truncate(input: string | undefined, max = 260): string {
  if (!input) return "";
  return input.length > max ? `${input.slice(0, max)}…` : input;
}

function safeJsonParse(text: string, label: string): any {
  try {
    return JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} returned invalid JSON: ${message}`);
  }
}

async function buildExpectations(test: TestCase, generateJson: GenerateJson) {
  const system = [
    "You are an experienced MBO healthcare teacher.",
    "Define what you would expect to see in search results for a teacher using the KW1C cockpit.",
    "Think like a human: relevance, clarity, and usefulness matter more than strict keyword matches.",
    "Return strict JSON only.",
  ].join(" ");

  const prompt = [
    "Query context:",
    `- query: ${test.query || "(empty)"} `,
    `- filters: ${JSON.stringify(test.filters)}`,
    "",
    "Return JSON with:",
    '{ "intent_summary": string, "must_have_signals": string[], "nice_to_have_signals": string[], "avoid_signals": string[], "ideal_preview_focus": string }',
  ].join("\n");

  const resp = await generateJson({
    system,
    prompt,
    temperature: 0.4,
    maxTokens: 900,
  });

  if (!resp.ok) {
    throw new Error(`LLM(expectations) failed: ${resp.error}`);
  }

  return safeJsonParse(resp.text, "Expectations LLM");
}

async function verifyResults(
  test: TestCase,
  expectations: any,
  results: SearchResult[],
  generateJson: GenerateJson,
) {
  const system = [
    "You are a second, independent reviewer.",
    "Verify whether the actual results exceed a random teacher's expectations.",
    "Judge relevance, clarity, filter alignment, preview usefulness, and whether the top results are clearly on-topic.",
    "Be strict: pass only if it exceeds expectations, not merely acceptable.",
    "Return strict JSON only.",
  ].join(" ");

  const compactResults = results.slice(0, 5).map((r) => ({
    title: truncate(r.title, 80),
    course_name: truncate(r.course_name, 120),
    category: truncate(r.category, 140),
    preview: truncate(r.preview, 220),
    material_type: r.material_type,
    source: r.source,
    mbo_level: r.mbo_level,
  }));

  const prompt = [
    "Expectation JSON:",
    JSON.stringify(expectations),
    "",
    "Actual top results (compact):",
    JSON.stringify(compactResults),
    "",
    "Return JSON with:",
    '{ "pass": boolean, "score": number, "summary": string, "issues": string[], "suggestions": string[], "confidence": number }',
  ].join("\n");

  const resp = await generateJson({
    system,
    prompt,
    temperature: 0.2,
    maxTokens: 900,
  });

  if (!resp.ok) {
    throw new Error(`LLM(verification) failed: ${resp.error}`);
  }

  return safeJsonParse(resp.text, "Verification LLM");
}

async function searchCurated(
  supabaseUrl: string,
  headers: Record<string, string>,
  test: TestCase,
): Promise<SearchResult[]> {
  const res = await fetch(`${supabaseUrl}/functions/v1/search-curated-materials`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: test.query,
      ...test.filters,
      limit: test.filters.limit ?? 10,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`search-curated-materials failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const payload = await res.json();
  return Array.isArray(payload?.results) ? payload.results : [];
}

async function main() {
  loadLocalEnvForTests();
  loadLearnPlayEnv();
  const env = parseLearnPlayEnv();

  const supabaseUrl = requireEnv(env.SUPABASE_URL, "SUPABASE_URL");
  const anonKey = requireEnv(env.SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");
  const agentToken = requireEnv(env.AGENT_TOKEN, "AGENT_TOKEN");
  const orgId = requireEnv(env.ORGANIZATION_ID, "ORGANIZATION_ID");

  const { generateJson, getProvider, getModel } = await import("../supabase/functions/_shared/ai.ts");
  const provider = getProvider();
  if (provider === "none") {
    console.error("❌ BLOCKED: No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY (or AI_PROVIDER).");
    process.exit(1);
  }

  console.log(`LLM provider: ${provider} (${getModel()})`);
  console.log("Running KW1C LLM evaluation pipeline...\n");

  const headers = {
    "Content-Type": "application/json",
    "apikey": anonKey,
    "X-Agent-Token": agentToken,
    "X-Organization-Id": orgId,
  };

  let passCount = 0;
  let total = 0;

  for (const test of TEST_CASES) {
    total += 1;
    const results = await searchCurated(supabaseUrl, headers, test);
    const expectations = await buildExpectations(test, generateJson);
    const verdict = await verifyResults(test, expectations, results, generateJson);

    if (verdict?.pass) passCount += 1;

    console.log(`Test: ${test.id}`);
    console.log(`- Results: ${results.length}`);
    console.log(`- Pass: ${verdict?.pass ? "yes" : "no"} | Score: ${verdict?.score ?? "n/a"} | Confidence: ${verdict?.confidence ?? "n/a"}`);
    if (verdict?.summary) console.log(`- Summary: ${verdict.summary}`);
    if (Array.isArray(verdict?.issues) && verdict.issues.length) {
      console.log(`- Issues: ${verdict.issues.join(" | ")}`);
    }
    if (Array.isArray(verdict?.suggestions) && verdict.suggestions.length) {
      console.log(`- Suggestions: ${verdict.suggestions.join(" | ")}`);
    }
    console.log("");
  }

  console.log(`Overall pass rate: ${passCount}/${total}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ Pipeline failed: ${message}`);
  process.exit(1);
});
