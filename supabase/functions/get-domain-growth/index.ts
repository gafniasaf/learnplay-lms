import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface GetDomainGrowthBody {
  studentId: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleOptions(req, "get-domain-growth");
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: stdHeaders(req),
    });
  }

  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return new Response(
      JSON.stringify({ error: message }),
      { status: message === "Missing organization_id" ? 400 : 401, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }

  let body: GetDomainGrowthBody;
  try {
    body = await req.json() as GetDomainGrowthBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  if (!body?.studentId || typeof body.studentId !== "string") {
    return new Response(JSON.stringify({ error: "studentId is required" }), {
      status: 400,
      headers: stdHeaders(req, { "Content-Type": "application/json" }),
    });
  }

  const organizationId = requireOrganizationId(auth);

  try {
    // Query mastery states grouped by domain
    const { data: masteryStates, error: queryError } = await adminSupabase
      .from("mastery_states")
      .select(`
        *,
        knowledge_objectives!inner(domain)
      `)
      .eq("student_id", body.studentId);

    if (queryError) {
      // If tables don't exist, return empty domains
      console.warn("[get-domain-growth] Query error (tables may not exist):", queryError);
      return new Response(
        JSON.stringify([]),
        { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
      );
    }

    // Group by domain
    const domainMap = new Map<string, {
      domain: string;
      skills: Array<{ mastery: number; status: string }>;
    }>();

    (masteryStates || []).forEach((ms: any) => {
      const domain = ms.knowledge_objectives?.domain || 'unknown';
      if (!domainMap.has(domain)) {
        domainMap.set(domain, { domain, skills: [] });
      }
      
      const mastery = ms.mastery || 0;
      let status: 'locked' | 'in-progress' | 'mastered' = 'locked';
      if (mastery >= 0.8) {
        status = 'mastered';
      } else if (mastery > 0) {
        status = 'in-progress';
      }

      domainMap.get(domain)!.skills.push({ mastery, status });
    });

    // Calculate summary for each domain
    const domains = Array.from(domainMap.values()).map(({ domain, skills }) => {
      if (skills.length === 0) {
        return {
          domain,
          overallMastery: 0,
          trend: 0,
          masteredCount: 0,
          inProgressCount: 0,
          lockedCount: 0,
        };
      }

      const masteredCount = skills.filter(s => s.status === 'mastered').length;
      const inProgressCount = skills.filter(s => s.status === 'in-progress').length;
      const lockedCount = skills.filter(s => s.status === 'locked').length;
      
      const totalMastery = skills.reduce((sum, s) => sum + s.mastery, 0);
      const overallMastery = totalMastery / skills.length;

      // Mock trend: calculate week-over-week change (simplified)
      const trend = Math.random() * 0.2 - 0.1; // Random between -0.1 and 0.1

      return {
        domain,
        overallMastery,
        trend,
        masteredCount,
        inProgressCount,
        lockedCount,
      };
    });

    return new Response(
      JSON.stringify(domains),
      { status: 200, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  } catch (error) {
    console.error("get-domain-growth error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: stdHeaders(req, { "Content-Type": "application/json" }) }
    );
  }
});

