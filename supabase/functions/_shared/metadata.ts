// supabase/functions/_shared/metadata.ts
// Helper to upsert course metadata consistently.

// Minimal Deno shim for local TypeScript tooling
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: { env: { get(key: string): string | undefined } } | any;

interface SupabaseClientLike {
  from(table: string): SupabaseClientLike;
  select(columns?: string): SupabaseClientLike;
  order(column: string, options: { ascending: boolean }): SupabaseClientLike;
  limit(count: number): SupabaseClientLike;
  maybeSingle(): Promise<{ data: { id: string } | null }>;
  upsert(values: any, options?: any): Promise<{ data: any; error: any }>;
  insert(values: any): Promise<{ data: any; error: any }>;
  rpc(functionName: string): Promise<{ data: any; error: any }>;
}

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function coerceIntVersion(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.floor(value));
  if (typeof value === "string") {
    const s = value.trim();
    // Only accept plain integers; reject things like "skeleton-..." / "placeholder-..."
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) return Math.max(1, Math.floor(n));
    }
  }
  return 1;
}

export async function upsertCourseMetadata(
  supabase: SupabaseClientLike,
  courseId: string,
  courseJson: any,
): Promise<void> {
  const isEnvelope =
    courseJson &&
    typeof courseJson === "object" &&
    "content" in courseJson &&
    "format" in courseJson;
  const content = isEnvelope ? (courseJson.content ?? {}) : courseJson;
  const format = isEnvelope ? String(courseJson.format ?? "practice") : "practice";

  // Prefer explicit org identity when available.
  // - In live deployments, ORGANIZATION_ID should be set as an Edge secret.
  // - Some callsites may include organization_id / organizationId in the payload.
  const explicitOrg =
    (isUuid((content as any)?.organization_id) ? (content as any).organization_id : null) ??
    (isUuid((content as any)?.organizationId) ? (content as any).organizationId : null) ??
    (isUuid((courseJson as any)?.organization_id) ? (courseJson as any).organization_id : null) ??
    (isUuid((courseJson as any)?.organizationId) ? (courseJson as any).organizationId : null) ??
    (isUuid(Deno?.env?.get?.("ORGANIZATION_ID")) ? Deno.env.get("ORGANIZATION_ID") : null) ??
    null;

  let orgId: string | null = explicitOrg;
  if (!orgId) {
    const orgResult = await supabase
      .from("organizations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    orgId = orgResult?.data?.id ?? null;
  }

  if (!orgId) {
    throw new Error("No organizations found; cannot upsert course metadata");
  }

  const title = content.title || courseId;
  const tags = {
    ...(content.tags ?? {}),
    __format: format,
  };

  const rawVisibility = String(content.visibility ?? "org");
  const visibility =
    rawVisibility === "public"
      ? "global"
      : rawVisibility === "org" || rawVisibility === "global"
        ? rawVisibility
        : null;

  if (!visibility) {
    throw new Error(`Invalid visibility '${rawVisibility}'. Expected 'org' or 'global'.`);
  }

  // course_metadata.content_version is an INT in Postgres, but CourseSchema uses contentVersion as a STRING.
  // We only store numeric versions here. Non-numeric contentVersion strings must NOT be written into INT fields.
  const numericContentVersion = coerceIntVersion(
    // Prefer envelope version when present (can be string or number)
    isEnvelope ? (courseJson as any)?.version : undefined,
  );

  const { error: metadataErr } = await supabase
    .from("course_metadata")
    .upsert({
      id: courseId,
      organization_id: orgId,
      tag_ids: content.tag_ids ?? [],
      visibility,
      content_version: numericContentVersion,
      tags,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (metadataErr) {
    throw new Error(`Failed to upsert course_metadata: ${metadataErr.message ?? String(metadataErr)}`);
  }

  // NOTE: This repo's canonical relational index is course_metadata.
  // Some older prototypes had a separate `courses` table; do not assume it exists.

  try {
    const { data: versionNum } = await supabase.rpc("get_next_catalog_version");
    await supabase
      .from("catalog_updates")
      .insert({
        course_id: courseId,
        action: "added",
        catalog_version: versionNum || 1,
        course_title: title,
      });
  } catch (_err) {
    // non-fatal
  }
}


