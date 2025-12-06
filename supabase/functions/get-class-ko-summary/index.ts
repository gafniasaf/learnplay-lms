import { withCors } from "../_shared/cors.ts";

Deno.serve(withCors(async (req: Request) => {
  let payload: unknown = null;
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : null;
  } catch {}

  return {
    ok: true,
    stub: true,
    endpoint: "get-class-ko-summary",
    received: payload,
  };
}));
