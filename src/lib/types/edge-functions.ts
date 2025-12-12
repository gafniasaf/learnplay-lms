/**
 * Edge Function Response Types
 * 
 * Type definitions for all Supabase Edge Function responses.
 * These types ensure type safety when calling Edge Functions via useMCP.
 */

// Re-export existing types from API files
export type { Class, ListClassesResponse, Student, ListStudentsResponse } from '../api/classes';
export type { Assignment, ListAssignmentsResponse } from '../api/assignments';

// Student-related Edge Function responses
export interface GetStudentSkillsResponse {
  skills: Array<{
    id: string;
    koId: string;
    domain: string;
    title: string;
    mastery: number;
    status: 'locked' | 'in-progress' | 'mastered';
    evidenceCount: number;
  }>;
  totalCount: number;
}

export interface GetClassKOSummaryResponse {
  ok: boolean;
  stub?: boolean;
  endpoint?: string;
  received?: unknown;
  // When implemented, should return:
  // summary: Array<{
  //   koId: string;
  //   title: string;
  //   domain: string;
  //   studentsStruggling: number;
  //   studentsMastered: number;
  //   avgMastery: number;
  // }>;
}

export interface GetDomainGrowthResponse {
  // Array of growth data points
  // When implemented, should return:
  // Array<{
  //   domain: string;
  //   date: string;
  //   mastery: number;
  //   studentsCount: number;
  // }>;
}

export interface GetRecommendedCoursesResponse {
  // Array of recommended courses
  // When implemented, should return:
  // Array<{
  //   courseId: string;
  //   title: string;
  //   reason: string;
  //   matchScore: number;
  // }>;
}

export interface StudentGoalsResponse {
  goals: Array<{
    id: string;
    student_id: string;
    title: string;
    target_minutes: number;
    progress_minutes: number;
    due_at: string | null;
    status: 'on_track' | 'behind' | 'completed';
    teacher_note: string | null;
    created_at: string;
    updated_at: string;
  }>;
  summary: {
    total: number;
    onTrack: number;
    behind: number;
    completed: number;
  };
}

export interface StudentTimelineResponse {
  events: Array<{
    id: string;
    student_id: string;
    event_type: string;
    description: string;
    metadata: Record<string, any>;
    occurred_at: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StudentAchievementsResponse {
  achievements: Array<{
    id: string;
    student_id: string;
    achievement_type: string;
    title: string;
    description: string;
    earned_at: string;
    progress?: number;
  }>;
  total: number;
}

// Parent-related Edge Function responses
export interface ParentChildrenResponse {
  children: Array<{
    studentId: string;
    studentName: string;
    linkStatus: string;
    linkedAt: string;
  }>;
}

export interface ParentGoalsResponse {
  goals: Array<{
    id: string;
    student_id: string;
    title: string;
    target_minutes: number;
    progress_minutes: number;
    due_at: string | null;
    status: 'on_track' | 'behind' | 'completed';
    isOverdue?: boolean;
    progressPct?: number;
  }>;
  summary: {
    totalGoals: number;
    onTrack: number;
    behind: number;
    completed: number;
    overdue?: number;
    averageProgress?: number;
  };
  emptyState?: boolean;
  message?: string;
}

export interface ParentSubjectsResponse {
  subjects: Array<{
    subject: string;
    normalizedSubject?: string;
    totalSessions?: number;
    totalMinutes?: number;
    avgAccuracy?: number;
  }>;
  summary?: {
    totalSubjects: number;
    totalMinutes: number;
    avgAccuracy: number;
  };
  emptyState?: boolean;
  message?: string;
}

export interface ParentTimelineResponse {
  events: Array<{
    id: string;
    student_id: string;
    student_name?: string;
    event_type: string;
    description: string;
    metadata: Record<string, any>;
    occurred_at: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ParentTopicsResponse {
  topics: Array<{
    id: string;
    student_id: string;
    student_name?: string;
    topic: string;
    subject: string;
    date: string;
    minutes: number;
    items: number;
    accuracyPct: number;
    status: string;
  }>;
  emptyState?: boolean;
  message?: string;
}

// Job-related Edge Function responses
export interface ListJobsResponse {
  jobs: Array<{
    id: string;
    job_type: string;
    status: string;
    created_at: string;
    updated_at: string;
    payload?: Record<string, any>;
  }>;
}

export interface GetJobResponse {
  ok: boolean;
  job: {
    id: string;
    job_type: string;
    status: string;
    created_at: string;
    updated_at: string;
    payload?: Record<string, any>;
    result?: Record<string, any>;
  } | null;
  events?: Array<{
    id: string;
    job_id: string;
    event_type: string;
    message: string;
    created_at: string;
    metadata?: Record<string, any>;
  }>;
}

export interface ListCourseJobsResponse {
  ok: boolean;
  jobs: Array<{
    id: string;
    job_type: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
}

// Course-related Edge Function responses
export interface GetCourseResponse {
  id: string;
  title: string;
  description?: string;
  organization_id?: string;
  visibility?: string;
  content_version?: number;
  etag?: number;
  // Course content structure varies
  [key: string]: any;
}

export interface SearchCoursesResponse {
  courses: Array<{
    id: string;
    title: string;
    description?: string;
    tags?: string[];
  }>;
  total: number;
}

// Health and system-related responses
export interface HealthResponse {
  ok: boolean;
  data?: {
    api?: {
      status: string;
      responseTime?: number;
    };
    database?: {
      status: string;
      latency?: number;
    };
    storage?: {
      status: string;
      available?: boolean;
    };
    uptime?: number;
    avgResponseTime?: number;
    errorRate?: number;
  };
  error?: string;
}

// Record-related Edge Function responses
export interface ListRecordsResponse {
  ok: boolean;
  records: Array<Record<string, any>>;
}

export interface GetRecordResponse {
  ok: boolean;
  record: Record<string, any> | null;
}

export interface SaveRecordResponse {
  ok: boolean;
  id: string;
}

// Update mastery response
export interface UpdateMasteryResponse {
  oldMastery: number;
  newMastery: number;
  evidenceCount: number;
}

// Auto-assign settings response
export interface GetAutoAssignSettingsResponse {
  studentId: string;
  enabled: boolean;
  criteria?: Record<string, any>;
}

// Class roster response
export interface GetClassRosterResponse {
  members: Array<{
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
}

// Parent dashboard response (already defined in useDashboard, but included for completeness)
export interface ParentDashboardResponse {
  parentId: string;
  parentName?: string;
  children: Array<{
    studentId: string;
    studentName: string;
    linkStatus: string;
    linkedAt: string;
    metrics: {
      streakDays: number;
      xpTotal: number;
      lastLoginAt?: string | null;
      recentActivityCount: number;
    };
    upcomingAssignments: {
      count: number;
      items: Array<{
        id: string;
        title: string;
        courseId?: string;
        dueAt?: string;
        status?: string;
        progressPct?: number;
      }>;
    };
    alerts: {
      overdueAssignments: number;
      goalsBehind: number;
      needsAttention: boolean;
    };
  }>;
  summary: {
    totalChildren: number;
    totalAlerts: number;
    averageStreak: number;
    totalXp: number;
  };
}

// Student dashboard response (already defined in useDashboard, but included for completeness)
export interface StudentDashboardResponse {
  assignments: Array<{
    id: string;
    title: string;
    course_id?: string;
    due_at?: string;
    status?: string;
    progress_pct?: number;
    score?: number;
    completed_at?: string;
  }>;
  performance: {
    recentScore: number;
    streakDays: number;
    xp: number;
  };
  recommendedCourses: Array<{
    courseId: string;
    reason: string;
    createdAt: string;
  }>;
}

// Teacher dashboard response (get-dashboard)
export interface TeacherDashboardResponse {
  role: string;
  stats: {
    sessions: number;
    rounds: number;
    attempts7d: number;
    lastPlayedAt: string | null;
    lastFinalScore: number | null;
  };
}

// Additional Edge Function responses
export interface ListMediaJobsResponse {
  ok: boolean;
  jobs: Array<{
    id: string;
    job_type: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
}

export interface ListConversationsResponse {
  conversations: Array<{
    id: string;
    participant_id: string;
    participant_name: string;
    last_message?: string;
    last_message_at?: string;
    unread_count?: number;
  }>;
}

export interface ListMessagesResponse {
  messages: Array<{
    id: string;
    conversation_id: string;
    sender_id: string;
    sender_name: string;
    content: string;
    created_at: string;
  }>;
  nextCursor: string | null;
}

export interface GetAssignmentProgressResponse {
  rows: Array<{
    studentId: string;
    name: string;
    attempts: number;
    correct: number;
    accuracy: number;
    lastAttemptAt?: string;
  }>;
  assignmentTitle: string;
}

export interface GetClassProgressResponse {
  classId: string;
  className: string;
  totalStudents: number;
  avgProgress: number;
  students: Array<{
    studentId: string;
    name: string;
    progress: number;
  }>;
}

export interface GetAnalyticsResponse {
  courseId: string;
  range: string;
  metrics: {
    totalStudents: number;
    avgProgress: number;
    completionRate: number;
    avgScore: number;
  };
  data?: Array<{
    date: string;
    value: number;
  }>;
}

export interface GetOrgConfigResponse {
  orgId: string;
  config: Record<string, any>;
}

