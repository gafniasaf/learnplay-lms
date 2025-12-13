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
      .eq("org_id", organizationId)
      .maybeSingle();
    if (assignmentError) return Errors.internal(assignmentError.message, requestId, req);
    if (!assignment) return Errors.notFound("Assignment", requestId, req);

    const { data: assignees, error: assigneesError } = await admin
      .from("assignment_assignees")
      .select("user_id, assignee_type")
      .eq("assignment_id", assignmentId)
      .eq("assignee_type", "student");
    if (assigneesError) return Errors.internal(assigneesError.message, requestId, req);

    const studentIds = [...new Set((assignees ?? []).map((a: any) => a.user_id).filter(Boolean))] as string[];
    if (studentIds.length === 0) {
      return { rows: [], assignmentTitle: assignment.title ?? "" };
    }

    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", studentIds);

    const roster = new Map<string, { name: string; attempts: number; correct: number; completed: boolean; lastActivity: string | null }>();
    for (const id of studentIds) {
      const p = profiles?.find((x: any) => x.id === id);
      roster.set(id, {
        name: p?.full_name ?? `Student ${id.slice(0, 8)}`,
        attempts: 0,
        correct: 0,
        completed: false,
        lastActivity: null,
      });
    }

    const { data: sessions } = await admin.from("game_sessions").select("id, user_id").eq("assignment_id", assignmentId);
    const sessionIds = (sessions ?? []).map((s: any) => s.id);
    const userToSessions = new Map<string, string[]>();
    for (const s of sessions ?? []) {
      if (!s.user_id) continue;
      const existing = userToSessions.get(s.user_id) ?? [];
      existing.push(s.id);
      userToSessions.set(s.user_id, existing);
    }

    if (sessionIds.length > 0) {
      const { data: rounds } = await admin
        .from("game_rounds")
        .select("id, session_id, ended_at")
        .in("session_id", sessionIds);

      const roundIds = (rounds ?? []).map((r: any) => r.id);
      if (rounds && rounds.length > 0) {
        // completion + lastActivity from rounds
        for (const r of rounds) {
          if (!r.ended_at) continue;
          for (const [userId, sids] of userToSessions.entries()) {
            if (!sids.includes(r.session_id)) continue;
            const row = roster.get(userId);
            if (!row) continue;
            row.completed = true;
            if (!row.lastActivity || r.ended_at > row.lastActivity) row.lastActivity = r.ended_at;
          }
        }
      }

      if (roundIds.length > 0) {
        const { data: attempts } = await admin
          .from("game_attempts")
          .select("round_id, correct, created_at")
          .in("round_id", roundIds);

        for (const a of attempts ?? []) {
          const round = rounds?.find((r: any) => r.id === a.round_id);
          if (!round) continue;
          for (const [userId, sids] of userToSessions.entries()) {
            if (!sids.includes(round.session_id)) continue;
            const row = roster.get(userId);
            if (!row) continue;
            row.attempts += 1;
            if (a.correct) row.correct += 1;
            if (!row.lastActivity || a.created_at > row.lastActivity) row.lastActivity = a.created_at;
          }
        }
      }
    }

    const rows = Array.from(roster.entries()).map(([studentId, data]) => ({
      studentId,
      name: data.name,
      attempts: data.attempts,
      correct: data.correct,
      accuracy: data.attempts ? Math.round((data.correct / data.attempts) * 100) : 0,
      completed: data.completed,
      lastActivity: data.lastActivity,
    }));

    return { rows, assignmentTitle: assignment.title ?? "" };
  }),
);


