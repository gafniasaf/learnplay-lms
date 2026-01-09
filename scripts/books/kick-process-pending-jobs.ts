import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string" || !v.trim()) {
    console.error(`BLOCKED: ${name} is REQUIRED`);
    process.exit(1);
  }
  return v.trim();
}

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(String(s || "").trim());
}

async function main() {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const agentToken = requireEnv("AGENT_TOKEN");

  const agentJobId = String(process.argv[2] || "").trim();
  if (agentJobId && !isUuid(agentJobId)) {
    console.error("Usage: npx tsx scripts/books/kick-process-pending-jobs.ts [agentJobId]");
    console.error("BLOCKED: agentJobId must be a UUID");
    process.exit(1);
  }

  const url =
    `${supabaseUrl}/functions/v1/process-pending-jobs?agentN=1&mediaN=0` +
    (agentJobId ? `&agentJobId=${encodeURIComponent(agentJobId)}` : "");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": agentToken,
    },
  });

  const text = await resp.text().catch(() => "");
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok || json?.ok !== true) {
    const msg =
      typeof json?.error === "string"
        ? json.error
        : typeof json?.error?.message === "string"
          ? json.error.message
          : `HTTP ${resp.status}: ${text.slice(0, 200)}`;
    throw new Error(msg);
  }

  const agent = json?.agent;
  const attempted = typeof agent?.attempted === "number" ? agent.attempted : null;
  const results = Array.isArray(agent?.results) ? agent.results : [];
  const first = results[0] || null;
  const body = first?.body || null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        agentJobId: agentJobId || null,
        attempted,
        first: first
          ? {
              ok: first.ok,
              status: first.status,
              processed: body && typeof body === "object" ? (body as any).processed : undefined,
              message: body && typeof body === "object" ? (body as any).message : undefined,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ kick-process-pending-jobs failed: ${msg}`);
  process.exit(1);
});


