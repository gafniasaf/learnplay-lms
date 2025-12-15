import { withCors, getRequestId } from "../_shared/cors.ts";
import { Errors } from "../_shared/error.ts";
import { idStr } from "../_shared/validation.ts";
import { authenticateRequest } from "../_shared/auth.ts";

type CourseEnvelope = {
  id?: string;
  format: string;
  version?: string | number;
  content: unknown;
};

function isEnvelope(x: any): x is CourseEnvelope {
  return !!x && typeof x === "object" && "content" in x && "format" in x;
}

function unwrapCourse(raw: any): any {
  if (isEnvelope(raw)) return (raw as any).content;
  return raw;
}

async function fetchCourseJson(courseId: string): Promise<any | null> {
  const baseUrl = Deno.env.get("SUPABASE_URL") || "";
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!baseUrl) throw new Error("SUPABASE_URL is required");

  const publicUrl = `${baseUrl}/storage/v1/object/public/courses/${courseId}/course.json`;
  const privateUrl = `${baseUrl}/storage/v1/object/courses/${courseId}/course.json`;

  // Prefer service-role for private buckets when available.
  const url = sr ? privateUrl : publicUrl;
  const resp = await fetch(url, { headers: sr ? { Authorization: `Bearer ${sr}` } : undefined });
  if (!resp.ok) return null;
  return await resp.json();
}

/**
 * Variants audit:
 * - Computes a coverage score for "variant completeness" per clusterId.
 * - Emits an empty mergePlan (audit-only).
 *
 * NOTE: This is intentionally lightweight and deterministic; generation of missing variants
 * is handled separately by generate-variants-missing.
 */
Deno.serve(
  withCors(async (req: Request) => {
    const reqId = getRequestId(req);

    if (req.method !== "POST") return Errors.methodNotAllowed(req.method, reqId, req);
    // Allow either agent token OR user session.
    // This endpoint is used by the Course Editor publish preflight.
    await authenticateRequest(req);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return Errors.invalidRequest("Invalid JSON body", reqId, req);
    }

    const v = idStr.safeParse(body?.courseId);
    if (!v.success) {
      return Errors.invalidRequest("Invalid courseId", reqId, req);
    }
    const courseId = v.data;

    const raw = await fetchCourseJson(courseId);
    const course = unwrapCourse(raw);
    const items: any[] = Array.isArray(course?.items) ? course.items : [];

    // Group by clusterId and track which variants exist.
    const byCluster = new Map<string, Set<string>>();
    for (const it of items) {
      const clusterId = typeof it?.clusterId === "string" ? it.clusterId : "";
      const variant = typeof it?.variant === "string" ? it.variant : "";
      if (!clusterId) continue;
      if (!byCluster.has(clusterId)) byCluster.set(clusterId, new Set());
      if (variant) byCluster.get(clusterId)!.add(variant);
    }

    const requiredVariants = ["1", "2", "3"];
    const clusters = Array.from(byCluster.entries());
    const totalClusters = clusters.length;
    let completeClusters = 0;
    const missing: Array<{ clusterId: string; missingVariants: string[] }> = [];

    for (const [clusterId, set] of clusters) {
      const miss = requiredVariants.filter((v) => !set.has(v));
      if (miss.length === 0) completeClusters += 1;
      else missing.push({ clusterId, missingVariants: miss });
    }

    // If we have no clusters (edge case), treat as fully covered to avoid blocking.
    const coverage = totalClusters > 0 ? completeClusters / totalClusters : 1.0;

    const report = {
      ok: true,
      axes: ["difficulty"],
      coverage,
      totals: {
        clusters: totalClusters,
        complete: completeClusters,
        missing: missing.length,
      },
      missing: missing.slice(0, 200),
    };

    return new Response(JSON.stringify({ ok: true, report, mergePlan: { patch: [] }, requestId: reqId }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": reqId },
    });
  }),
);

