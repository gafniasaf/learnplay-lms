# Classes & Assignments API

High-signal docs for class and assignment endpoints. All paths are under `/functions/v1/*`. Auth is required unless noted. For full details, see the function source under `supabase/functions/`.

## Classes

- create-class (POST)
  - Body:
    ```ts
    { name: string; description?: string; orgId?: string }
    ```
  - Returns:
    ```ts
    { class: { id: string; name: string; description: string | null; owner: string; org_id: string; created_at: string } }
    ```

- list-classes (GET)
  - Query: `orgId?`
  - Returns:
    ```ts
    { classes: Array<{ id: string; name: string; description: string | null; owner: string; org_id: string; created_at: string; student_count: number; class_members: Array<{ user_id: string; role: string; email?: string | null }> }> }
    ```

- generate-class-code (POST)
  - Returns: `{ code: string; expiresAt: string }`

- join-class (POST)
  - Body:
    ```ts
    { code: string /* 6-char uppercase/digits */ }
    ```
  - Returns:
    ```ts
    { success: true; message: string; className: string; classId: string; alreadyMember: boolean; requestId: string }
    ```

- add-class-member (POST) / remove-class-member (POST)
  - Body (typical): `{ classId: string; userId: string; role: 'student' | 'teacher' }`
  - Returns: `{ success: boolean }`

## Assignments

- create-assignment (POST)
  - Body:
    ```ts
    {
      orgId: string;
      courseId: string;
      title?: string;
      dueAt?: string; // ISO
      assignees: Array<{ type: 'class' | 'student'; classId?: string; userId?: string }>
    }
    ```
  - Returns:
    ```ts
    { assignmentId: string; message: string }
    ```

- list-assignments (GET)
  - Query: `orgId?`, `limit?` (default 100)
  - Returns: `{ assignments: Array<{ id: string; org_id: string; course_id: string; title: string; due_at: string | null; created_at: string; created_by: string }> }`

- list-assignments-student (GET)
  - Query: `studentId?` (defaults to self)
  - Returns: `{ assignments: Array<{ id: string; title: string; course_id: string; due_at: string | null; status: string; progress_pct: number }> }`

- get-assignment-progress (GET)
  - Query: `assignmentId`
  - Returns: aggregate progress (shape varies; see source)

- assign-assignees (POST)
  - Body: `{ assignmentId: string; assignees: Array<{ type: 'class' | 'student'; classId?: string; userId?: string }> }`
  - Returns: `{ assigned: number }`

- check-assignment-completion (POST)
  - Body: `{ assignmentId: string }`
  - Returns: `{ completed: number; total: number }`

- get-auto-assign-settings (GET) / update-auto-assign-settings (POST)
  - Read/Write organization auto-assign configuration

Notes
- Most endpoints perform role checks (teacher/school_admin) and rely on RLS. Service-role operations are used internally where necessary.
- Error format is standardized via `_shared/error.ts` where used (codes like invalid_request, invalid_auth, forbidden).
