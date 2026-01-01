import { idStr } from "../_shared/validation.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { Errors } from "../_shared/error.ts";
import { checkOrigin } from "../_shared/origins.ts";
import { withCors } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type CourseEnvelope = {
  id?: string;
  format: string;
  version?: string | number;
  content: unknown;
};

function isEnvelope(x: any): x is CourseEnvelope {
  return !!x && typeof x === "object" && "content" in x && "format" in x;
}

function coerceCorrectIndex(options: string[], correct: string | undefined): number {
  if (!correct) return 0;
  const exact = options.indexOf(correct);
  if (exact >= 0) return exact;
  const lowered = options.map((o) => o.toLowerCase());
  const idx = lowered.indexOf(correct.toLowerCase());
  return idx >= 0 ? idx : 0;
}

/**
 * Normalize whatever is in Storage into a canonical envelope.
 * - If already envelope: return as-is.
 * - If legacy practice course (has items[]): wrap into envelope.
 * - If nested legacy schema (levels[].groups[].items[]): migrate into practice course then wrap.
 *
 * NOTE: This is intentionally conservative: unknown formats stay untouched; unknown shapes error.
 */
function normalizeCourseJson(courseId: string, raw: any): { normalized: any; migrated: boolean } {
  if (isEnvelope(raw)) {
    return { normalized: raw, migrated: false };
  }

  // Legacy practice course shape (already playable): { id, title, groups, levels, items }
  if (raw && typeof raw === "object" && typeof raw.id === "string" && Array.isArray(raw.items)) {
    const env: CourseEnvelope = {
      id: raw.id,
      format: String((raw as any).format ?? "practice"),
      version: (raw as any).version ?? 1,
      content: raw,
    };
    return { normalized: env, migrated: true };
  }

  // Nested proto schema (seen in earlier generator runs)
  // { title, description, grade_band, levels:[{ level, groups:[{ group, items:[{ stem, options, correct_answer, explanation }]}]}] }
  if (raw && typeof raw === "object" && Array.isArray((raw as any).levels)) {
    const nested = raw as any;
    const id = typeof nested.id === "string" ? nested.id : courseId;
    const title = typeof nested.title === "string" ? nested.title : id;

    const groupIds = new Set<number>();
    const items: any[] = [];
    let nextId = 1;

    for (const lvl of nested.levels || []) {
      for (const g of (lvl?.groups || [])) {
        const gid = typeof g?.group === "number" ? g.group : 0;
        groupIds.add(gid);
        for (const it of (g?.items || [])) {
          const options = Array.isArray(it?.options) ? it.options : [];
          items.push({
            id: nextId++,
            groupId: gid,
            text: typeof it?.stem === "string" ? it.stem : "",
            explain: typeof it?.explanation === "string" ? it.explanation : "",
            clusterId: `${id}-g${gid}-i${nextId}`,
            variant: "1",
            mode: "options",
            options,
            correctIndex: coerceCorrectIndex(options, typeof it?.correct_answer === "string" ? it.correct_answer : undefined),
          });
        }
      }
    }

    if (items.length === 0) {
      throw new Error(
        `[get-course] Course '${courseId}' is not playable: nested schema contained no items. Delete or regenerate this course.`
      );
    }

    const groups = Array.from(groupIds)
      .sort((a, b) => a - b)
      .map((gid) => ({ id: gid, name: `Group ${gid}` }));

    const levels = (nested.levels || [])
      .map((lvl: any) => {
        const idNum = typeof lvl?.level === "number" ? lvl.level : undefined;
        const groupNums = (lvl?.groups || [])
          .map((gg: any) => (typeof gg?.group === "number" ? gg.group : null))
          .filter((x: any) => typeof x === "number");
        const start = groupNums.length ? Math.min(...groupNums) : 0;
        const end = groupNums.length ? Math.max(...groupNums) : 0;
        return idNum ? { id: idNum, title: `Level ${idNum}`, start, end } : null;
      })
      .filter((x: any) => x !== null);

    const finalLevels =
      levels.length > 0
        ? levels
        : [
            {
              id: 1,
              title: "All Content",
              start: Math.min(...Array.from(groupIds)),
              end: Math.max(...Array.from(groupIds)),
            },
          ];

    const practiceCourse = {
      id,
      title,
      description: typeof nested.description === "string" ? nested.description : undefined,
      contentVersion: typeof nested.contentVersion === "string" ? nested.contentVersion : undefined,
      groups,
      levels: finalLevels,
      items,
    };

    const env: CourseEnvelope = {
      id,
      format: "practice",
      version: 1,
      content: practiceCourse,
    };

    return { normalized: env, migrated: true };
  }

  throw new Error(
    `[get-course] Unsupported course JSON schema for '${courseId}'. Delete or regenerate this course.`
  );
}

Deno.serve(withCors(async (req) => {
  const reqId = crypto.randomUUID();
  
  if (req.method !== "GET" && req.method !== "HEAD") {
    return Errors.methodNotAllowed(req.method, reqId, req);
  }

  const bad = checkOrigin(req);
  if (bad) return bad;

  const rl = rateLimit(req);
  if (rl) return rl;

  try {
    console.log("[get-course] Request received");
    
    // Parse and validate courseId from query params
    const url = new URL(req.url);
    const courseId = url.searchParams.get("courseId");
    
    const idValidation = idStr.safeParse(courseId);
    if (!idValidation.success) {
      console.error("[get-course] Invalid courseId", idValidation.error);
      return Errors.invalidRequest(
        "Invalid courseId format. Must be alphanumeric with dashes, 1-64 characters",
        reqId,
        req
      );
    }

    const validCourseId = idValidation.data;
    console.log(`[get-course] Fetching course: ${validCourseId}`);

    // Check If-None-Match header for conditional request
    const ifNoneMatch = req.headers.get("If-None-Match");

    // Download course.json from storage (prefer service-role if available; fallback to public path)
    const baseUrl = Deno.env.get("SUPABASE_URL");
    const bucket = "courses";
    const objectPath = `${validCourseId}/course.json`;

    if (!baseUrl) {
      throw new Error("SUPABASE_URL is required");
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    let storageUrl = "";
    let headers: Record<string, string> = {};

    if (serviceKey && serviceKey.length > 0) {
      // Direct object fetch with service role auth (works for private buckets; bucket may remain private)
      storageUrl = `${baseUrl}/storage/v1/object/${bucket}/${objectPath}`;
      headers["Authorization"] = `Bearer ${serviceKey}`;
    } else {
      // Fallback to public bucket path
      storageUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
    }

    const fileResp = await fetch(storageUrl, { headers });
    if (!fileResp.ok) {
      console.error(
        `[get-course] Storage fetch failed for ${objectPath}: ${fileResp.status} ${fileResp.statusText}`,
      );
      return Errors.notFound("Course", reqId, req);
    }

    const text = await fileResp.text();
    const json = JSON.parse(text);

    // Normalize into a single extensible envelope shape (Dawn parity).
    // If we had older nested schemas in storage, we migrate them to the canonical practice schema.
    let migrated = false;
    let normalizedJson: any = json;
    try {
      const normalized = normalizeCourseJson(validCourseId, json);
      migrated = normalized.migrated;
      normalizedJson = normalized.normalized;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[get-course] normalize error:", msg);
      return Errors.invalidRequest(msg, reqId, req);
    }

    // If we migrated, best-effort persist back to storage so future reads are consistent.
    // Requires service role key; if missing we still return normalized response but log loudly.
    if (migrated) {
      if (!serviceKey) {
        console.error("[get-course] Migration needed but SUPABASE_SERVICE_ROLE_KEY is missing; cannot persist normalization.");
      } else {
        try {
          const supabase = createClient(baseUrl, serviceKey);
          const blob = new Blob([JSON.stringify(normalizedJson, null, 2)], { type: "application/json" });
          const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(objectPath, blob, { upsert: true, contentType: "application/json" });
          if (upErr) {
            console.error("[get-course] Failed to persist migrated course.json:", upErr);
          } else {
            console.log(`[get-course] Migrated legacy course schema for ${validCourseId} -> envelope/practice and persisted`);
          }
        } catch (e) {
          console.error("[get-course] Persist migration error:", e);
        }
      }
    }

    // Generate weak ETag from content hash
    const encoder = new TextEncoder();
    const normalizedText = JSON.stringify(normalizedJson);
    const data = encoder.encode(normalizedText);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const etag = `W/"${hashArray.map(b => b.toString(16).padStart(2, "0")).join("")}"`;
    
    // Build cache headers only; CORS headers are injected by withCors
    // IMPORTANT: course.json can be mutated shortly after first load (e.g. media-runner attaching stimuli).
    // Shared caching (CDN) must not serve stale course payloads for minutes after a mutation.
    // We keep ETag support for conditional requests, but require revalidation on every shared-cache hit.
    const cacheHeaders: Record<string, string> = {
      "Cache-Control": "public, max-age=0, s-maxage=0, must-revalidate",
      "ETag": etag,
      "Age": "0",
      "X-Request-Id": reqId,
      "Content-Type": "application/json",
    };
    
    // Support 304 Not Modified
    if (ifNoneMatch === etag) {
      console.log(`[get-course] ETag match for ${validCourseId}, returning 304`);
      return new Response(null, {
        headers: cacheHeaders,
        status: 304,
      });
    }
    
    // HEAD request: return headers only
    if (req.method === "HEAD") {
      console.log(`[get-course] HEAD request for ${validCourseId}`);
      return new Response(null, {
        headers: cacheHeaders,
        status: 200,
      });
    }
    
    console.log(`[get-course] ✓ Successfully loaded course: ${validCourseId}`);

    const extraHeaders: Record<string, string> = migrated ? { "X-Course-Migrated": "1" } : {};

    return new Response(JSON.stringify(normalizedJson), {
      headers: cacheHeaders,
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Errors.internal(message, reqId, req);
  }
}));


