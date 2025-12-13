import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { requireEnv } from "../_shared/env.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const BodySchema = z.object({
  id: z.string().uuid(),
});

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "POST") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Validate BEFORE auth
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Errors.invalidRequest("Invalid JSON body", requestId, req);
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return Errors.invalidRequest("Missing id", requestId, req);

    try {
      await authenticateRequest(req);
    } catch {
      return Errors.invalidAuth(requestId, req);
    }

    const { data: ko, error } = await admin
      .from("knowledge_objectives")
      .select("id, name, description, domain, topic_cluster_id, status, alias_of")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (error) return Errors.internal(error.message, requestId, req);
    if (!ko) return Errors.notFound("Knowledge objective", requestId, req);

    return ko;
  }),
);


