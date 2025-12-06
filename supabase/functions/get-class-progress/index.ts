import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { Errors } from "../_shared/error.ts";
import { formatValidationError } from "../_shared/validation.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { withCors } from "../_shared/cors.ts";

const QuerySchema = z.object({
  courseId: z.string().min(1).max(64),
  rangeDays: z.number().int().min(1).max(90).optional().default(30),
});

serve(withCors(async (req) => {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  
  if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

  const bad = checkOrigin(req);
  if (bad) return bad;
  
  try {
    console.log("[get-class-progress] Request received");

    // Validate BEFORE auth
    const url = new URL(req.url);
    const params = {
      courseId: url.searchParams.get("courseId"),
      rangeDays: url.searchParams.get("rangeDays") ? Number(url.searchParams.get("rangeDays")) : undefined,
    };

    const parsed = QuerySchema.safeParse(params);
    if (!parsed.success) {
      return Errors.invalidRequest(formatValidationError(parsed.error), requestId, req);
    }

    const { courseId, rangeDays } = parsed.data;

    // Auth check AFTER validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return Errors.noAuth(requestId, req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Errors.invalidAuth(requestId, req);

    // Check if user is teacher or admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "teacher" && profile?.role !== "admin") {
      return Errors.forbidden("Teacher or admin role required", requestId, req);
    }

    console.log(`[get-class-progress] Fetching progress for course: ${courseId}, range: ${rangeDays} days`);

    const sinceDate = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const sinceIso = sinceDate.toISOString();

    const { data: attemptsData } = await supabase
      .from("game_attempts")
      .select(`
        correct,
        created_at,
        game_rounds!inner(
          game_sessions!inner(
            user_id,
            course_id
          )
        )
      `)
      .gte("created_at", sinceIso);

    const stats = new Map();
    
    for (const attempt of attemptsData || []) {
      const session = (attempt as any).game_rounds?.game_sessions;
      if (!session || session.course_id !== courseId) continue;
      
      const userId = session.user_id;
      if (!stats.has(userId)) {
        stats.set(userId, { attempts: 0, correct: 0 });
      }
      
      const userStats = stats.get(userId)!;
      userStats.attempts += 1;
      if (attempt.correct) userStats.correct += 1;
    }

    const userIds = Array.from(stats.keys());
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    const rows = userIds.map((userId) => {
      const userStats = stats.get(userId)!;
      const profile = profiles?.find(p => p.id === userId);
      const accuracy = userStats.attempts > 0 ? Math.round((userStats.correct / userStats.attempts) * 100) : 0;

      return {
        studentId: userId,
        name: profile?.full_name || "Unknown",
        attempts: userStats.attempts,
        correct: userStats.correct,
        accuracy,
      };
    });

    rows.sort((a, b) => b.accuracy - a.accuracy);

    console.log(`[get-class-progress] ✓ Returned ${rows.length} student progress records`);

    return { rows, since: sinceIso, courseId, rangeDays };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[get-class-progress] Error:", errorMessage);
    return Errors.internal(errorMessage, requestId, req);
  }
}));
