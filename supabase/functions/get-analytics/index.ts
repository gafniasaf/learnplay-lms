import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const QuerySchema = z.object({
  courseId: z.string().optional(),
  range: z.enum(["7", "30", "90"]).default("30"),
});

serve(
  withCors(async (req) => {
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

    const bad = checkOrigin(req);
    if (bad) return bad;

    // Validate BEFORE auth
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      courseId: url.searchParams.get("courseId") ?? undefined,
      range: url.searchParams.get("range") ?? "30",
    });
    if (!parsed.success) return Errors.invalidRequest("Invalid courseId/range", requestId, req);

    // Hybrid auth
    let auth;
    try {
      auth = await authenticateRequest(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unauthorized";
      return msg.includes("organization_id") ? Errors.invalidRequest(msg, requestId, req) : Errors.invalidAuth(requestId, req);
    }

    const organizationId = requireOrganizationId(auth);
    const actorUserId = auth.userId;
    if (!actorUserId) return Errors.invalidRequest("Missing x-user-id for agent auth", requestId, req);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authorization: teacher/admin in this org
    const { data: orgUser, error: orgErr } = await admin
      .from("organization_users")
      .select("org_role")
      .eq("org_id", organizationId)
      .eq("user_id", actorUserId)
      .maybeSingle();
    if (orgErr) return Errors.internal(orgErr.message, requestId, req);
    if (!orgUser || !["teacher", "school_admin"].includes((orgUser as any).org_role)) {
      return Errors.forbidden("Teacher or admin role required", requestId, req);
    }

    const orgIds = [organizationId];
    const { data: students, error: stuErr } = await admin
      .from("organization_users")
      .select("user_id")
      .in("org_id", orgIds)
      .eq("org_role", "student");
    if (stuErr) return Errors.internal(stuErr.message, requestId, req);

    const studentIds = [...new Set((students ?? []).map((s: any) => s.user_id).filter(Boolean))] as string[];
    if (studentIds.length === 0) {
      return { dailyData: [], summary: { totalSessions: 0, totalAttempts: 0, overallAccuracy: 0 }, range: Number(parsed.data.range), courseId: parsed.data.courseId ?? null };
    }

    const daysAgo = Number(parsed.data.range);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    let sessionQuery = admin
      .from("game_sessions")
      .select("id, user_id, course_id, started_at")
      .in("user_id", studentIds)
      .gte("started_at", startDate.toISOString());

    if (parsed.data.courseId) {
      sessionQuery = sessionQuery.eq("course_id", parsed.data.courseId);
    }

    const { data: sessions, error: sesErr } = await sessionQuery.order("started_at", { ascending: true });
    if (sesErr) return Errors.internal(sesErr.message, requestId, req);

    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    const { data: rounds } = sessionIds.length
      ? await admin.from("game_rounds").select("id, session_id, ended_at").in("session_id", sessionIds)
      : { data: [] as any[] };
    const roundIds = (rounds ?? []).map((r: any) => r.id);
    const { data: attempts } = roundIds.length
      ? await admin.from("game_attempts").select("round_id, correct, created_at").in("round_id", roundIds)
      : { data: [] as any[] };

    const dailyData: Array<{ date: string; sessions: number; attempts: number; accuracy: number }> = [];
    for (let i = 0; i < daysAgo; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (daysAgo - 1 - i));
      const dateStr = date.toISOString().split("T")[0];

      const daySessions = (sessions ?? []).filter((s: any) => String(s.started_at).startsWith(dateStr)).length;
      const dayAttempts = (attempts ?? []).filter((a: any) => String(a.created_at).startsWith(dateStr));
      const correct = dayAttempts.filter((a: any) => a.correct).length;
      const accuracy = dayAttempts.length ? Math.round((correct / dayAttempts.length) * 100) : 0;

      dailyData.push({ date: dateStr, sessions: daySessions, attempts: dayAttempts.length, accuracy });
    }

    const totalAttempts = (attempts ?? []).length;
    const totalCorrect = (attempts ?? []).filter((a: any) => a.correct).length;
    const overallAccuracy = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

    return {
      dailyData,
      summary: {
        totalSessions: (sessions ?? []).length,
        totalAttempts,
        overallAccuracy,
      },
      range: daysAgo,
      courseId: parsed.data.courseId ?? null,
    };
  }),
);


