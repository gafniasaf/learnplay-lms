import { TUNING_SCENARIOS, TuningScenario } from '../tests/fixtures/tuning-dataset';
import type { LaneSpec } from '../src/lib/mockupLanes';

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://xlslksprdjsxawvcikfk.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsc2xrc3ByZGpzeGF3dmNpa2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTMxMzEsImV4cCI6MjA3OTI4OTEzMX0.1Jo8F2o42z_K7PXeHrEp28AwbomBkrrOJh1_t3vU0iM';

type SupabaseInvoke = (name: string, opts: any) => Promise<any>;

async function mockSupabaseInvoke(name: string, opts: any): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(opts.body),
  });

  if (!response.ok) {
    const text = await response.text();
    return { data: null, error: new Error(`Edge function ${name} failed: ${response.status} ${text}`) };
  }

  const json = await response.json();
  return { data: json, error: null };
}

const forceDocumentationInvoke: SupabaseInvoke = async (name, opts) => {
  if (name === 'architect-advisor' && opts?.body?.mode === 'analyze-document') {
    const sections = Array.isArray(opts.body?.sections) ? opts.body.sections : [];
    const forced = {
      sections: sections.map((section: any) => ({
        heading: section.heading,
        type: 'documentation',
        reason: 'Forced documentation for fallback test',
      })),
    };
    return {
      data: { result: JSON.stringify(forced) },
      error: null,
    };
  }

  return mockSupabaseInvoke(name, opts);
};

async function runScenario(
  scenario: TuningScenario,
): Promise<{ passed: boolean; errors: string[] }> {
  console.log(`\n🎯 Testing: ${scenario.name}`);
  const errors: string[] = [];

  try {
    const { buildLaneSpecs } = await import('../src/lib/mockupLanes');
    const supabaseInvoke: SupabaseInvoke =
      scenario.invokeMode === 'forceDocumentation' ? forceDocumentationInvoke : mockSupabaseInvoke;
    const result = await buildLaneSpecs(scenario.input, supabaseInvoke);
    const lanes: LaneSpec[] = result.lanes;
    const diagnostics = result.diagnostics;

    const providedLanes = lanes.filter((l) => l.providedHtml);
    const generatedLanes = lanes.filter((l) => !l.providedHtml);

    console.log(
      `   Lanes detected: ${lanes.length} (${providedLanes.length} provided, ${generatedLanes.length} generated)`,
    );
    if (diagnostics?.truncatedCount || diagnostics?.skippedHeadings?.length) {
      console.log(
        `   Diagnostics: truncated=${diagnostics.truncatedCount} skipped=${diagnostics.skippedHeadings.length}`,
      );
    }

    if (lanes.length < scenario.expectations.minLanes) {
      errors.push(
        `Expected at least ${scenario.expectations.minLanes} lanes, got ${lanes.length}`,
      );
    }

    if (lanes.length > scenario.expectations.maxLanes) {
      errors.push(
        `Expected at most ${scenario.expectations.maxLanes} lanes, got ${lanes.length}`,
      );
    }

    if (providedLanes.length !== scenario.expectations.providedCount) {
      errors.push(
        `Expected ${scenario.expectations.providedCount} provided lanes, got ${providedLanes.length}`,
      );
    }

    if (
      scenario.expectations.generatedCount === 'all' &&
      generatedLanes.length !== lanes.length
    ) {
      errors.push(
        `Expected all lanes to be generated, but ${providedLanes.length} were provided`,
      );
    } else if (
      typeof scenario.expectations.generatedCount === 'number' &&
      generatedLanes.length !== scenario.expectations.generatedCount
    ) {
      errors.push(
        `Expected ${scenario.expectations.generatedCount} generated lanes, got ${generatedLanes.length}`,
      );
    }

    if (scenario.expectations.forbiddenTitles) {
      scenario.expectations.forbiddenTitles.forEach((forbidden) => {
        const found = lanes.find((l) =>
          l.title.toLowerCase().includes(forbidden.toLowerCase()),
        );
        if (found) {
          errors.push(
            `Forbidden title detected: "${found.title}" (should not include "${forbidden}")`,
          );
        }
      });
    }

    if (scenario.expectations.requiredTitles) {
      scenario.expectations.requiredTitles.forEach((required) => {
        const found = lanes.find((l) =>
          l.title.toLowerCase().includes(required.toLowerCase()),
        );
        if (!found) {
          errors.push(`Required title missing: "${required}"`);
        }
      });
    }

    if (scenario.expectations.requiredKeywords) {
      scenario.expectations.requiredKeywords.forEach((keyword) => {
        const found = lanes.find((l) =>
          l.title.toLowerCase().includes(keyword.toLowerCase()),
        );
        if (!found) {
          errors.push(`Required keyword missing in titles: "${keyword}"`);
        }
      });
    }

    if (errors.length === 0) {
      console.log(`   ✅ PASSED`);
      return { passed: true, errors: [] };
    } else {
      console.log(`   ❌ FAILED`);
      errors.forEach((err) => console.log(`      - ${err}`));
      return { passed: false, errors };
    }
  } catch (err: any) {
    console.log(`   ❌ EXCEPTION: ${err.message}`);
    return { passed: false, errors: [err.message] };
  }
}

async function main() {
  console.log('🧪 Architect Tuning Suite starting...\n');

  const results = await Promise.all([
    runScenario(TUNING_SCENARIOS.purist),
    runScenario(TUNING_SCENARIOS.designer),
    runScenario(TUNING_SCENARIOS.hybrid),
    runScenario(TUNING_SCENARIOS.messyPaste),
    runScenario(TUNING_SCENARIOS.marathon),
    runScenario(TUNING_SCENARIOS.fallbackGuard),
  ]);

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log(`\n📊 Results: ${passed}/${total} scenarios passed.`);

  if (passed === total) {
    console.log('🎉 Architect Tuning Suite passed.\n');
    process.exit(0);
  } else {
    console.log('❌ Architect Tuning Suite failed. Review errors above.\n');
    process.exit(1);
  }
}

main();

