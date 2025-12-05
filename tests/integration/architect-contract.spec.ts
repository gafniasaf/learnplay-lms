import { strict as assert } from 'assert';

type TestCase = {
  mode: string;
  payload: Record<string, unknown>;
  description: string;
  validate?: (data: Record<string, any>) => void | Promise<void>;
};

const REMOTE_SUPABASE_URL = 'https://xlslksprdjsxawvcikfk.supabase.co';

const BASE_SUPABASE_URL =
  process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim().length > 0
    ? process.env.SUPABASE_URL
    : REMOTE_SUPABASE_URL;

const FUNCTION_URL =
  process.env.ARCHITECT_FUNCTION_URL ??
  `${BASE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/architect-advisor`;

const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsc2xrc3ByZGpzeGF3dmNpa2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTMxMzEsImV4cCI6MjA3OTI4OTEzMX0.1Jo8F2o42z_K7PXeHrEp28AwbomBkrrOJh1_t3vU0iM';

const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  FALLBACK_ANON_KEY;

const HEADERS = {
  'Content-Type': 'application/json',
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
};

const SAMPLE_MANIFEST = {
  system: {
    name: 'QA Contract Harness',
  },
  data_model: [
    {
      type: 'root_entity',
      name: 'Project',
      fields: [{ id: 'name', label: 'Name', type: 'text' }],
    },
  ],
};

const TEST_CASES: TestCase[] = [
  {
    mode: 'genesis',
    description: 'Genesis requires a prompt payload',
    payload: { prompt: 'Design a lightweight CRM' },
    validate: (data) => {
      assert.ok(
        typeof data.result === 'string' && data.result.length > 20,
        'Genesis response should contain markdown result text.',
      );
    },
  },
  {
    mode: 'evolution',
    description: 'Evolution references an existing manifest',
    payload: {
      prompt: 'Refactor for async jobs',
      manifest: SAMPLE_MANIFEST,
    },
    validate: (data) => {
      assert.ok(
        typeof data.result === 'string',
        'Evolution response should contain markdown result text.',
      );
    },
  },
  {
    mode: 'consult',
    description: 'Consult mode depends on explicit messages array',
    payload: {
      messages: [{ role: 'user', content: 'How can we improve onboarding?' }],
      context: SAMPLE_MANIFEST,
    },
    validate: (data) => {
      assert.ok(
        typeof data.result === 'string',
        'Consult response should contain assistant text.',
      );
    },
  },
  {
    mode: 'decode',
    description: 'Decode must emit strict JSON string',
    payload: {
      prompt:
        'System Requirements:\n- Build a Teacher Dashboard\n- Include async jobs for score aggregation.',
    },
    validate: (data) => {
      assert.ok(typeof data.result === 'string', 'Decode must return string payload.');
      JSON.parse(data.result);
    },
  },
  {
    mode: 'mockup-lane',
    description: 'Mockup lanes require prompt + lane metadata',
    payload: {
      prompt:
        '## Teacher Dashboard\nShow hero, stats, assignments list.\n## Student Dashboard\nShow streaks and tasks.',
      laneId: 'teacher',
      pageSpec: 'Teacher Dashboard with hero, stats grid, assignments.',
      validationHints: ['Hero', 'Stats Grid', 'Assignments'],
    },
    validate: (data) => {
      assert.ok(
        typeof data.result === 'string',
        'Mockup lane should return serialized JSON string.',
      );
    },
  },
];

async function testMode(testCase: TestCase) {
  console.log(`🎯 Testing Architect Mode [${testCase.mode}] — ${testCase.description}`);

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: HEADERS as Record<string, string>,
    body: JSON.stringify({
      mode: testCase.mode,
      ...testCase.payload,
    }),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `❌ Architect mode [${testCase.mode}] failed: HTTP ${response.status} – ${raw}`,
    );
  }

  let data: Record<string, any>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `❌ Architect mode [${testCase.mode}] returned non-JSON response:\n${raw}`,
    );
  }

  assert.ok(
    typeof data === 'object' && data !== null,
    `Architect mode [${testCase.mode}] should return an object.`,
  );

  if (testCase.validate) {
    await testCase.validate(data);
  } else {
    const hasResult = typeof data.result === 'string';
    const hasSteps = Array.isArray(data.steps);
    assert.ok(
      hasResult || hasSteps,
      `Architect mode [${testCase.mode}] expected result or steps.`,
    );
  }

  console.log(`✅ Architect mode [${testCase.mode}] passed.`);
}

async function run() {
  for (const testCase of TEST_CASES) {
    await testMode(testCase);
  }
  console.log('\n🎉 ALL ARCHITECT CONTRACTS VALID.');
}

run().catch((err) => {
  console.error('\n❌ Architect contract tests failed.');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

