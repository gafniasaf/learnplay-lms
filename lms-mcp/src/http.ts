export interface FetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

export interface FetchResult<T> {
  ok: boolean;
  status: number;
  json?: T;
  text?: string;
  requestId?: string;
}

export async function fetchJson<T = any>(url: string, opts: FetchOptions = {}): Promise<FetchResult<T>> {
  const method = opts.method || "GET";
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  const body = opts.method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined;
  
  const doFetch = async () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), opts.timeoutMs || 30000);
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      clearTimeout(id);
      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      return {
        ok: res.ok,
        status: res.status,
        json: json as T,
        text,
        requestId: res.headers.get('x-request-id') || undefined
      };
    } catch (e: any) {
      clearTimeout(id);
      return {
        ok: false,
        status: 0,
        text: e.message,
        json: undefined
      };
    }
  };

  let result = await doFetch();
  let retries = opts.retries || 0;
  while (!result.ok && retries > 0) {
    retries--;
    await new Promise(r => setTimeout(r, 1000)); // wait 1s between retries
    result = await doFetch();
  }
  return result;
}

export const callJson = fetchJson;
