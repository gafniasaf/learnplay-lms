export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Agent token check
  const provided = (req.headers as any)?.get?.('X-Agent-Token') || (req as any).headers?.get?.('X-Agent-Token') || (req as any).headers?.get?.('x-agent-token');
  const expected = Deno.env.get("AGENT_TOKEN") || '';
  if (!provided || provided !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate body
  let body: any;
  try {
    body = await (req as any).json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { courseId, itemId, prompt } = body || {};
  if (!courseId || typeof courseId !== 'string' || typeof itemId !== 'number' || !prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test path: allow injected provider for Node
  const injected = (globalThis as any).__imageProvider__ as undefined | ((p: any) => Promise<any[]>);
  if (!(globalThis as any).Deno && injected) {
    const attachments = await injected(body);
    return new Response(JSON.stringify({ ok: true, attachments }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Deno runtime: not implemented yet (use media-runner path)
  return new Response(JSON.stringify({ error: "Not Implemented" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
}


