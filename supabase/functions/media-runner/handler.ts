export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pickPending = (globalThis as any).__pickPendingJob__ as undefined | (() => Promise<any | null>);
  const generateImage = (globalThis as any).__generateImage__ as undefined | ((p: { prompt: string, provider: string }) => Promise<Uint8Array>);
  const uploadFile = (globalThis as any).__uploadFile__ as undefined | ((args: { courseId: string, itemId: number, bytes: Uint8Array }) => Promise<string>);
  const updateJob = (globalThis as any).__updateJob__ as undefined | ((id: string, status: string, url?: string, error?: string) => Promise<void>);

  if (!pickPending) {
    return new Response(JSON.stringify({ error: 'Not Implemented' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  const job = await pickPending();
  if (!job) {
    return new Response(JSON.stringify({ ok: true, processed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!generateImage || !uploadFile || !updateJob) {
    return new Response(JSON.stringify({ error: 'Not Implemented' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const bytes = await generateImage({ prompt: job.prompt, provider: job.provider || 'openai' });
    const url = await uploadFile({ courseId: job.course_id, itemId: job.item_id, bytes });
    await updateJob(job.id, 'done', url);
  } catch (e: any) {
    await updateJob(job.id, 'failed', undefined, e?.message || 'error');
  }
  processed += 1;

  return new Response(JSON.stringify({ ok: true, processed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}


