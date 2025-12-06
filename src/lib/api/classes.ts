import { callEdgeFunctionGet, ApiError } from "./common";

export interface Class {
  id: string;
  name: string;
  description?: string;
  owner: string;
  org_id: string;
  created_at: string;
  student_count?: number;
  class_members?: Array<{
    user_id: string;
    role: string;
    email: string | null;
    profiles: {
      id: string;
      full_name: string;
    };
  }>;
}

export interface ListClassesResponse {
  classes: Class[];
}

export interface Student {
  id: string;
  name: string;
  classIds: string[];
}

export interface ListStudentsResponse {
  students: Student[];
}

/**
 * List classes for the current teacher
 */
export async function listClasses(): Promise<ListClassesResponse> {
  console.info("[listClasses]");
  return callEdgeFunctionGet<ListClassesResponse>("list-classes");
}

/**
 * List students in teacher's org
 */
export async function listOrgStudents(): Promise<ListStudentsResponse> {
  console.info("[listOrgStudents]");
  return callEdgeFunctionGet<ListStudentsResponse>("list-org-students");
}

/**
 * List students enrolled in a specific course (teacher only)
 */
export async function listStudentsForCourse(
  courseId: string
): Promise<{ students: any[] }> {
  console.info("[listStudentsForCourse]", { courseId });

  return callEdgeFunctionGet<{ students: any[] }>("list-students-for-course", {
    courseId,
  });
}

/**
 * Create a new class (owner-based)
 */
export async function createClass(input: {
  name: string;
  description?: string;
}): Promise<{
  class: {
    id: string;
    name: string;
    description?: string;
    owner: string;
    created_at: string;
  };
}> {
  console.info("[createClass]", input);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/create-class`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new ApiError(
      `Failed to create class: ${errorText}`,
      "CREATE_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[createClass][ok]");

  return data;
}

/**
 * Add a student to a class by email
 */
export async function addClassMember(input: {
  classId: string;
  studentEmail: string;
}): Promise<{ ok: boolean }> {
  console.info("[addClassMember]", input);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/add-class-member`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      throw new ApiError(
        `Failed to add class member: ${errorText}`,
        "ADD_MEMBER_FAILED",
        res.status
      );
    }

    if (errorData.error === "student_not_found") {
      throw new ApiError(
        "Student not found. They may need to create an account first.",
        "STUDENT_NOT_FOUND",
        404
      );
    }

    throw new ApiError(
      `Failed to add class member: ${errorData.error || errorText}`,
      errorData.error || "ADD_MEMBER_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[addClassMember][ok]");

  return data;
}

/**
 * Remove a student from a class
 */
export async function removeClassMember(input: {
  classId: string;
  studentId: string;
}): Promise<{ ok: boolean }> {
  console.info("[removeClassMember]", input);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/remove-class-member`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new ApiError(
      `Failed to remove class member: ${errorText}`,
      "REMOVE_MEMBER_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[removeClassMember][ok]");

  return data;
}

/**
 * Invite a student to a class
 */
export async function inviteStudent(
  orgId: string,
  classId: string,
  email: string
): Promise<{
  success: boolean;
  message: string;
  userExists?: boolean;
  invite?: any;
}> {
  console.info("[inviteStudent]", { orgId, classId, email });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/invite-student`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orgId, classId, email }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new ApiError(
      `Failed to invite student: ${errorText}`,
      "INVITE_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[inviteStudent][ok]");

  return data;
}

/**
 * Get class roster with students and pending invites
 */
export async function getClassRoster(classId: string): Promise<{
  roster: Array<{
    userId: string;
    name: string;
    role: string;
    status: string;
  }>;
  pendingInvites: Array<{
    id: string;
    email: string;
    createdAt: string;
    expiresAt: string;
    status: string;
  }>;
  className: string;
}> {
  console.info("[getClassRoster]", { classId });

  return callEdgeFunctionGet<{
    roster: Array<{
      userId: string;
      name: string;
      role: string;
      status: string;
    }>;
    pendingInvites: Array<{
      id: string;
      email: string;
      createdAt: string;
      expiresAt: string;
      status: string;
    }>;
    className: string;
  }>("get-class-roster", { classId });
}

/**
 * Generate or get class join code
 */
export async function generateClassCode(
  classId: string,
  refreshCode: boolean = false
): Promise<{ code: string; expiresAt: string; isNew: boolean }> {
  console.info("[generateClassCode]", { classId, refreshCode });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/generate-class-code`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ classId, refreshCode }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new ApiError(
      `Failed to generate class code: ${errorText}`,
      "GENERATE_CODE_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[generateClassCode][ok]", { code: data.code });

  return data;
}

/**
 * Join a class using a join code
 */
export async function joinClass(code: string): Promise<{
  success: boolean;
  message: string;
  className: string;
  classId: string;
}> {
  console.info("[joinClass]", { code: code.substring(0, 2) + "****" });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/join-class`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code: code.toUpperCase() }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    const errorData = JSON.parse(errorText);
    throw new ApiError(
      errorData.message || `Failed to join class: ${errorText}`,
      errorData.error?.code || "JOIN_CLASS_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[joinClass][ok]", { className: data.className });

  return data;
}

/**
 * Create a child code for parent linking
 */
export async function createChildCode(studentId: string): Promise<{
  code: string;
  expiresAt: string;
  isNew: boolean;
}> {
  console.info("[createChildCode]", { studentId });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/create-child-code`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ studentId }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new ApiError(
      `Failed to create child code: ${errorText}`,
      "CREATE_CODE_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[createChildCode][ok]");

  return data;
}

/**
 * Link a child to a parent using a code
 */
export async function linkChild(code: string): Promise<{
  success: boolean;
  message: string;
  childName?: string;
  alreadyLinked?: boolean;
}> {
  console.info("[linkChild]", { code });

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new ApiError(
      "VITE_SUPABASE_URL is not configured",
      "CONFIG_ERROR"
    );
  }

  const { getAccessToken } = await import("../supabase");
  const token = await getAccessToken();

  if (!token) {
    throw new ApiError(
      "User not authenticated",
      "UNAUTHORIZED",
      401
    );
  }

  const url = `${supabaseUrl}/functions/v1/link-child`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new ApiError(
      `Failed to link child: ${errorText}`,
      "LINK_CHILD_FAILED",
      res.status
    );
  }

  const data = await res.json();
  console.info("[linkChild][ok]");

  return data;
}
