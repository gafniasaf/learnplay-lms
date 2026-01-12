/**
 * book-generation-control
 *
 * Admin control plane for BookGen Pro:
 * - pause/resume/cancel generation (checked between chapter jobs)
 *
 * Body:
 * - bookId: string
 * - bookVersionId: string
 * - action: "get" | "pause" | "resume" | "cancel" | "reset"
 * - note?: string
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { stdHeaders, handleOptions } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authenticateRequest, requireOrganizationId } from "../_shared/auth.ts";
import type { AuthContext } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function isTransientNetworkError(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message
      : (e && typeof e === "object" && "message" in e && typeof (e as any).message === "string")
        ? String((e as any).message)
        : String(e || "");
  const m = msg.toLowerCase();
  return (
    m.includes("connection reset") ||
    m.includes("connection error") ||
    m.includes("connection lost") ||
    m.includes("network connection lost") ||
    m.includes("econnreset") ||
    m.includes("sendrequest") ||
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("network")
  );
}

type ControlAction = "get" | "pause" | "resume" | "cancel" | "reset";

serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return handleOptions(req, requestId);
  }

  function json(body: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: stdHeaders(req, {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      }),
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: { code: "method_not_allowed", message: "Method not allowed" }, httpStatus: 405, requestId }, 200);
  }

  try {
    let auth: AuthContext;
    try {
      auth = await authenticateRequest(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unauthorized";
      return json({ ok: false, error: { code: "unauthorized", message }, httpStatus: 401, requestId }, 200);
    }

    let orgId: string;
    try {
      orgId = requireOrganizationId(auth);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Missing organization_id";
      return json({ ok: false, error: { code: "missing_org", message }, httpStatus: 401, requestId }, 200);
    }

    let bodyRaw: unknown;
    try {
      bodyRaw = await req.json();
    } catch {
      return json({ ok: false, error: { code: "invalid_request", message: "Invalid JSON body" }, httpStatus: 400, requestId }, 200);
    }

    if (!isPlainObject(bodyRaw)) {
      return json({ ok: false, error: { code: "invalid_request", message: "Body must be a JSON object" }, httpStatus: 400, requestId }, 200);
    }

    const bookId = safeString(bodyRaw.bookId).trim();
    const bookVersionId = safeString(bodyRaw.bookVersionId).trim();
    const actionRaw = safeString(bodyRaw.action).trim() as ControlAction;
    const note = truncate(safeString(bodyRaw.note), 800);

    if (!bookId) {
      return json({ ok: false, error: { code: "invalid_input", message: "bookId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!bookVersionId) {
      return json({ ok: false, error: { code: "invalid_input", message: "bookVersionId is required" }, httpStatus: 400, requestId }, 200);
    }
    if (!actionRaw || !["get", "pause", "resume", "cancel", "reset"].includes(actionRaw)) {
      return json({ ok: false, error: { code: "invalid_input", message: "action must be one of: get|pause|resume|cancel|reset" }, httpStatus: 400, requestId }, 200);
    }

    // Verify book belongs to org
    const { data: book, error: bookErr } = await adminSupabase
      .from("books")
      .select("id")
      .eq("id", bookId)
      .eq("organization_id", orgId)
      .single();

    if (bookErr) {
      const transient = isTransientNetworkError(bookErr);
      return json(
        {
          ok: false,
          error: { code: transient ? "transient_network" : "db_error", message: bookErr.message },
          httpStatus: transient ? 503 : 500,
          requestId,
        },
        200,
      );
    }
    if (!book) {
      return json({ ok: false, error: { code: "not_found", message: "Book not found" }, httpStatus: 404, requestId }, 200);
    }

    // Verify version exists
    const { data: version, error: versionErr } = await adminSupabase
      .from("book_versions")
      .select("book_version_id")
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId)
      .single();

    if (versionErr) {
      const transient = isTransientNetworkError(versionErr);
      return json(
        {
          ok: false,
          error: { code: transient ? "transient_network" : "db_error", message: versionErr.message },
          httpStatus: transient ? 503 : 500,
          requestId,
        },
        200,
      );
    }
    if (!version) {
      return json({ ok: false, error: { code: "not_found", message: "Book version not found" }, httpStatus: 404, requestId }, 200);
    }

    const action = actionRaw;
    if (action === "get") {
      const { data: control, error: ctrlErr } = await adminSupabase
        .from("bookgen_controls")
        .select("*")
        .eq("book_id", bookId)
        .eq("book_version_id", bookVersionId)
        .maybeSingle();

      if (ctrlErr) {
        const transient = isTransientNetworkError(ctrlErr);
        return json(
          {
            ok: false,
            error: { code: transient ? "transient_network" : "db_error", message: ctrlErr.message },
            httpStatus: transient ? 503 : 500,
            requestId,
          },
          200,
        );
      }

      return json(
        {
          ok: true,
          bookId,
          bookVersionId,
          control: control ?? null,
          requestId,
        },
        200,
      );
    }

    // Load current control (if any) to enforce cancel semantics.
    const { data: current, error: currentErr } = await adminSupabase
      .from("bookgen_controls")
      .select("*")
      .eq("book_id", bookId)
      .eq("book_version_id", bookVersionId)
      .maybeSingle();

    if (currentErr) {
      const transient = isTransientNetworkError(currentErr);
      return json(
        {
          ok: false,
          error: { code: transient ? "transient_network" : "db_error", message: currentErr.message },
          httpStatus: transient ? 503 : 500,
          requestId,
        },
        200,
      );
    }

    const hasRow = !!current;
    const isCancelled = hasRow ? (current as any).cancelled === true : false;
    if (isCancelled && action !== "reset") {
      return json(
        {
          ok: false,
          error: { code: "cancelled", message: "This book/version is cancelled. Use action=reset to clear." },
          httpStatus: 409,
          requestId,
        },
        200,
      );
    }

    const nextPaused =
      action === "pause" ? true :
      action === "resume" ? false :
      action === "cancel" ? false :
      false;

    const nextCancelled =
      action === "cancel" ? true :
      action === "reset" ? false :
      hasRow ? (current as any).cancelled === true : false;

    const nextNote = note
      ? note
      : action === "reset"
        ? null
        : hasRow
          ? safeString((current as any).note) || null
          : null;

    const upsertRow: Record<string, unknown> = {
      book_id: bookId,
      book_version_id: bookVersionId,
      organization_id: orgId,
      paused: nextPaused,
      cancelled: nextCancelled,
      note: nextNote,
      updated_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };

    // Ensure row exists & update state
    const { data: saved, error: saveErr } = await adminSupabase
      .from("bookgen_controls")
      .upsert(upsertRow, { onConflict: "book_id,book_version_id" })
      .select("*")
      .single();

    if (saveErr || !saved) {
      const transient = isTransientNetworkError(saveErr);
      return json(
        {
          ok: false,
          error: { code: transient ? "transient_network" : "db_error", message: saveErr?.message || "Failed to save control state" },
          httpStatus: transient ? 503 : 500,
          requestId,
        },
        200,
      );
    }

    return json({ ok: true, bookId, bookVersionId, control: saved, requestId }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[book-generation-control] Unhandled error (${requestId}):`, message);
    const transient = isTransientNetworkError(error);
    return json(
      {
        ok: false,
        error: { code: transient ? "transient_network" : "internal_error", message },
        httpStatus: transient ? 503 : 500,
        requestId,
      },
      200,
    );
  }
});


