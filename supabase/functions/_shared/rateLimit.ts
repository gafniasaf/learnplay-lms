// supabase/functions/_shared/rateLimit.ts
// Token bucket rate limiting for public endpoints
const WINDOW_MS = +(Deno.env.get("RL_WINDOW_MS") ?? "60000");
const MAX = +(Deno.env.get("RL_MAX") ?? "60");
const buckets = new Map<string, { tokens: number; ts: number }>();

export function rateLimit(req: Request): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
  const now = Date.now();
  const st = buckets.get(ip) || { tokens: MAX, ts: now };
  const refill = Math.floor(((now - st.ts) / WINDOW_MS) * MAX);
  const tokens = Math.min(MAX, st.tokens + Math.max(0, refill));
  if (tokens <= 0) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    });
  }
  buckets.set(ip, { tokens: tokens - 1, ts: now });
  return null;
}


