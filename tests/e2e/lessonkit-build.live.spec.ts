import { test, expect } from '@playwright/test';
import { loadLearnPlayEnv } from '../helpers/parse-learnplay-env';
import { loadLocalEnvForTests } from '../helpers/load-local-env';

// Attempt to auto-resolve required env vars from local env files (supabase/.deploy.env, learnplay.env), without printing secrets.
loadLocalEnvForTests();
loadLearnPlayEnv();

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ${name} is REQUIRED - set env var before running tests`);
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

test.describe('Live: lessonkit_build (real DB + real LLM)', () => {
  test('enqueues, runs worker, persists lesson-kit record', async ({ request }) => {
    const supabaseUrl = requireEnvVar('VITE_SUPABASE_URL');
    const agentToken = requireEnvVar('AGENT_TOKEN');
    const organizationId = requireEnvVar('ORGANIZATION_ID');

    const moduleId = `e2e:lessonkit:${Date.now()}`;
    const htmlContent = `
      <h1>Hypertensie: basisbegrippen</h1>
      <p>
        Hypertensie is een veelvoorkomende aandoening waarbij de bloeddruk chronisch verhoogd is. In deze les behandelen we
        definities, risicofactoren, meetmethoden en praktische aandachtspunten voor zorgprofessionals. We leggen uit waarom
        correcte meting belangrijk is en hoe je variatie in metingen kunt interpreteren. We bespreken ook lifestyle interventies,
        medicatieoverwegingen, en hoe je met patiënten communiceert over het belang van therapietrouw. Dit document bevat genoeg
        context om een gestructureerde les te bouwen, inclusief een docentenscript en reflectievragen.
      </p>

      <h2>Definitie</h2>
      <p>
        Hypertensie is een bloeddrukwaarde die herhaaldelijk boven de afgesproken drempel ligt. Het is belangrijk om meerdere
        metingen te doen, in rust, met een passende manchet, en bij voorkeur op verschillende momenten. Let op: een enkele meting
        is geen diagnose.
      </p>

      <h2>Risicofactoren</h2>
      <p>
        Risicofactoren zijn onder andere leeftijd, genetische aanleg, overgewicht, zoutinname, stress en onvoldoende beweging.
        Belangrijk: bespreek risicofactoren altijd zonder te oordelen, en werk samen met de patiënt aan haalbare stappen.
      </p>

      <h2>Meting in stappen</h2>
      <ol>
        <li>Laat de patiënt 5 minuten zitten in rust.</li>
        <li>Gebruik de juiste manchetmaat.</li>
        <li>Meet tweemaal en neem het gemiddelde.</li>
      </ol>
    `.trim();

    // 1) Enqueue async job (factory pipeline)
    const enqueueResp = await request.post(`${supabaseUrl}/functions/v1/enqueue-job`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Token': agentToken,
        'X-Organization-Id': organizationId,
      },
      data: {
        jobType: 'lessonkit_build',
        payload: {
          module_id: moduleId,
          html_content: htmlContent,
          protocol: 'theory',
          auto_repair: true,
          locale: 'nl-NL',
          title: 'E2E Lesson Kit',
        },
      },
    });
    expect(enqueueResp.ok()).toBeTruthy();
    const enqueueJson: any = await enqueueResp.json();
    if (enqueueJson?.ok !== true) {
      throw new Error(`enqueue-job returned ok=false: ${JSON.stringify(enqueueJson).slice(0, 800)}`);
    }
    const jobId = String(enqueueJson.jobId || '');
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/i);

    // 2) Kick the worker until this job is done (bounded)
    const MAX_ATTEMPTS = 3;
    let finalStatus = '';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Run one worker tick (picks next pending job; may not be ours if other jobs exist)
      const workerResp = await request.post(
        `${supabaseUrl}/functions/v1/ai-job-runner?worker=1&queue=agent&jobId=${encodeURIComponent(jobId)}`,
        {
        timeout: 240_000,
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
          'X-Organization-Id': organizationId,
        },
        data: { worker: true, queue: 'agent', jobId },
      });
      // Worker endpoint should respond (even if it found no jobs)
      expect(workerResp.ok()).toBeTruthy();

      // Poll job status
      const jobResp = await request.get(
        `${supabaseUrl}/functions/v1/get-job?id=${encodeURIComponent(jobId)}&eventsLimit=200`,
        {
          headers: {
            'X-Agent-Token': agentToken,
            'X-Organization-Id': organizationId,
          },
        }
      );
      expect(jobResp.ok()).toBeTruthy();
      const jobJson: any = await jobResp.json();
      expect(jobJson.ok).toBe(true);
      finalStatus = String(jobJson.job?.status || '').toLowerCase();

      if (finalStatus === 'done') {
        // Verify events include completion signal
        const ev: any[] = Array.isArray(jobJson.events) ? jobJson.events : [];
        expect(ev.length).toBeGreaterThan(0);
        expect(ev.some((e) => String(e?.step || '').toLowerCase() === 'done')).toBeTruthy();
        break;
      }
      if (finalStatus === 'failed' || finalStatus === 'dead_letter' || finalStatus === 'stale') {
        const err = String(jobJson.job?.error || 'job failed');
        throw new Error(`lessonkit_build job failed (status=${finalStatus}): ${err}`);
      }

      await sleep(2000);
    }

    expect(finalStatus).toBe('done');

    // 3) Verify persisted lesson-kit record exists (id == jobId)
    const recordResp = await request.get(
      `${supabaseUrl}/functions/v1/get-record?entity=${encodeURIComponent('lesson-kit')}&id=${encodeURIComponent(jobId)}`,
      {
        headers: {
          'X-Agent-Token': agentToken,
          'X-Organization-Id': organizationId,
        },
      }
    );
    expect(recordResp.ok()).toBeTruthy();
    const recordJson: any = await recordResp.json();
    expect(String(recordJson.status)).toMatch(/^(ready|draft)$/);
    expect(recordJson.kit).toBeTruthy();
    expect(String(recordJson.kit?.protocolUsed || '')).toBe('theory');
    expect(String(recordJson.kit?.groundTruthHash || '')).toBeTruthy();
  });
});


