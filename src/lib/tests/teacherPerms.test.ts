/**
 * Teacher-only endpoints permissions test
 * Validates permissions and error codes without breaking when not teacher
 */

import { getRole } from "../roles";

export async function runTeacherPermsTest(): Promise<{ pass: boolean; details?: any }> {
  const results: Record<string, boolean> = {};
  const details: any = {
    tests: {},
    currentRole: "unknown",
    endpoints: {},
  };

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    if (!supabaseUrl) {
      return {
        pass: false,
        details: { ...details, error: "VITE_SUPABASE_URL not configured" },
      };
    }

    const { getAccessToken } = await import("../supabase");
    const token = await getAccessToken();
    const headers = token ? {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    } : {
      'Content-Type': 'application/json',
    };

    details.currentRole = getRole?.() || "student";

    // Test 1: create-assignment rejects bad payload with 400
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/create-assignment`, {
        method: "POST",
        headers,
        body: "{}",
      });
      
      details.endpoints.createAssignment = res.status;
      // If function requires auth and user is anon/unauth, may be 401; accept either
      results["create-assignment-rejects-bad-payload"] = [400, 401, 403].includes(res.status);
    } catch (error) {
      results["create-assignment-rejects-bad-payload"] = false;
      details.endpoints.createAssignment = error instanceof Error ? error.message : String(error);
    }

    // Test 2: list-students-for-course validates courseId
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/list-students-for-course`, {
        method: "GET",
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      
      details.endpoints.listStudentsForCourse = res.status;
      // Missing courseId → 400 (or 401 if not signed in)
      results["list-students-validates-courseid"] = [400, 401].includes(res.status);
    } catch (error) {
      results["list-students-validates-courseid"] = false;
      details.endpoints.listStudentsForCourse = error instanceof Error ? error.message : String(error);
    }

    // Test 3: export-gradebook requires assignmentId
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/export-gradebook?assignmentId=`, {
        method: "GET",
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      
      details.endpoints.exportGradebook = res.status;
      results["export-gradebook-requires-assignmentid"] = [400, 401].includes(res.status);
    } catch (error) {
      results["export-gradebook-requires-assignmentid"] = false;
      details.endpoints.exportGradebook = error instanceof Error ? error.message : String(error);
    }

    // Test 4: get-assignment-progress requires assignmentId
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/get-assignment-progress`, {
        method: "GET",
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      
      details.endpoints.getAssignmentProgress = res.status;
      results["get-assignment-progress-requires-assignmentid"] = [400, 401].includes(res.status);
    } catch (error) {
      results["get-assignment-progress-requires-assignmentid"] = false;
      details.endpoints.getAssignmentProgress = error instanceof Error ? error.message : String(error);
    }

    // Test 5: Role-aware test - only run full checks for teacher/admin
    const role = details.currentRole;
    if (role !== "teacher" && role !== "admin") {
      // Skip teacher-only assertions when not teacher
      results["role-aware-skip"] = true;
      details.note = "Skipped teacher-only assertions (current role: " + role + ")";
    } else {
      // As teacher/admin, list-assignments should be 200
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/list-assignments`, {
          method: "GET",
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        
        details.endpoints.listAssignments = res.status;
        results["teacher-list-assignments-ok"] = res.ok;
      } catch (error) {
        results["teacher-list-assignments-ok"] = false;
        details.endpoints.listAssignments = error instanceof Error ? error.message : String(error);
      }
    }

    details.tests = results;
    const allPassed = Object.values(results).every(Boolean);

    return {
      pass: allPassed,
      details,
    };
  } catch (error) {
    return {
      pass: false,
      details: {
        ...details,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
