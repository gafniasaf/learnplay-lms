import { randomUUID } from 'node:crypto';

type HttpMethod = 'GET' | 'POST';

export interface FetchOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
	// Optional response validator (Zod schema). If provided and validation fails, this returns ok=false with contract drift details.
	validator?: any;
}

export async function fetchJson<T = any>(url: string, opts: FetchOptions = {}): Promise<{ ok: boolean; status: number; json?: T; text?: string; requestId: string; }> {
  const method = opts.method || 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  const requestId = (headers['X-Request-Id'] ||= randomUUID());
  // Propagate trace id (align with request id if not provided)
  const traceId = (headers['X-Trace-Id'] ||= requestId);
  const timeoutMs = opts.timeoutMs ?? 15000;
  const retries = opts.retries ?? 2;
  const traceEnabled = process.env.MCP_TRACE === '1' || !!process.env.TRACE_DIR;
  const traceDir = process.env.TRACE_DIR || 'traces';

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  const doFetch = async (): Promise<Response> => {
    return fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
      signal: controller.signal,
    });
  };

  let lastErr: any;
  try {
		let attempt = 0;
    while (attempt <= retries) {
      try {
        const res = await doFetch();
        clearTimeout(t);
				const json = await safeJson(res);
        if (traceEnabled) {
          try {
            await writeTrace({ url, method, requestId, headers, body: opts.body, status: res.status, json });
          } catch {}
        }
        try {
          const { metricsStore } = await import('./metrics/store.js');
          metricsStore.record({ ts: Date.now(), method, status: res.status, durationMs: Date.now() - startedAt });
        } catch {}
				// Contract Drift Detection (optional)
				if (opts.validator && json && res.ok) {
					try {
						const schema: any = opts.validator as any;
						const parsed = typeof schema?.safeParse === 'function' ? schema.safeParse(json) : { success: true };
						if (!parsed.success) {
							const details = parsed.error.flatten();
							return {
								ok: false,
								status: 500,
								json: undefined,
								text: `MCP_CONTRACT_DRIFT: Response failed validation`,
								requestId,
								// @ts-expect-error - Deno runtime types may not match Node types
								contractDrift: details,
							} as any;
						}
					} catch {
						// ignore validator errors; fall through
					}
				}
				return { ok: res.ok, status: res.status, json, text: undefined, requestId } as any;
      } catch (err: any) {
        lastErr = err;
        // retry on abort/network
        if (attempt === retries) throw err;
        await sleep(200 * Math.pow(2, attempt));
        attempt++;
      }
    }
    throw lastErr;
  } catch (err: any) {
    clearTimeout(t);
    return { ok: false, status: 0, text: String(err?.message || err), requestId };
  }

  async function writeTrace(obj: any) {
    // Lazy import to avoid bundling in tests unnecessarily
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const redactedHeaders = { ...headers };
    delete (redactedHeaders as any)['Authorization'];
    delete (redactedHeaders as any)['X-Agent-Token'];
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${ts}_${method}_${requestId}.json`;
    const filePath = path.resolve(traceDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ url, method, requestId, headers: redactedHeaders, body: opts.body ?? null, response: { status: obj.status, json: obj.json } }, null, 2), 'utf-8');
  }
}

async function safeJson<T = any>(res: Response): Promise<T | undefined> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return undefined;
  return res.json() as any;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Legacy compatibility
export async function callJson<T = any>(url: string, opts: FetchOptions = {}) {
  const res = await fetchJson<T>(url, opts);
  if (!res.ok) {
    throw new Error(res.text || `HTTP ${res.status}`);
  }
  return res.json as T;
}
