import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { Errors } from "../_shared/error.ts";
import { formatValidationError } from "../_shared/validation.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { withCors } from "../_shared/cors.ts";

const QuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

interface ActivityEvent {
  id: string;
  student_id: string;
  event_type: string;
  description: string;
  metadata: Record<string, any>;
  occurred_at: string;
}

interface TimelineResponse {
  events: ActivityEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

serve(withCors(async (req) => {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  
  if (req.method !== "GET") {
    return Errors.methodNotAllowed(req.method, requestId, req);
  }

  const bad = checkOrigin(req);
  if (bad) return bad;
  
  try {
    console.log("[student-timeline] Request received");

    // Parse and validate query parameters
    const url = new URL(req.url);
    const params = {
      studentId: url.searchParams.get("studentId") || undefined,
      limit: url.searchParams.get("limit") || "50",
      cursor: url.searchParams.get("cursor") || undefined,
    };

    const parsed = QuerySchema.safeParse(params);
    if (!parsed.success) {
      return Errors.invalidRequest(formatValidationError(parsed.error), requestId, req);
    }

    const { studentId, limit, cursor } = parsed.data;

    // Check for agent token first (backend/automation calls)
    const agentToken = req.headers.get("x-agent-token") ?? req.headers.get("X-Agent-Token");
    const expectedAgentToken = Deno.env.get("AGENT_TOKEN");
    const isAgentAuth = expectedAgentToken && agentToken === expectedAgentToken;
    
    let userId: string;
    let supabase;
    let targetStudentId: string;
    
    if (isAgentAuth) {
      // Agent auth - use service role for data access
      supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      // For agent calls, studentId is required
      if (!studentId) {
        return Errors.invalidRequest("studentId required for agent auth", requestId, req);
      }
      userId = studentId;
      targetStudentId = studentId;
    } else {
      // User auth - require Authorization header
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return Errors.noAuth(requestId, req);
      }

      supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: {
            headers: { Authorization: authHeader },
          },
        }
      );

      const { data: authData, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authData?.user) {
        console.error("[student-timeline] Auth error:", authError);
        return Errors.invalidAuth(requestId, req);
      }
      userId = authData.user.id;
      // Determine target student: if studentId provided, use it (RLS will enforce access)
      // Otherwise, default to the authenticated user's own timeline
      targetStudentId = studentId || userId;
    }

    console.log(`[student-timeline] Fetching timeline for student: ${targetStudentId}, cursor: ${cursor || 'none'}`);

    // Build query with cursor-based pagination
    let query = supabase
      .from("student_activity_log")
      .select("*")
      .eq("student_id", targetStudentId)
      .order("occurred_at", { ascending: false })
      .limit(limit + 1); // Fetch one extra to determine if there are more

    // Apply cursor if provided (occurred_at of last item from previous page)
    if (cursor) {
      // Cursor is the ISO timestamp of the last item
      query = query.lt("occurred_at", cursor);
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error("[student-timeline] Events error:", eventsError);
      return Errors.internal("Failed to fetch timeline events", requestId, req);
    }

    // Check if there are more results
    const hasMore = events.length > limit;
    const resultEvents = hasMore ? events.slice(0, limit) : events;

    // Generate next cursor from last item's occurred_at
    const nextCursor = hasMore && resultEvents.length > 0
      ? resultEvents[resultEvents.length - 1].occurred_at
      : null;

    const response: TimelineResponse = {
      events: resultEvents,
      nextCursor,
      hasMore,
    };

    console.log(`[student-timeline] ✓ Returning ${resultEvents.length} events, hasMore: ${hasMore}`);

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[student-timeline] Error:", errorMessage);
    return Errors.internal(errorMessage, requestId, req);
  }
}));
