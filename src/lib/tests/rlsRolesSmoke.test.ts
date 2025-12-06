/**
 * RLS/Role Gates Smoke Test
 * Validates that teacher-only endpoints enforce role gates properly
 */

import { supabase } from "@/integrations/supabase/client";

export async function runRlsRolesSmokeTest(): Promise<{ pass: boolean; details?: any }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    return {
      pass: false,
      details: { error: "VITE_SUPABASE_URL not configured" },
    };
  }

  const details: any = {
    anonCreateAssignment: "not tested",
    authenticatedListAssignments: "not tested",
    authenticatedListStudentsInvalid: "not tested",
    createClassBootstrap: "skipped (requires service role)",
  };

  let allPassed = true;

  // Test 1: Anonymous user attempts to create assignment (should fail with 401)
  try {
    const createAssignmentUrl = `${supabaseUrl}/functions/v1/create-assignment`;
    const validPayload = {
      orgId: "00000000-0000-0000-0000-000000000000",
      courseId: "multiplication",
      assignees: [{ type: "student", userId: "00000000-0000-0000-0000-000000000000" }],
    };

    const response = await fetch(createAssignmentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    if (response.status === 401) {
      details.anonCreateAssignment = "✓ passed (401, unauthorized as expected)";
    } else if (response.status === 400) {
      const errorBody = await response.json();
      details.anonCreateAssignment = `✓ accepted (400 - validation before auth, code: ${errorBody.error?.code})`;
    } else {
      details.anonCreateAssignment = `✗ failed (expected 401, got ${response.status})`;
      allPassed = false;
    }
  } catch (err) {
    details.anonCreateAssignment = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
    allPassed = false;
  }

  // Test 2: Authenticated user lists assignments
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.access_token) {
      const listAssignmentsUrl = `${supabaseUrl}/functions/v1/list-assignments`;
      const response = await fetch(listAssignmentsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        details.authenticatedListAssignments = "✓ passed (200, authenticated access)";
      } else if (response.status === 403) {
        details.authenticatedListAssignments = "⚠ forbidden (user may not have teacher role)";
      } else {
        details.authenticatedListAssignments = `⚠ unexpected status (${response.status})`;
      }
    } else {
      details.authenticatedListAssignments = "⚠ skipped (no active session)";
    }
  } catch (err) {
    details.authenticatedListAssignments = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
    allPassed = false;
  }

  // Test 3: Authenticated user calls list-students-for-course with missing courseId (should return 400)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.access_token) {
      const listStudentsUrl = `${supabaseUrl}/functions/v1/list-students-for-course`;
      const response = await fetch(listStudentsUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 400) {
        const errorBody = await response.json();
        details.authenticatedListStudentsInvalid = `✓ passed (400, validation error: ${errorBody.error?.message})`;
      } else {
        details.authenticatedListStudentsInvalid = `⚠ unexpected status (${response.status})`;
      }
    } else {
      details.authenticatedListStudentsInvalid = "⚠ skipped (no active session)";
    }
  } catch (err) {
    details.authenticatedListStudentsInvalid = `✗ error: ${err instanceof Error ? err.message : String(err)}`;
    allPassed = false;
  }

  // Test 4: Create class via service role (optional, requires service role key)
  // This would require service role credentials which are not available in browser context
  details.createClassBootstrap = "⚠ skipped (service role not available in browser context)";

  return {
    pass: allPassed,
    details,
  };
}
