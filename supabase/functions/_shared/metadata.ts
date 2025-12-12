// supabase/functions/_shared/metadata.ts
// Helper to upsert course metadata consistently.

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

  const orgResult = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const orgId = orgResult?.data?.id;
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

  const { error: metadataErr } = await supabase
    .from("course_metadata")
    .upsert({
      id: courseId,
      organization_id: orgId,
      tag_ids: content.tag_ids ?? [],
      visibility,
      content_version: content.contentVersion ?? courseJson?.version ?? 1,
      tags,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (metadataErr) {
    throw new Error(`Failed to upsert course_metadata: ${metadataErr.message ?? String(metadataErr)}`);
  }

  const { error: coursesErr } = await supabase
    .from("courses")
    .upsert({
      id: courseId,
      name: title,
      subject: content.subject || "General",
      grade_band: content.gradeBand || "All Grades",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (coursesErr) {
    throw new Error(`Failed to upsert courses: ${coursesErr.message ?? String(coursesErr)}`);
  }

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


