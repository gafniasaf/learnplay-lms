import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

interface TestCase {
  id: string;
  description: string;
  prompt: string;
  expect: RegExp[];
  validator?: (parsed: any) => void;
  retries?: number;
  retryOn?: RegExp;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://xlslksprdjsxawvcikfk.supabase.co';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsc2xrc3ByZGpzeGF3dmNpa2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MTMxMzEsImV4cCI6MjA3OTI4OTEzMX0.1Jo8F2o42z_K7PXeHrEp28AwbomBkrrOJh1_t3vU0iM';

const TEST_CASES: TestCase[] = [
  {
    id: 'bulk-sql',
    description: 'Reject bulk SQL + enforce micro-batch',
    prompt:
      'I want to run bulk SQL updates (1M rows) every minute from the UI. Give me SQL passthrough tools.',
    expect: [/micro-batch/i, /sidecar/i, /strategy/i],
  },
  {
    id: 'real-time-chat',
    description: 'Real-time chat should pivot to polling/async jobs',
    prompt:
      'Build a realtime chat like Discord with millisecond sync and optimistic updates.',
    expect: [/(background job|job queue|dispatch queue|event stream)/i, /async/i, /strategy/i],
    retries: 2,
    retryOn: /strategy/i,
  },
  {
    id: 'simple-crud',
    description: 'Basic CRUD should still produce manifest-driven plan',
    prompt:
      'I need a simple CRM: Companies, Contacts, Deals. Support pipeline board + email templates.',
    expect: [/manifest/i],
    retries: 3,
    retryOn: /Strategy step/i,
    validator: (parsed) => {
      if (!Array.isArray(parsed?.steps)) {
        throw new Error('Validator: decode output missing steps array');
      }
      const hasStrategy = parsed.steps.some((step: any) => {
        if (!step) return false;
        const title =
          typeof step.title === 'string' ? step.title.toLowerCase() : '';
        const prompt = String(step.cursor_prompt ?? '').toLowerCase();
        return (
          title.startsWith('strategy:') ||
          prompt.includes("strategies/")
        );
      });
      if (!hasStrategy) {
        throw new Error('Validator: simple-crud plan missing Strategy step');
      }
    },
  },
  {
    id: 'formula',
    description: 'Ensure formulas are copied verbatim',
    prompt:
      'Risk engine: Score = (Sharpe Ratio + Win Rate) / Drawdown. If score < 0.5, send alert.',
    expect: [/Sharpe/i, /\(Sharpe Ratio \+ Win Rate\) \/ Drawdown/, /alert/i],
  },
  {
    id: 'terminology',
    description: 'Custom nouns should appear in prompts',
    prompt:
      'Our LMS calls students "Cadets" and courses "Holocrons". Build a planner for Holocron creation.',
    expect: [/Cadet/i, /Holocron/i],
  },
  {
    id: 'ai-capabilities',
    description: 'Type B platforms still emit AI strategy steps',
    prompt:
      'EduPlay LMS needs AI workflows: generate assignments per student, remediate weak topics, and score mastery after each lesson.',
    expect: [/Strategy:/i],
    validator: (parsed) => {
      if (!Array.isArray(parsed?.steps)) {
        throw new Error('Validator: decode output missing steps array');
      }
      const strategySteps = parsed.steps.filter((step: any) => {
        if (!step) return false;
        const title =
          typeof step.title === 'string' ? step.title.toLowerCase() : '';
        const prompt = String(step.cursor_prompt ?? '').toLowerCase();
        return (
          title.startsWith('strategy:') || prompt.includes('strategies/')
        );
      });
      if (strategySteps.length < 3) {
        throw new Error('Validator: AI plan missing dedicated strategies');
      }
    },
  },
];

async function runTest(test: TestCase) {
  const attempts = test.retries ?? 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/architect-advisor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON_KEY,
            Authorization: `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({
            mode: 'decode',
            prompt: test.prompt,
            manifest: {},
          }),
        },
      );

      const json: any = await response.json();
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}: ${json?.error || response.statusText}`,
        );
      }
      const raw = json?.result ?? '';
      const output = typeof raw === 'string' ? raw : JSON.stringify(raw);

      const missing = test.expect.filter((regex) => !regex.test(output));
      if (missing.length > 0) {
        writeArtifact(test.id, raw);
        throw new Error(
          `Missing keywords ${missing.map((r) => r.toString()).join(', ')}`,
        );
      }

      if (typeof test.validator === 'function') {
        let parsed: any;
        try {
          parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch {
          writeArtifact(test.id, raw);
          throw new Error('Validator failed: output is not valid JSON');
        }
        try {
          test.validator(parsed);
        } catch (err: any) {
          writeArtifact(test.id, raw);
          throw err;
        }
      }

      console.log(`✅ [${test.id}] ${test.description}`);
      return;
    } catch (error: any) {
      const message = error?.message || String(error);
      const shouldRetry =
        attempt < attempts && test.retryOn?.test(message ?? '');
      if (shouldRetry) {
        console.warn(
          `⚠️  [${test.id}] Attempt ${attempt} failed ("${message}"). Retrying...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw error;
    }
  }
}

async function main() {
  console.log('🧪 Architect Crucible starting...');
  const failures: { id: string; error: string }[] = [];

  for (const test of TEST_CASES) {
    try {
      await runTest(test);
    } catch (err: any) {
      failures.push({ id: test.id, error: err?.message || String(err) });
      console.error(`❌ [${test.id}] ${test.description}\n   ↳ ${err}`);
    }
  }

  if (failures.length > 0) {
    console.error('\nCrucible failed:');
    failures.forEach((f) =>
      console.error(` - ${f.id}: ${f.error}`),
    );
    process.exit(1);
  }

  console.log('🎉 Architect Crucible passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

function writeArtifact(id: string, raw: any) {
  const artifactsDir = path.join('artifacts', 'architect-crucible');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(
    path.join(artifactsDir, `${id}.json`),
    typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2),
  );
}

