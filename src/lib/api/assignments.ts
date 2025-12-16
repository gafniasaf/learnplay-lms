import { callEdgeFunctionGet, ApiError, getSupabaseUrl } from "./common";

export interface CreateAssignmentRequest {
  orgId?: string; // Optional - derived from user's auth context by edge function
  courseId: string;
  title?: string;
  dueAt?: string;
  assignees: Array<
    | { type: "class"; classId: string }
    | { type: "student"; userId: string }
  >;
}

export interface CreateAssignmentResponse {
  assignmentId: string;
  message: string;
}

export interface Assignment {
  id: string;
  org_id?: string;
  course_id: string;
  title: string;
  due_at: string | null;
  created_at: string;
  created_by?: string;
}

export interface ListAssignmentsResponse {
  assignments: Assignment[];
  scope: "teacher" | "student";
}

export interface AssignmentProgressRow {
  studentId: string;
  name: string;
  attempts: number;
  correct: number;
  accuracy: number;
  completed: boolean;
  lastActivity: string | null;
}

export interface AssignmentProgressResponse {
  rows: AssignmentProgressRow[];
  assignmentTitle: string;
}

/**
 * Create a new assignment (teacher only)
 */
export async function createAssignment(
  request: CreateAssignmentRequest
): Promise<CreateAssignmentResponse> {
  console.info("[createAssignment]", request);

  const supabaseUrl = getSupabaseUrl();

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/create-assignment`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new ApiError(
      `Failed to create assignment: ${errorText}`,
      "CREATE_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[createAssignment][ok]", data);

  return data;
}

/**
 * List assignments for teachers (convenience wrapper)
 */
export async function listAssignmentsForTeacher(): Promise<ListAssignmentsResponse> {
  return listAssignments();
}

/**
 * List assignments for students (calls student-specific endpoint)
 */
export async function listAssignmentsForStudent(): Promise<ListAssignmentsResponse> {
  console.info("[listAssignmentsForStudent]");

  try {
    return await callEdgeFunctionGet<ListAssignmentsResponse>(
      "list-assignments-student"
    );
  } catch (error) {
    // Fail loudly: returning empty arrays hides missing backend functionality.
    console.error("[listAssignmentsForStudent] Backend error", error);
    throw error;
  }
}

/**
 * List assignments (automatically filtered by RLS)
 */
export async function listAssignments(): Promise<ListAssignmentsResponse> {
  console.info("[listAssignments]");

  return callEdgeFunctionGet<ListAssignmentsResponse>("list-assignments");
}

/**
 * Get per-student progress for an assignment
 */
export async function getAssignmentProgress(
  assignmentId: string
): Promise<AssignmentProgressResponse> {
  console.info("[getAssignmentProgress]", { assignmentId });

  return callEdgeFunctionGet<AssignmentProgressResponse>(
    "get-assignment-progress",
    { assignmentId }
  );
}

/**
 * Assign students to an assignment
 */
export interface AssignAssigneesInput {
  assignmentId: string;
  studentIds: string[];
}

export async function assignAssignees(
  input: AssignAssigneesInput
): Promise<any> {
  console.info("[assignAssignees]", input);

  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke("assign-assignees", {
    body: input,
  });

  if (error) {
    console.error("[assignAssignees][error]", error);
    throw error;
  }

  console.info("[assignAssignees][ok]", data);
  return data;
}

/**
 * Export gradebook CSV for an assignment
 */
export async function exportGradebook(assignmentId: string): Promise<Blob> {
  console.info("[exportGradebook]", { assignmentId });

  const supabaseUrl = getSupabaseUrl();

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/export-gradebook?assignmentId=${assignmentId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new ApiError(
      `Failed to export gradebook: ${errorText}`,
      "EXPORT_FAILED",
      res.status
    );
  }

  const blob = await res.blob();
  console.info("[exportGradebook][ok]");

  return blob;
}
