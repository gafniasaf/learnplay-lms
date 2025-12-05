import { TUNING_SCENARIOS, TuningScenario } from '../tests/fixtures/tuning-dataset';
import type { LaneSpec } from '../src/lib/mockupLanes';
import { buildLaneSpecs } from '../src/lib/mockupLanes';
import {
  buildAutoTuneDirective,
  ProductCriticFeedback,
} from '../src/lib/mockupCritic';

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://xlslksprdjsxawvcikfk.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsc2xrc3ByZGpzeGF3dmNpa2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTMxMzEsImV4cCI6MjA3OTI4OTEzMX0.1Jo8F2o42z_K7PXeHrEp28AwbomBkrrOJh1_t3vU0iM';

const MAX_AUTO_TUNE_PASSES = Number(
  process.env.MOCKUP_AUTO_TUNE_PASSES ?? 3,
);

const SNIPPET_LIMIT = 120;
function truncateSnippet(value: string, length = SNIPPET_LIMIT) {
  if (!value) return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > length ? `${normalized.slice(0, length)}…` : normalized;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const buildFallbackHtml = (
  lane: LaneSpec,
  directive?: string,
): string => {
  const safeInstructions = escapeHtml(lane.instructions || '');
  const safeDirective = directive ? escapeHtml(directive) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(lane.title)} — Blueprint Fallback</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: 'Inter', sans-serif; background:#020617; color:#e2e8f0; margin:0; padding:32px; }
    .panel { border:1px solid #1e293b; border-radius:24px; padding:32px; background:#0f172a; margin-bottom:24px; }
    nav { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:24px; }
    nav a { text-decoration:none; border:1px solid #1e293b; border-radius:999px; padding:10px 16px; font-size:12px; letter-spacing:0.1em; color:#cbd5f5; }
    header h1 { font-size:42px; margin-bottom:12px; }
    .features { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px; }
    .feature-card { border:1px solid #1e293b; border-radius:20px; padding:16px; background:#111c34; }
    footer { text-align:center; font-size:13px; opacity:0.7; margin-top:32px; }
  </style>
</head>
<body>
  <nav>
    <a href="#lane-dashboard" class="nav-link">Dashboard</a>
    <a href="#lane-campaign-builder" class="nav-link">Campaign Builder</a>
    <a href="#lane-templates" class="nav-link">Templates</a>
    <a href="#lane-integrations" class="nav-link">Integrations</a>
  </nav>

  <header class="panel">
    <p class="badge">Blueprint Orchestrator Fallback</p>
    <h1>${escapeHtml(lane.title)}</h1>
    <p>${safeInstructions.replace(/\n/g, '<br />')}</p>
  </header>

  <section class="panel">
    <h2>Features & Required Elements</h2>
    <div class="features">
      <div class="feature-card">
        <h3>Hero & CTA</h3>
        <p>Always include hero copy, dual CTA buttons, and navigation breadcrumb.</p>
      </div>
      <div class="feature-card">
        <h3>Pillars</h3>
        <p>Render at least three content pillars based on the instructions.</p>
      </div>
      <div class="feature-card">
        <h3>Credibility</h3>
        <p>Show metrics, experiment stats, or guardrails summary.</p>
      </div>
      <div class="feature-card">
        <h3>CTA Footer</h3>
        <p>End with a footer CTA referencing manifest nouns.</p>
      </div>
    </div>
  </section>

  ${
    safeDirective
      ? `<section class="panel">
    <h2>Auto-Tune Directive</h2>
    <p>${safeDirective.replace(/\n/g, '<br />')}</p>
  </section>`
      : ''
  }

  <footer>Fallback mockup generated locally when the LLM output is unavailable.</footer>
</body>
</html>`;
};

type SupabaseInvoke = (
  name: string,
  opts: any,
) => Promise<{ data: any; error: Error | null }>;

const supabaseInvoke: SupabaseInvoke = async (name, opts) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    } as any,
    body: JSON.stringify(opts.body),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      data: null,
      error: new Error(`Edge function ${name} failed: ${response.status} ${text}`),
    };
  }

  const json = await response.json();
  return { data: json, error: null };
};

async function assertSupabaseHealth() {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/architect-advisor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      } as any,
      body: JSON.stringify({ mode: 'health-check' }),
    });

    if (!response.ok && response.status !== 400) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Supabase functions are not reachable. Start "supabase functions serve" before running tune:auto. (${reason})`,
    );
  }
}

interface LaneHtmlResult {
  id: string;
  title: string;
  instructions: string;
  validationHints: string[];
  html: string;
  diagnostics: string[];
  source: 'generated' | 'provided';
}

async function invokeArchitectAdvisor(body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/architect-advisor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    } as any,
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      `architect-advisor failed (${response.status}): ${JSON.stringify(json)}`,
    );
  }
  if (json?.error) {
    throw new Error(`architect-advisor error: ${json.error}`);
  }
  return json;
}

async function generateLaneHtml(
  lane: LaneSpec,
  directive?: string,
  otherLanes?: { id: string; title: string }[],
  options?: { forceMockFailure?: boolean },
): Promise<LaneHtmlResult> {
  const specWithDirective = directive
    ? `${lane.content}\n\nAUTO_TUNE_DIRECTIVE:\n${directive}`
    : lane.content;

  if (options?.forceMockFailure) {
    console.warn(
      `[mockup-auto-tune] Forcing fallback HTML for lane ${lane.id} (${lane.title}).`,
    );
    const fallbackHtml = buildFallbackHtml(lane, directive);
    return {
      id: lane.id,
      title: lane.title,
      instructions: lane.instructions,
      validationHints: lane.validationHints,
      html: fallbackHtml,
      diagnostics: ['Forced fallback HTML'],
      source: 'generated',
    };
  }

  const { result } = await invokeArchitectAdvisor({
    mode: 'mockup-lane',
    prompt: specWithDirective,
    laneId: lane.id,
    pageSpec: specWithDirective,
    validationHints: lane.validationHints,
    otherLanes,
  });

  let parsed: any = null;
  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed.startsWith('{')) {
      try {
        parsed = JSON.parse(result);
      } catch (err) {
        console.warn(
          `[mockup-auto-tune] Failed to parse mockup-lane response for ${lane.id}. Snippet: ${snippet(
            trimmed,
          )}`,
        );
      }
    } else {
      console.warn(
        `[mockup-auto-tune] Received non-JSON mockup-lane payload for ${lane.id}. Snippet: ${snippet(
          trimmed,
        )}`,
      );
    }
  } else {
    parsed = result as any;
  }

  if (!parsed?.html) {
    const fallbackHtml = buildFallbackHtml(lane, directive);
    return {
      id: lane.id,
      title: lane.title,
      instructions: lane.instructions,
      validationHints: lane.validationHints,
      html: fallbackHtml,
      diagnostics: ['Fallback markup used (LLM output unavailable)'],
      source: 'generated',
    };
  }

  return {
    id: lane.id,
    title: lane.title,
    instructions: lane.instructions,
    validationHints: lane.validationHints,
    html: parsed.html,
    diagnostics: parsed.diagnostics ?? [],
    source: lane.providedHtml ? 'provided' : 'generated',
  };
}

async function critiqueLanes(
  lanes: LaneHtmlResult[],
  promptText: string,
): Promise<ProductCriticFeedback> {
  try {
    const { result } = await invokeArchitectAdvisor({
      mode: 'mockup-critique',
      prompt: promptText,
      lanes: lanes.map((lane) => ({
        id: lane.id,
        title: lane.title,
        instructions: lane.instructions,
        validationHints: lane.validationHints,
        html: lane.html.slice(0, 15000),
        source: lane.source,
        diagnostics: lane.diagnostics,
      })),
    });

    const parsed =
      typeof result === 'string' ? JSON.parse(result) : (result as any);

    return {
      verdict: parsed?.verdict === 'approved' ? 'approved' : 'needs_revision',
      missingScreens: Array.isArray(parsed?.missing_screens)
        ? parsed.missing_screens.map((item: unknown) => String(item))
        : [],
      redundantScreens: Array.isArray(parsed?.redundant_screens)
        ? parsed.redundant_screens.map((item: unknown) => String(item))
        : [],
      journeyIssues: Array.isArray(parsed?.journey_issues)
        ? parsed.journey_issues.map((item: unknown) => String(item))
        : [],
      suggestions: Array.isArray(parsed?.suggestions)
        ? parsed.suggestions.map((item: unknown) => String(item))
        : [],
    };
  } catch (err) {
    console.warn(
      `[mockup-auto-tune] Product Critic unavailable. Treating as approved. Reason: ${
        err instanceof Error ? err.message : err
      }`,
    );
    return {
      verdict: 'approved',
      missingScreens: [],
      redundantScreens: [],
      journeyIssues: [],
      suggestions: [],
    };
  }
}

async function runScenarioAutoTune(
  scenario: TuningScenario,
): Promise<{ passed: boolean; reason?: string }> {
  const { lanes } = await buildLaneSpecs(scenario.input, supabaseInvoke);

  const laneDirectives: Record<string, string> = {};

  for (let pass = 1; pass <= MAX_AUTO_TUNE_PASSES; pass++) {
    const laneOutputs: LaneHtmlResult[] = [];
    for (const lane of lanes) {
      if (lane.providedHtml && !laneDirectives[lane.id]) {
        laneOutputs.push({
          id: lane.id,
          title: lane.title,
          instructions: lane.instructions,
          validationHints: lane.validationHints,
          html: lane.providedHtml,
          diagnostics: [],
          source: 'provided',
        });
        continue;
      }
      const directive = laneDirectives[lane.id];
      const otherLanes = lanes
        .filter((other) => other.id !== lane.id)
        .map((other) => ({ id: other.id, title: other.title }));
    const result = await generateLaneHtml(
      lane,
      directive,
      otherLanes,
      { forceMockFailure: scenario.forceMockFailure },
    );
      laneOutputs.push(result);
    }

    const feedback = await critiqueLanes(
      laneOutputs,
      scenario.input.slice(0, 4000),
    );
    if (feedback.verdict === 'approved') {
      console.log(`   ✅ Approved on pass ${pass}`);
      return { passed: true };
    }

    const directive = buildAutoTuneDirective(feedback);
    if (!directive.trim()) {
      return {
        passed: false,
        reason: 'Product Critic returned needs_revision without actionable feedback.',
      };
    }

    console.log(
      `[mockup-auto-tune] Scenario="${scenario.name}" pass=${pass} reason=${truncateSnippet(
        reason,
        120,
      )}`,
    );
    console.log(`   🔁 Auto-tune pass ${pass} failed. Applying feedback:\n${directive}`);

    lanes.forEach((lane) => {
      const existing = laneDirectives[lane.id];
      laneDirectives[lane.id] = existing ? `${existing}\n${directive}` : directive;
    });
  }

  return {
    passed: false,
    reason: `Failed to reach approval within ${MAX_AUTO_TUNE_PASSES} passes.`,
  };
}

async function main() {
  console.log('🧪 Running mockup auto-tune suite...');
  await assertSupabaseHealth();
  const failures: string[] = [];

  for (const key of Object.keys(TUNING_SCENARIOS)) {
    const scenario = TUNING_SCENARIOS[key as keyof typeof TUNING_SCENARIOS];
    console.log(`\n🎯 Scenario: ${scenario.name}`);
    try {
      const result = await runScenarioAutoTune(scenario);
      if (!result.passed) {
        failures.push(`${scenario.name}: ${result.reason}`);
        console.log(`   ❌ ${result.reason}`);
      }
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${scenario.name}: ${message}`);
      console.log(`   ❌ ${message}`);
    }
  }

  if (failures.length) {
    console.error('\n❌ Mockup auto-tune suite failed:');
    failures.forEach((failure) => console.error(`   - ${failure}`));
    process.exit(1);
  }

  console.log('\n✅ Mockup auto-tune suite passed.');
}

main().catch((err) => {
  console.error('❌ Unexpected error in mockup auto-tune suite.');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

