import { withCors } from "../_shared/cors.ts";

Deno.serve(withCors(async (req: Request) => {
  let payload: unknown = null;
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    // Request body parsing failed - treat as null (endpoint accepts optional payload)
    console.debug("[get-student-assignments] Request body parse failed (expected for GET requests):", error instanceof Error ? error.message : String(error));
  }

  return {
    ok: true,
    stub: true,
    endpoint: "get-student-assignments",
    received: payload,
  };
}));
