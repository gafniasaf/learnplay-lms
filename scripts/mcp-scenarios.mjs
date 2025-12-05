const BASE_URL = process.env.MCP_BASE_URL || 'http://127.0.0.1:4000';
const TOKEN = process.env.MCP_AUTH_TOKEN || 'dev-local-secret';

async function call(method, params = {}) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function run() {
  const courseId = process.env.E2E_DEMO_COURSE_ID || undefined;
  const results = [];

  // Publish (if courseId provided)
  if (courseId) {
    try {
      const pub = await call('lms.publishCourse', { courseId, changelog: 'scenario' });
      results.push({ scenario: 'publish', ok: true, data: pub });
    } catch (e) {
      results.push({ scenario: 'publish', ok: false, error: String(e?.message || e) });
    }
  } else {
    results.push({ scenario: 'publish', ok: true, skipped: true });
  }

  // Variants audit
  if (courseId) {
    try {
      const va = await call('lms.variantsAudit', { courseId });
      results.push({ scenario: 'variantsAudit', ok: true, data: va });
    } catch (e) {
      results.push({ scenario: 'variantsAudit', ok: false, error: String(e?.message || e) });
    }
  } else {
    results.push({ scenario: 'variantsAudit', ok: true, skipped: true });
  }

  // Localize (smoke)
  if (courseId) {
    try {
      const loc = await call('lms.localize', { courseId });
      results.push({ scenario: 'localize', ok: true, data: loc });
    } catch (e) {
      results.push({ scenario: 'localize', ok: false, error: String(e?.message || e) });
    }
  } else {
    results.push({ scenario: 'localize', ok: true, skipped: true });
  }

  // Media enqueue (smoke)
  try {
    const media = await call('lms.enqueueMedia', { courseId: courseId || 'demo', itemId: 1, prompt: 'demo prompt' });
    results.push({ scenario: 'enqueueMedia', ok: true, data: media });
  } catch (e) {
    results.push({ scenario: 'enqueueMedia', ok: false, error: String(e?.message || e) });
  }

  const ok = results.every(r => r.ok);
  console.log(JSON.stringify({ ok, results }, null, 2));
  process.exit(ok ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });


