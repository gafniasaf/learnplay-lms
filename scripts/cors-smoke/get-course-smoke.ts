/**
 * Deno script: smoke check CORS for get-course
 * Usage:
 *   deno run -A scripts/cors-smoke/get-course-smoke.ts \
 *     --url=https://<project>.supabase.co/functions/v1/get-course \
 *     --origin=https://<preview-domain> \
 *     --courseId=<course-id>
 */
if (import.meta.main) {
  const args = new URLSearchParams(
    (Deno.args || [])
      .map((a) => a.replace(/^--/, ""))
      .map((kv) => kv.split("=", 2) as [string, string])
  );

  const urlBase = args.get("url") || Deno.env.get("FUNC_URL") || "";
  const origin = args.get("origin") || Deno.env.get("ORIGIN") || "";
  const courseId = args.get("courseId") || Deno.env.get("COURSE_ID") || "";

  if (!urlBase || !origin || !courseId) {
    console.error("Missing required params. Provide --url, --origin, --courseId.");
    Deno.exit(2);
  }

  const url = `${urlBase}?courseId=${encodeURIComponent(courseId)}&t=${Date.now()}`;
  const resp = await fetch(url, {
    headers: {
      "Origin": origin,
      "Accept": "application/json",
    },
  });

  const acao = resp.headers.get("access-control-allow-origin") ||
               resp.headers.get("Access-Control-Allow-Origin");
  const methods = resp.headers.get("access-control-allow-methods");
  const status = resp.status;

  console.log(JSON.stringify({
    url,
    origin,
    status,
    access_control_allow_origin: acao,
    access_control_allow_methods: methods,
  }, null, 2));

  if (!resp.ok) {
    console.error(`Non-OK status: ${status}`);
    Deno.exit(1);
  }

  if (!acao) {
    console.error("Missing Access-Control-Allow-Origin header");
    Deno.exit(1);
  }

  if (acao.includes(",")) {
    console.error(`CORS header has multiple values: ${acao}`);
    Deno.exit(1);
  }

  console.log("CORS smoke check passed.");
}


