
// ------------------------------------------------------------------
// ⚠️ AUTO-GENERATED FROM system-manifest.json
// ------------------------------------------------------------------
import { z } from 'zod';


export const LearnerProfileSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  full_name: z.string().optional(),
  avatar_url: z.string().optional(),
  grade_level: z.string().optional(),
  weekly_goal_minutes: z.number().optional(),
  current_assignment_id: z.string().optional(),
  goal_status: z.string().optional(),
  insights_snapshot: z.any().optional()
});
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;


export const AssignmentSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  title: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'in_progress', 'graded', 'archived']),
  subject: z.string().optional(),
  due_date: z.string().datetime().optional(),
  adaptive_cluster_id: z.string().optional(),
  ai_variant_id: z.string().optional(),
  learner_id: z.string().optional(),
  teacher_id: z.string().optional(),
  rubric: z.any().optional(),
  attachments: z.any().optional()
});
export type Assignment = z.infer<typeof AssignmentSchema>;


export const CourseBlueprintSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  title: z.string().optional(),
  subject: z.string().optional(),
  difficulty: z.enum(['elementary', 'middle', 'high', 'college']),
  catalog_path: z.string().optional(),
  multimedia_manifest: z.any().optional(),
  guard_status: z.enum(['pending', 'passed', 'failed']),
  published: z.boolean().optional(),
  notes: z.string().optional(),
  game_type: z.enum(['mcq', 'audio_mcq', 'visual_mcq', 'drag_drop', 'matching', 'ordering', 'timed_fluency', 'numeric', 'diagram'])
});
export type CourseBlueprint = z.infer<typeof CourseBlueprintSchema>;


export const GameSessionSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  assignment_id: z.string().optional(),
  course_id: z.string().optional(),
  level: z.number().optional(),
  status: z.enum(['active', 'completed', 'abandoned']),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  score: z.number().optional(),
  accuracy: z.number().optional(),
  content_version: z.string().optional()
});
export type GameSession = z.infer<typeof GameSessionSchema>;


export const MessageThreadSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  title: z.string().optional(),
  participant_ids: z.any().optional(),
  last_message: z.string().optional(),
  unread_counts: z.any().optional(),
  pinned: z.boolean().optional()
});
export type MessageThread = z.infer<typeof MessageThreadSchema>;


export const JobTicketSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  job_type: z.string().optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  payload: z.any().optional(),
  result: z.any().optional(),
  target_id: z.string().optional()
});
export type JobTicket = z.infer<typeof JobTicketSchema>;


export const MasteryStateSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  student_id: z.string().optional(),
  ko_id: z.string().optional(),
  mastery: z.number().optional(),
  status: z.enum(['locked', 'in-progress', 'mastered']),
  evidence_count: z.number().optional(),
  last_practiced: z.string().datetime().optional()
});
export type MasteryState = z.infer<typeof MasteryStateSchema>;


export const StudentGoalSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  student_id: z.string().optional(),
  title: z.string().optional(),
  target_minutes: z.number().optional(),
  progress_minutes: z.number().optional(),
  status: z.enum(['on_track', 'behind', 'completed']),
  due_at: z.string().datetime().optional()
});
export type StudentGoal = z.infer<typeof StudentGoalSchema>;


export const ClassMembershipSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  class_id: z.string().optional(),
  user_id: z.string().optional(),
  role: z.enum(['student', 'teacher'])
});
export type ClassMembership = z.infer<typeof ClassMembershipSchema>;


export const SessionEventSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  assignment_id: z.string().optional(),
  question_ref: z.string().optional(),
  outcome: z.enum(['correct', 'incorrect', 'skipped', 'hint']),
  duration_seconds: z.number().optional(),
  transcript: z.string().optional(),
  confidence_score: z.number().optional()
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;


export const GoalUpdateSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  version: z.number().int().default(1),
  format: z.string().default('v1'),
  learner_id: z.string().optional(),
  week_of: z.string().datetime().optional(),
  target_minutes: z.number().optional(),
  note: z.string().optional()
});
export type GoalUpdate = z.infer<typeof GoalUpdateSchema>;


// --- Agent Job Contracts (Strict) ---

export const JobPayloadSchema = z.discriminatedUnion('jobType', [

  z.object({
    jobType: z.literal('draft_assignment_plan'),
    learnerprofileId: z.string().uuid().optional(), 
    payload: z.record(z.any()).optional().describe("Input for draft_assignment_plan")
  }),

  z.object({
    jobType: z.literal('ai_course_generate'),
    learnerprofileId: z.string().uuid().optional(), 
    payload: z.record(z.any()).optional().describe("Input for ai_course_generate")
  }),

  z.object({
    jobType: z.literal('guard_course'),
    learnerprofileId: z.string().uuid().optional(), 
    payload: z.record(z.any()).optional().describe("Input for guard_course")
  }),

  z.object({
    jobType: z.literal('compile_mockups'),
    learnerprofileId: z.string().uuid().optional(), 
    payload: z.record(z.any()).optional().describe("Input for compile_mockups")
  }),

  z.object({
    jobType: z.literal('plan_matrix_run'),
    learnerprofileId: z.string().uuid().optional(), 
    payload: z.record(z.any()).optional().describe("Input for plan_matrix_run")
  })
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;


// --- Entity Field Definitions (for Smart Inputs) ---
export const ENTITY_FIELDS = {
  "LearnerProfile": [
    {
      "key": "full_name",
      "type": "string"
    },
    {
      "key": "avatar_url",
      "type": "string"
    },
    {
      "key": "grade_level",
      "type": "string"
    },
    {
      "key": "weekly_goal_minutes",
      "type": "number"
    },
    {
      "key": "current_assignment_id",
      "type": "string"
    },
    {
      "key": "goal_status",
      "type": "string"
    },
    {
      "key": "insights_snapshot",
      "type": "json"
    }
  ],
  "Assignment": [
    {
      "key": "title",
      "type": "string"
    },
    {
      "key": "status",
      "type": "enum",
      "options": [
        "draft",
        "scheduled",
        "in_progress",
        "graded",
        "archived"
      ]
    },
    {
      "key": "subject",
      "type": "string"
    },
    {
      "key": "due_date",
      "type": "date"
    },
    {
      "key": "adaptive_cluster_id",
      "type": "string"
    },
    {
      "key": "ai_variant_id",
      "type": "string"
    },
    {
      "key": "learner_id",
      "type": "string"
    },
    {
      "key": "teacher_id",
      "type": "string"
    },
    {
      "key": "rubric",
      "type": "json"
    },
    {
      "key": "attachments",
      "type": "json"
    }
  ],
  "CourseBlueprint": [
    {
      "key": "title",
      "type": "string"
    },
    {
      "key": "subject",
      "type": "string"
    },
    {
      "key": "difficulty",
      "type": "enum",
      "options": [
        "elementary",
        "middle",
        "high",
        "college"
      ]
    },
    {
      "key": "catalog_path",
      "type": "string"
    },
    {
      "key": "multimedia_manifest",
      "type": "json"
    },
    {
      "key": "guard_status",
      "type": "enum",
      "options": [
        "pending",
        "passed",
        "failed"
      ]
    },
    {
      "key": "published",
      "type": "boolean"
    },
    {
      "key": "notes",
      "type": "string"
    },
    {
      "key": "game_type",
      "type": "enum",
      "options": [
        "mcq",
        "audio_mcq",
        "visual_mcq",
        "drag_drop",
        "matching",
        "ordering",
        "timed_fluency",
        "numeric",
        "diagram"
      ]
    }
  ],
  "GameSession": [
    {
      "key": "assignment_id",
      "type": "string"
    },
    {
      "key": "course_id",
      "type": "string"
    },
    {
      "key": "level",
      "type": "number"
    },
    {
      "key": "status",
      "type": "enum",
      "options": [
        "active",
        "completed",
        "abandoned"
      ]
    },
    {
      "key": "start_time",
      "type": "date"
    },
    {
      "key": "end_time",
      "type": "date"
    },
    {
      "key": "score",
      "type": "number"
    },
    {
      "key": "accuracy",
      "type": "number"
    },
    {
      "key": "content_version",
      "type": "string"
    }
  ],
  "MessageThread": [
    {
      "key": "title",
      "type": "string"
    },
    {
      "key": "participant_ids",
      "type": "json"
    },
    {
      "key": "last_message",
      "type": "string"
    },
    {
      "key": "unread_counts",
      "type": "json"
    },
    {
      "key": "pinned",
      "type": "boolean"
    }
  ],
  "JobTicket": [
    {
      "key": "job_type",
      "type": "string"
    },
    {
      "key": "status",
      "type": "enum",
      "options": [
        "queued",
        "running",
        "completed",
        "failed"
      ]
    },
    {
      "key": "payload",
      "type": "json"
    },
    {
      "key": "result",
      "type": "json"
    },
    {
      "key": "target_id",
      "type": "string"
    }
  ],
  "MasteryState": [
    {
      "key": "student_id",
      "type": "string"
    },
    {
      "key": "ko_id",
      "type": "string"
    },
    {
      "key": "mastery",
      "type": "number"
    },
    {
      "key": "status",
      "type": "enum",
      "options": [
        "locked",
        "in-progress",
        "mastered"
      ]
    },
    {
      "key": "evidence_count",
      "type": "number"
    },
    {
      "key": "last_practiced",
      "type": "date"
    }
  ],
  "StudentGoal": [
    {
      "key": "student_id",
      "type": "string"
    },
    {
      "key": "title",
      "type": "string"
    },
    {
      "key": "target_minutes",
      "type": "number"
    },
    {
      "key": "progress_minutes",
      "type": "number"
    },
    {
      "key": "status",
      "type": "enum",
      "options": [
        "on_track",
        "behind",
        "completed"
      ]
    },
    {
      "key": "due_at",
      "type": "date"
    }
  ],
  "ClassMembership": [
    {
      "key": "class_id",
      "type": "string"
    },
    {
      "key": "user_id",
      "type": "string"
    },
    {
      "key": "role",
      "type": "enum",
      "options": [
        "student",
        "teacher"
      ]
    }
  ],
  "SessionEvent": [
    {
      "key": "assignment_id",
      "type": "string"
    },
    {
      "key": "question_ref",
      "type": "string"
    },
    {
      "key": "outcome",
      "type": "enum",
      "options": [
        "correct",
        "incorrect",
        "skipped",
        "hint"
      ]
    },
    {
      "key": "duration_seconds",
      "type": "number"
    },
    {
      "key": "transcript",
      "type": "string"
    },
    {
      "key": "confidence_score",
      "type": "number"
    }
  ],
  "GoalUpdate": [
    {
      "key": "learner_id",
      "type": "string"
    },
    {
      "key": "week_of",
      "type": "date"
    },
    {
      "key": "target_minutes",
      "type": "number"
    },
    {
      "key": "note",
      "type": "string"
    }
  ]
} as const;

// --- Job Execution Modes ---
export const JOB_MODES = {
  "draft_assignment_plan": "synchronous",
  "ai_course_generate": "async",
  "guard_course": "synchronous",
  "compile_mockups": "async",
  "plan_matrix_run": "async"
} as const;

// --- Edge Function Schemas (for MCP typing) ---
export const EDGE_FUNCTION_SCHEMAS = [
  {
    "id": "validate-course-structure",
    "input": {
      "courseId": "string"
    },
    "output": {
      "ok": "boolean"
    }
  },
  {
    "id": "generate-variants-audit",
    "input": {
      "courseId": "string"
    },
    "output": {
      "ok": "boolean",
      "coverage": "number"
    }
  },
  {
    "id": "editor-repair-course",
    "input": {
      "courseId": "string",
      "apply": "boolean"
    },
    "output": {
      "ok": "boolean",
      "preview": "json"
    }
  },
  {
    "id": "editor-variants-missing",
    "input": {
      "courseId": "string",
      "apply": "boolean"
    },
    "output": {
      "ok": "boolean",
      "preview": "json"
    }
  },
  {
    "id": "editor-auto-fix",
    "input": {
      "courseId": "string",
      "apply": "boolean"
    },
    "output": {
      "ok": "boolean"
    }
  },
  {
    "id": "editor-co-pilot",
    "input": {
      "action": "string",
      "subject": "string",
      "format": "string",
      "courseId": "string",
      "locale": "string"
    },
    "output": {
      "jobId": "string"
    }
  },
  {
    "id": "generate-hint",
    "input": {
      "courseId": "string",
      "itemId": "string"
    },
    "output": {
      "hint": "string"
    }
  },
  {
    "id": "generate-assignment",
    "input": {
      "topic": "string"
    },
    "output": {
      "jobId": "string"
    }
  },
  {
    "id": "generate-remediation",
    "input": {
      "subject": "string",
      "itemsPerGroup": "number"
    },
    "output": {
      "jobId": "string"
    }
  },
  {
    "id": "mcp-metrics-proxy",
    "input": {
      "type": "string"
    },
    "output": {
      "ok": "boolean"
    }
  },
  {
    "id": "game-start-round",
    "input": {
      "courseId": "string",
      "level": "number",
      "assignmentId": "string"
    },
    "output": {
      "sessionId": "string",
      "roundId": "string"
    }
  },
  {
    "id": "game-log-attempt",
    "input": {
      "roundId": "string",
      "itemId": "number",
      "isCorrect": "boolean",
      "latencyMs": "number",
      "finalize": "boolean"
    },
    "output": {
      "attemptId": "string"
    }
  },
  {
    "id": "get-analytics",
    "input": {
      "courseId": "string",
      "range": "string"
    },
    "output": {
      "dailyData": "json",
      "summary": "json"
    }
  },
  {
    "id": "get-student-skills",
    "input": {
      "studentId": "string",
      "domain": "string",
      "status": "string"
    },
    "output": {
      "skills": "json",
      "totalCount": "number"
    }
  },
  {
    "id": "update-mastery",
    "input": {
      "studentId": "string",
      "koId": "string",
      "exerciseScore": "number"
    },
    "output": {
      "oldMastery": "number",
      "newMastery": "number"
    }
  },
  {
    "id": "get-domain-growth",
    "input": {
      "studentId": "string"
    },
    "output": {
      "domains": "json"
    }
  },
  {
    "id": "get-recommended-courses",
    "input": {
      "koId": "string",
      "studentId": "string"
    },
    "output": {
      "courses": "json"
    }
  },
  {
    "id": "create-class",
    "input": {
      "name": "string",
      "description": "string"
    },
    "output": {
      "class": "json"
    }
  },
  {
    "id": "add-class-member",
    "input": {
      "classId": "string",
      "studentEmail": "string"
    },
    "output": {
      "ok": "boolean"
    }
  },
  {
    "id": "remove-class-member",
    "input": {
      "classId": "string",
      "studentId": "string"
    },
    "output": {
      "ok": "boolean"
    }
  },
  {
    "id": "invite-student",
    "input": {
      "orgId": "string",
      "classId": "string",
      "email": "string"
    },
    "output": {
      "inviteId": "string",
      "success": "boolean"
    }
  },
  {
    "id": "generate-class-code",
    "input": {
      "classId": "string",
      "refreshCode": "boolean"
    },
    "output": {
      "code": "string",
      "expiresAt": "string"
    }
  },
  {
    "id": "join-class",
    "input": {
      "code": "string"
    },
    "output": {
      "success": "boolean",
      "classId": "string"
    }
  },
  {
    "id": "create-child-code",
    "input": {
      "studentId": "string"
    },
    "output": {
      "code": "string",
      "expiresAt": "string"
    }
  },
  {
    "id": "link-child",
    "input": {
      "code": "string"
    },
    "output": {
      "success": "boolean",
      "childId": "string"
    }
  },
  {
    "id": "send-message",
    "input": {
      "recipientId": "string",
      "content": "string"
    },
    "output": {
      "messageId": "string",
      "success": "boolean"
    }
  },
  {
    "id": "list-conversations",
    "input": {},
    "output": {
      "conversations": "json"
    }
  },
  {
    "id": "list-messages",
    "input": {
      "conversationWith": "string",
      "limit": "number"
    },
    "output": {
      "messages": "json",
      "nextCursor": "string"
    }
  }
] as const;
