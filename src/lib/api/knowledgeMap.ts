/**
 * Knowledge Map API Types (live-only)
 *
 * IgniteZero forbids runtime mock data. The Knowledge Map UI uses `useMCP`
 * to call Supabase Edge Functions directly; this module exists to share
 * request/parameter types used by hooks/components.
 */

import type { CompletionCriteria, AutoAssignSettings } from "@/lib/types/knowledgeMap";

// =====================================================
// STUDENT SKILLS
// =====================================================

export interface GetStudentSkillsParams {
  studentId: string;
  domain?: string;
  status?: "all" | "locked" | "in-progress" | "mastered";
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

// =====================================================
// DOMAIN GROWTH (PARENT VIEW)
// =====================================================

export interface GetDomainGrowthParams {
  studentId: string;
}

// =====================================================
// CLASS KO SUMMARY (TEACHER VIEW)
// =====================================================

export interface GetClassKOSummaryParams {
  teacherId: string;
  classId?: string;
  limit?: number;
  sortBy?: "struggling" | "mastery" | "name";
  sortOrder?: "asc" | "desc";
}

// =====================================================
// RECOMMENDED COURSES
// =====================================================

export interface GetRecommendedCoursesParams {
  koId: string;
  studentId: string;
  limit?: number;
}

// =====================================================
// STUDENT ASSIGNMENTS (Knowledge Map assignment system)
// =====================================================

export interface GetStudentAssignmentsParams {
  studentId: string;
  status?: "active" | "completed" | "overdue" | "all";
  limit?: number;
}

// =====================================================
// CREATE ASSIGNMENT (Knowledge Map assignment system)
// =====================================================

export interface CreateAssignmentParams {
  studentIds: string[];
  koId: string;
  courseId: string;
  assignedBy: string;
  assignedByRole: "teacher" | "parent" | "ai_autonomous";
  completionCriteria: CompletionCriteria;
  llmRationale?: string;
  llmConfidence?: number;
}

// =====================================================
// UPDATE MASTERY
// =====================================================

export interface UpdateMasteryParams {
  studentId: string;
  koId: string;
  exerciseScore: number; // 0-1
  weight?: number;
}

// =====================================================
// AUTO-ASSIGN SETTINGS
// =====================================================

export interface GetAutoAssignSettingsParams {
  studentId: string;
}

export interface UpdateAutoAssignSettingsParams {
  studentId: string;
  settings: Omit<AutoAssignSettings, "studentId" | "createdAt" | "updatedAt">;
}


