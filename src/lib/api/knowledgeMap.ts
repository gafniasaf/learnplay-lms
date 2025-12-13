/**
 * Knowledge Map API Service Layer
 * 
 * Provides data access functions for Knowledge Map features with mock/live switching.
 * When useMockData is true, returns mock data from knowledgeMockData.ts.
 * When false, calls Supabase Edge Functions (to be implemented).
 * 
 * Functions:
 * - getStudentSkills: Fetch KOs and mastery states for a student
 * - getClassKOSummary: Fetch aggregated KO data for a teacher's class
 * - getRecommendedCourses: Get courses filtered by KO
 * - getStudentAssignments: Fetch active/completed assignments
 * - createAssignment: Create new skill assignment
 * - updateMastery: Update mastery after exercise completion
 * - checkAssignmentCompletion: Check if assignment criteria met
 * - getAutoAssignSettings: Get autonomous assignment config
 * - updateAutoAssignSettings: Update autonomous assignment config
 * - getAIRecommendation: Get AI-recommended course for KO
 */

import type {
  KnowledgeObjective,
  MasteryState,
  MasteryStateWithKO,
  Assignment,
  AssignmentWithDetails,
  CompletionCriteria,
  ClassKOSummary,
  RecommendedCourse,
  AutoAssignSettings,
  AIRecommendationResult,
  DomainGrowthSummary,
} from "@/lib/types/knowledgeMap";
import {
  MOCK_MASTERY_STATES as mockMasteryStates,
  MOCK_ASSIGNMENTS,
  getKOsForStudent,
  getStudentMasteryStates,
  getAssignmentsForStudentDetailed,
  getRecommendedCoursesForKO,
  simulateMasteryUpdate,
  checkAssignmentCompletion as mockCheckCompletion,
  MOCK_KNOWLEDGE_OBJECTIVES,
} from "@/lib/mocks/knowledgeMockData";
import { callEdgeFunction } from "@/lib/api/common";

// =====================================================
// CONFIGURATION
// =====================================================

/**
 * Mock responses are forbidden. If anything attempts to enable mock mode, fail loudly.
 */
const MOCK_MODE_REQUESTED =
  (import.meta as any).env?.VITE_USE_MOCK === "true" ||
  (import.meta as any).env?.VITE_USE_MOCK === "1";

if (MOCK_MODE_REQUESTED) {
  throw new Error(
    "❌ MOCK MODE FORBIDDEN: Knowledge Map mock responses are disabled. Remove VITE_USE_MOCK and implement the backend Edge functions instead."
  );
}

// Kept for legacy branching; always false.
const USE_MOCK_DATA = false as const;

// =====================================================
// STUDENT SKILLS
// =====================================================

export interface GetStudentSkillsParams {
  studentId: string;
  domain?: string;           // Filter by domain
  status?: 'all' | 'locked' | 'in-progress' | 'mastered';
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface GetStudentSkillsResult {
  skills: MasteryStateWithKO[];
  totalCount: number;
}

/**
 * Get student's skills with mastery states
 */
export async function getStudentSkills(
  params: GetStudentSkillsParams
): Promise<GetStudentSkillsResult> {
  if (USE_MOCK_DATA) {
    return getStudentSkillsMock(params);
  }

  return await callEdgeFunction<GetStudentSkillsParams, GetStudentSkillsResult>('get-student-skills', params);
}

function getStudentSkillsMock(params: GetStudentSkillsParams): GetStudentSkillsResult {
  const { studentId, domain, status, searchQuery, limit = 50, offset = 0 } = params;
  
  let skills = getKOsForStudent(studentId);

  // Apply filters
  if (domain) {
    skills = skills.filter((s) => s.ko.domain === domain);
  }

  if (status && status !== 'all') {
    skills = skills.filter((s) => s.status === status);
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    skills = skills.filter(
      (s) =>
        s.ko.name.toLowerCase().includes(query) ||
        s.ko.description?.toLowerCase().includes(query)
    );
  }

  // Pagination
  const totalCount = skills.length;
  const paginatedSkills = skills.slice(offset, offset + limit);

  return {
    skills: paginatedSkills,
    totalCount,
  };
}

// =====================================================
// DOMAIN GROWTH SUMMARY (PARENT VIEW)
// =====================================================

export interface GetDomainGrowthParams {
  studentId: string;
}

export async function getDomainGrowth(
  params: GetDomainGrowthParams
): Promise<DomainGrowthSummary[]> {
  if (USE_MOCK_DATA) {
    return getDomainGrowthMock(params);
  }

  return await callEdgeFunction<GetDomainGrowthParams, DomainGrowthSummary[]>('get-domain-growth', params);
}

function getDomainGrowthMock(params: GetDomainGrowthParams): DomainGrowthSummary[] {
  const { studentId } = params;
  const skills = getKOsForStudent(studentId);

  const domains = ['math', 'reading', 'science'];
  
  return domains.map((domain) => {
    const domainSkills = skills.filter((s) => s.ko.domain === domain);
    
    if (domainSkills.length === 0) {
      return {
        domain,
        overallMastery: 0,
        trend: 0,
        masteredCount: 0,
        inProgressCount: 0,
        lockedCount: 0,
      };
    }

    const masteredCount = domainSkills.filter((s) => s.status === 'mastered').length;
    const inProgressCount = domainSkills.filter((s) => s.status === 'in-progress').length;
    const lockedCount = domainSkills.filter((s) => s.status === 'locked').length;
    
    const totalMastery = domainSkills.reduce((sum, s) => sum + s.mastery, 0);
    const overallMastery = totalMastery / domainSkills.length;

    // Mock trend: random between -0.1 and 0.1
    const trend = (Math.random() - 0.5) * 0.2;

    return {
      domain,
      overallMastery,
      trend,
      masteredCount,
      inProgressCount,
      lockedCount,
    };
  });
}

// =====================================================
// CLASS KO SUMMARY (TEACHER VIEW)
// =====================================================

export interface GetClassKOSummaryParams {
  teacherId: string;
  classId?: string;
  limit?: number;
  sortBy?: 'struggling' | 'mastery' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export async function getClassKOSummary(
  params: GetClassKOSummaryParams
): Promise<ClassKOSummary[]> {
  if (USE_MOCK_DATA) {
    return getClassKOSummaryMock(params);
  }

  return await callEdgeFunction<GetClassKOSummaryParams, ClassKOSummary[]>('get-class-ko-summary', params);
}

function getClassKOSummaryMock(params: GetClassKOSummaryParams): ClassKOSummary[] {
  const { sortBy = 'struggling', sortOrder = 'desc', limit = 20 } = params;

  // Mock: Teacher has 2 students (Bailey, Elliot)
  const studentIds = ['student-2', 'student-5'];
  
  // Aggregate KO data across students
  const koMap = new Map<string, ClassKOSummary>();

  studentIds.forEach((studentId) => {
    const skills = getKOsForStudent(studentId);
    
    skills.forEach((skill) => {
      const existing = koMap.get(skill.ko.id);
      
      if (existing) {
        existing.totalStudents += 1;
        if (skill.mastery < 0.5) {
          existing.strugglingCount += 1;
        }
        existing.avgMastery = (existing.avgMastery * (existing.totalStudents - 1) + skill.mastery) / existing.totalStudents;
      } else {
        koMap.set(skill.ko.id, {
          classId: 'class-1',
          className: 'Mrs. Johnson\'s Class',
          koId: skill.ko.id,
          koName: skill.ko.name,
          domain: skill.ko.domain,
          topicClusterId: skill.ko.topicClusterId,
          totalStudents: 1,
          strugglingCount: skill.mastery < 0.5 ? 1 : 0,
          avgMastery: skill.mastery,
          lastPracticed: skill.lastUpdated,
          status: skill.mastery < 0.5 ? 'urgent' : skill.mastery < 0.7 ? 'opportunity' : 'strong',
        });
      }
    });
  });

  const summaries = Array.from(koMap.values());

  // Sort
  summaries.sort((a, b) => {
    let compareValue = 0;
    
    if (sortBy === 'struggling') {
      compareValue = a.strugglingCount - b.strugglingCount;
    } else if (sortBy === 'mastery') {
      compareValue = a.avgMastery - b.avgMastery;
    } else {
      compareValue = a.koName.localeCompare(b.koName);
    }

    return sortOrder === 'asc' ? compareValue : -compareValue;
  });

  return summaries.slice(0, limit);
}

// =====================================================
// RECOMMENDED COURSES
// =====================================================

export interface GetRecommendedCoursesParams {
  koId: string;
  studentId: string;
  limit?: number;
}

export async function getRecommendedCourses(
  params: GetRecommendedCoursesParams
): Promise<RecommendedCourse[]> {
  if (USE_MOCK_DATA) {
    return getRecommendedCoursesMock(params);
  }

  return await callEdgeFunction<GetRecommendedCoursesParams, RecommendedCourse[]>('get-recommended-courses', params);
}

function getRecommendedCoursesMock(params: GetRecommendedCoursesParams): RecommendedCourse[] {
  const { koId, studentId, limit = 10 } = params;
  return getRecommendedCoursesForKO(koId, studentId).slice(0, limit);
}

// =====================================================
// ASSIGNMENTS
// =====================================================

export interface GetStudentAssignmentsParams {
  studentId: string;
  status?: 'active' | 'completed' | 'overdue' | 'all';
  limit?: number;
}

export async function getStudentAssignments(
  params: GetStudentAssignmentsParams
): Promise<AssignmentWithDetails[]> {
  if (USE_MOCK_DATA) {
    return getStudentAssignmentsMock(params);
  }

  return await callEdgeFunction<GetStudentAssignmentsParams, AssignmentWithDetails[]>('get-student-assignments', params);
}

function getStudentAssignmentsMock(params: GetStudentAssignmentsParams): AssignmentWithDetails[] {
  const { studentId, status = 'all', limit = 10 } = params;
  
  let assignments = getAssignmentsForStudentDetailed(studentId);

  if (status !== 'all') {
    assignments = assignments.filter((a) => a.status === status);
  }

  return assignments.slice(0, limit);
}

// =====================================================
// CREATE ASSIGNMENT
// =====================================================

export interface CreateAssignmentParams {
  studentIds: string[];
  koId: string;
  courseId: string;
  assignedBy: string;
  assignedByRole: 'teacher' | 'parent' | 'ai_autonomous';
  completionCriteria: CompletionCriteria;
  llmRationale?: string;
  llmConfidence?: number;
}

export interface CreateAssignmentResult {
  assignmentIds: string[];
  success: boolean;
}

export async function createAssignment(
  params: CreateAssignmentParams
): Promise<CreateAssignmentResult> {
  if (USE_MOCK_DATA) {
    return createAssignmentMock(params);
  }

  return await callEdgeFunction<CreateAssignmentParams, CreateAssignmentResult>('create-assignment', params);
}

function createAssignmentMock(params: CreateAssignmentParams): CreateAssignmentResult {
  const { studentIds } = params;
  
  // Simulate assignment creation
  const assignmentIds = studentIds.map((id) => `assign-${Date.now()}-${id}`);
  
  console.log('[Mock] Created assignments:', assignmentIds);
  
  return {
    assignmentIds,
    success: true,
  };
}

// =====================================================
// UPDATE MASTERY
// =====================================================

export interface UpdateMasteryParams {
  studentId: string;
  koId: string;
  exerciseScore: number;      // 0-1 (% correct)
  weight?: number;             // Mapping weight (default 1.0)
}

export interface UpdateMasteryResult {
  oldMastery: number;
  newMastery: number;
  evidenceCount: number;
}

export async function updateMastery(
  params: UpdateMasteryParams
): Promise<UpdateMasteryResult> {
  if (USE_MOCK_DATA) {
    return updateMasteryMock(params);
  }

  return await callEdgeFunction<UpdateMasteryParams, UpdateMasteryResult>('update-mastery', params);
}

function updateMasteryMock(params: UpdateMasteryParams): UpdateMasteryResult {
  const { studentId, koId, exerciseScore, weight = 1.0 } = params;
  
  const masteryState = mockMasteryStates.find(
    (m) => m.studentId === studentId && m.koId === koId
  );

  if (!masteryState) {
    // Create new mastery state
    return {
      oldMastery: 0,
      newMastery: exerciseScore * weight,
      evidenceCount: 1,
    };
  }

  const oldMastery = masteryState.mastery;
  const isCorrect = exerciseScore >= 0.7; // Treat score >= 70% as correct
  const result = simulateMasteryUpdate(oldMastery, isCorrect, weight);
  
  return {
    oldMastery,
    newMastery: result.newMastery,
    evidenceCount: masteryState.evidenceCount + result.evidenceIncrease,
  };
}

// =====================================================
// CHECK ASSIGNMENT COMPLETION
// =====================================================

export interface CheckCompletionParams {
  assignmentId: string;
}

export interface CheckCompletionResult {
  completed: boolean;
  reason?: 'mastery_achieved' | 'exercises_completed' | 'deadline_exceeded' | 'both_criteria_met';
  finalMastery?: number;
}

export async function checkCompletion(
  params: CheckCompletionParams
): Promise<CheckCompletionResult> {
  if (USE_MOCK_DATA) {
    return checkCompletionMock(params);
  }

  return await callEdgeFunction<CheckCompletionParams, CheckCompletionResult>('check-assignment-completion', params);
}

function checkCompletionMock(params: CheckCompletionParams): CheckCompletionResult {
  const { assignmentId } = params;
  
  const assignment = MOCK_ASSIGNMENTS.find((a) => a.id === assignmentId);
  
  if (!assignment) {
    return { completed: false };
  }

  const masteryState = mockMasteryStates.find(
    (m) => m.studentId === assignment.studentId && m.koId === assignment.koId
  );

  if (!masteryState) {
    return { completed: false };
  }

  const completed = mockCheckCompletion(assignment, masteryState.mastery, masteryState.evidenceCount);
  
  return {
    completed,
    finalMastery: masteryState.mastery,
    reason: completed ? 'mastery_achieved' : undefined,
  };
}

// =====================================================
// AUTO-ASSIGN SETTINGS
// =====================================================

export interface GetAutoAssignSettingsParams {
  studentId: string;
}

export async function getAutoAssignSettings(
  params: GetAutoAssignSettingsParams
): Promise<AutoAssignSettings | null> {
  if (USE_MOCK_DATA) {
    return getAutoAssignSettingsMock(params);
  }

  return await callEdgeFunction<GetAutoAssignSettingsParams, AutoAssignSettings | null>('get-auto-assign-settings', params);
}

function getAutoAssignSettingsMock(params: GetAutoAssignSettingsParams): AutoAssignSettings | null {
  const { studentId } = params;
  
  // Only student-4 (Drew) has auto-assign enabled
  if (studentId === 'student-4') {
    return {
      studentId,
      enabled: true,
      masteryThreshold: 0.55,
      frequency: 'on_completion',
      maxConcurrent: 2,
      notifyOnAssign: true,
      notifyEmail: 'parent@example.com',
      createdAt: '2025-01-05T00:00:00Z',
      updatedAt: '2025-01-08T00:00:00Z',
    };
  }

  return null;
}

export interface UpdateAutoAssignSettingsParams {
  studentId: string;
  settings: Omit<AutoAssignSettings, 'studentId' | 'createdAt' | 'updatedAt'>;
}

export async function updateAutoAssignSettings(
  params: UpdateAutoAssignSettingsParams
): Promise<AutoAssignSettings> {
  if (USE_MOCK_DATA) {
    return updateAutoAssignSettingsMock(params);
  }

  return await callEdgeFunction<UpdateAutoAssignSettingsParams, AutoAssignSettings>('update-auto-assign-settings', params);
}

function updateAutoAssignSettingsMock(params: UpdateAutoAssignSettingsParams): AutoAssignSettings {
  const { studentId, settings } = params;
  
  console.log('[Mock] Updated auto-assign settings for', studentId, settings);
  
  return {
    studentId,
    ...settings,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// =====================================================
// AI RECOMMENDATION
// =====================================================

export interface GetAIRecommendationParams {
  studentId: string;
  koId: string;
  availableCourseIds: string[];
}

// =====================================================
// KO METADATA LOOKUP
// =====================================================

export async function getKnowledgeObjective(koId: string): Promise<KnowledgeObjective | null> {
  if (USE_MOCK_DATA) {
    const ko = MOCK_KNOWLEDGE_OBJECTIVES.find((k) => k.id === koId);
    return ko || null;
  }
  try {
    return await callEdgeFunction<{ koId: string }, KnowledgeObjective>('get-ko', { koId });
  } catch {
    return null;
  }
}

export async function getAIRecommendation(
  params: GetAIRecommendationParams
): Promise<AIRecommendationResult> {
  if (USE_MOCK_DATA) {
    return getAIRecommendationMock(params);
  }

  return await callEdgeFunction<GetAIRecommendationParams, AIRecommendationResult>('ai-recommend-assignment', params);
}

function getAIRecommendationMock(params: GetAIRecommendationParams): AIRecommendationResult {
  const { availableCourseIds } = params;
  
  // Mock: Return first available course with high confidence
  return {
    recommendedCourseId: availableCourseIds[0] || 'course-unknown',
    estimatedSessions: 5,
    estimatedMinutes: 75,
    confidence: 0.87,
    rationale: 'This course has the highest relevance score for this skill and matches the student\'s current level.',
  };
}
