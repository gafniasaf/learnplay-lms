import 'dotenv/config';

const MCP = process.env.MCP_URL || 'http://127.0.0.1:4000';
const TOKEN = process.env.MCP_AUTH_TOKEN || '';

async function call(method, params = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ method, params }),
  });
  return res.json();
}

(async () => {
  console.log('🔍 Running MCP Diagnostic...\n');
  if (!TOKEN) {
    console.log('Missing MCP_AUTH_TOKEN. Exiting.');
    process.exit(1);
  }

  try {
    const health = await call('lms.health');
    console.log('Health:', health);

    const jobs = await call('lms.listJobs', { limit: 5 });
    console.log('\nJobs:', jobs);

    const failed = jobs.jobs?.filter(j => j.status === 'failed') || [];
    if (failed.length) {
      console.log('\n❗ FAILED JOBS DETECTED');
      for (const f of failed) {
        const details = await call('lms.getJob', { jobId: f.id });
        console.log('\nJob:', details);
        const logs = await call('lms.logs', { jobId: f.id });
        console.log('Logs:', logs);
      }
    }
    console.log('\n✅ Diagnostics complete.');
  } catch (e) {
    console.error('Diagnostic error:', e);
    process.exit(1);
  }
})();


