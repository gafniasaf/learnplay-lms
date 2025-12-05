import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const MOCKUP_BUCKET = Deno.env.get("MOCKUP_BUCKET") ?? "mockups";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn("[resume-session] Missing Supabase service credentials");
}

const adminClient =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false },
      })
    : null;

function sanitizeName(value?: string | null) {
  if (!value) return "ignite-plan";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ignite-plan";
}

function parseMockupSource(name: string): "ai" | "upload" | "paste" {
  if (name.includes("_upload")) return "upload";
  if (name.includes("_paste")) return "paste";
  return "ai";
}

async function fetchLatestMockup(opts: {
  projectName?: string | null;
  ownerId?: string | null;
  sessionId?: string | null;
}) {
  if (!opts.projectName || !opts.ownerId || !opts.sessionId || !adminClient) return null;
  const ownerSlug = sanitizeName(opts.ownerId);
  const projectSlug = sanitizeName(opts.projectName);
  const sessionSlug = sanitizeName(opts.sessionId);
  const folder = `${ownerSlug}/${projectSlug}/${sessionSlug}`;

  try {
    const { data, error } = await adminClient.storage
      .from(MOCKUP_BUCKET)
      .list(folder, { limit: 50, sortBy: { column: "name", order: "desc" } });

    if (error) {
      console.warn("[resume-session] mockup list error", error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const latest = [...data]
      .filter((item) => item.name.endsWith(".html"))
      .sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime(),
      )[0];

    if (!latest) return null;

    const filePath = `${folder}/${latest.name}`;
    const {
      data: { publicUrl },
    } = adminClient.storage.from(MOCKUP_BUCKET).getPublicUrl(filePath);

    return {
      id: latest.name,
      url: publicUrl,
      created_at: latest.created_at ?? new Date().toISOString(),
      source: parseMockupSource(latest.name),
    };
  } catch (err) {
    console.warn("[resume-session] mockup lookup failed", err);
    return null;
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "resume-session");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  if (!adminClient) {
    return new Response(
      JSON.stringify({ error: "Service credentials not configured" }),
      {
        status: 500,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const projectName = body?.projectName;
    const limitRaw = Number(body?.limit) || 1;
    const limit = Math.min(Math.max(limitRaw, 1), 50);
    const ownerId = typeof body?.ownerId === "string" ? body.ownerId : undefined;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;

    let planQuery = adminClient
      .from("architect_plans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (projectName) {
      planQuery = planQuery.eq("project_name", projectName);
    }

    if (ownerId) {
      planQuery = planQuery.contains("metadata", { owner_id: ownerId });
    }
    if (sessionId) {
      planQuery = planQuery.contains("metadata", { session_id: sessionId });
    }

    const { data: planRows, error: planError } = await planQuery;

    if (planError) {
      throw planError;
    }

    let consultQuery = adminClient
      .from("consult_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (projectName) {
      consultQuery = consultQuery.contains("metadata", {
        project_name: projectName,
      });
    }

    if (ownerId) {
      consultQuery = consultQuery.contains("metadata", { owner_id: ownerId });
    }
    if (sessionId) {
      consultQuery = consultQuery.contains("metadata", { session_id: sessionId });
    }

    const { data: consultRows, error: consultError } = await consultQuery;

    if (consultError) {
      throw consultError;
    }

    const latestMetadata = planRows?.[0]?.metadata ?? {};
    const latestMockup = await fetchLatestMockup({
      projectName: planRows?.[0]?.project_name,
      ownerId: latestMetadata?.owner_id ?? ownerId,
      sessionId: latestMetadata?.session_id ?? sessionId,
    });

    return new Response(
      JSON.stringify({
        plan: planRows?.[0] ?? null,
        consult: consultRows?.[0] ?? null,
        plans: planRows ?? [],
        consults: consultRows ?? [],
        mockup: latestMockup,
      }),
      {
        status: 200,
        headers: stdHeaders(req, { "Content-Type": "application/json" }),
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }
});

