import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { withCors, stdHeaders } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { requireEnv } from "../_shared/env.ts";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const QuerySchema = z.object({
  assignmentId: z.string().uuid(),
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
      assignmentId: url.searchParams.get("assignmentId") ?? "",
    });
    if (!parsed.success) return Errors.invalidRequest("Invalid assignmentId parameter", requestId, req);

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

    const { assignmentId } = parsed.data;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authorization: must be teacher/admin in org
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

    // Ensure assignment exists in this org
    const { data: assignment, error: assignmentError } = await admin
      .from("assignments")
      .select("id, org_id, title")
      .eq("id", assignmentId)
      .maybeSingle();
    if (assignmentError) return Errors.internal(assignmentError.message, requestId, req);
    if (!assignment) return Errors.notFound("Assignment", requestId, req);
    if ((assignment as any).org_id !== organizationId) return Errors.forbidden("Assignment is not in your organization", requestId, req);

    const { data: assignees, error: assigneesError } = await admin
      .from("assignment_assignees")
      .select("user_id")
      .eq("assignment_id", assignmentId)
      .eq("assignee_type", "student");
    if (assigneesError) return Errors.internal(assigneesError.message, requestId, req);

    const studentIds = [...new Set((assignees ?? []).map((a: any) => a.user_id).filter(Boolean))] as string[];

    const { data: profiles } = studentIds.length
      ? await admin.from("profiles").select("id, full_name").in("id", studentIds)
      : { data: [] as any[] };

    const { data: sessions } = await admin.from("game_sessions").select("id, user_id").eq("assignment_id", assignmentId);
    const sessionIds = (sessions ?? []).map((s: any) => s.id);

    const { data: rounds } = sessionIds.length
      ? await admin.from("game_rounds").select("id, session_id, ended_at").in("session_id", sessionIds)
      : { data: [] as any[] };
    const roundIds = (rounds ?? []).map((r: any) => r.id);

    const { data: attempts } = roundIds.length
      ? await admin.from("game_attempts").select("round_id, correct, created_at").in("round_id", roundIds)
      : { data: [] as any[] };

    const userToSessions = new Map<string, string[]>();
    for (const s of sessions ?? []) {
      if (!s.user_id) continue;
      const existing = userToSessions.get(s.user_id) ?? [];
      existing.push(s.id);
      userToSessions.set(s.user_id, existing);
    }

    const rows: Array<{ name: string; attempts: number; correct: number; accuracy: number; completed: string; lastActivity: string }> = [];

    for (const studentId of studentIds) {
      const name = profiles?.find((p: any) => p.id === studentId)?.full_name ?? `Student ${studentId.slice(0, 8)}`;
      const sids = userToSessions.get(studentId) ?? [];
      const studentRounds = (rounds ?? []).filter((r: any) => sids.includes(r.session_id));
      const studentRoundIds = studentRounds.map((r: any) => r.id);
      const studentAttempts = (attempts ?? []).filter((a: any) => studentRoundIds.includes(a.round_id));
      const correct = studentAttempts.filter((a: any) => a.correct).length;
      const total = studentAttempts.length;
      const accuracy = total ? Math.round((correct / total) * 100) : 0;
      const completed = studentRounds.some((r: any) => Boolean(r.ended_at)) ? "Yes" : "No";
      const lastActivity = (() => {
        const times: string[] = [];
        for (const r of studentRounds) if (r.ended_at) times.push(r.ended_at);
        for (const a of studentAttempts) if (a.created_at) times.push(a.created_at);
        if (times.length === 0) return "—";
        times.sort();
        return new Date(times[times.length - 1]).toLocaleDateString();
      })();

      rows.push({ name, attempts: total, correct, accuracy, completed, lastActivity });
    }

    const csvLines: string[] = [];
    csvLines.push("Student,Attempts,Correct,Accuracy,Completed,Last Activity");
    for (const r of rows) {
      csvLines.push(`"${r.name.replaceAll('"', '""')}",${r.attempts},${r.correct},${r.accuracy}%,${r.completed},"${r.lastActivity}"`);
    }
    const csv = csvLines.join("\n");

    const safeTitle = (assignment.title ?? "assignment").replaceAll(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60);
    const filename = `gradebook-${safeTitle}-${assignmentId}.csv`;

    return new Response(csv, {
      status: 200,
      headers: stdHeaders(req, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Request-Id": requestId,
      }),
    });
  }),
);


