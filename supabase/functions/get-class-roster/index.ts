import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { withCors } from "../_shared/cors.ts";

const QuerySchema = z.object({
  classId: z.string().uuid(),
});

serve(withCors(async (req) => {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  
  if (req.method !== "GET") return Errors.methodNotAllowed(req.method, requestId, req);

  const bad = checkOrigin(req);
  if (bad) return bad;

  try {
    // 1) Validate query params BEFORE auth
    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      classId: url.searchParams.get("classId") ?? "",
    });

    if (!parsed.success) {
      console.error("[get-class-roster] Validation failed:", parsed.error.issues);
      return Errors.invalidRequest("Invalid classId parameter", requestId, req);
    }

    const { classId } = parsed.data;
    console.log(`[get-class-roster] Request for class: ${classId}`);

    // 2) Auth check AFTER validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Errors.noAuth(requestId, req);
    }

    // 3) Create Supabase client with auth
    const supabase = createClient(
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
      console.error("[get-class-roster] Unauthorized");
      return Errors.invalidAuth(requestId, req);
    }

    const { data: classData } = await supabase
      .from("classes")
      .select("org_id, name, owner")
      .eq("id", classId)
      .maybeSingle();

    if (!classData) return Errors.notFound("Class", requestId, req);

    // Allow class owner OR org teacher/admin
    const isOwner = classData.owner === authData.user.id;

    if (!isOwner) {
      const { data: orgUser } = await supabase
        .from("organization_users")
        .select("org_role")
        .eq("org_id", classData.org_id)
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (!orgUser || !["school_admin", "teacher"].includes(orgUser.org_role)) {
        return Errors.forbidden("Teacher or admin role required", requestId, req);
      }
    }

    // Use service role to bypass RLS and fetch all members with profile data
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch members
    const { data: members, error: membersError } = await serviceSupabase
      .from("class_members")
      .select("user_id, role")
      .eq("class_id", classId);

    if (membersError) {
      console.error("[get-class-roster] Error fetching members:", membersError);
    }

    // Fetch profiles and emails separately
    const roster = await Promise.all(
      (members ?? []).map(async (m) => {
        const { data: profile } = await serviceSupabase
          .from("profiles")
          .select("full_name")
          .eq("id", m.user_id)
          .single();

        // Fetch email from auth.users using admin API
        const { data: { user } } = await serviceSupabase.auth.admin.getUserById(m.user_id);

        return {
          user_id: m.user_id,
          email: user?.email ?? "",
          profiles: {
            full_name: profile?.full_name ?? "Student",
          },
          role: m.role,
          status: "active",
        };
      })
    );

    const { data: invites } = await serviceSupabase
      .from("pending_invites")
      .select("id, email, created_at, expires_at, accepted")
      .eq("class_id", classId)
      .eq("accepted", false);

    const pendingInvites = (invites ?? []).map(i => ({
      id: i.id,
      email: i.email,
      createdAt: i.created_at,
      expiresAt: i.expires_at,
      status: "pending",
    }));

    console.log(`[get-class-roster] ✓ Returned ${roster.length} members, ${pendingInvites.length} pending`);

    return { roster, pendingInvites, className: classData.name };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[get-class-roster] Error:", errorMessage);
    return Errors.internal(errorMessage, requestId, req);
  }
}));
