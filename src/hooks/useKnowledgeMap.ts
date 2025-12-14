/**
 * Custom React Hooks for Knowledge Map Data
 * 
 * Provides React Query-powered hooks for fetching Knowledge Map data:
 * - useStudentSkills: Student's KOs with mastery states
 * - useClassKOSummary: Teacher's class aggregate KO data
 * - useStudentAssignments: Active/completed assignments
 * - useAutoAssignSettings: Autonomous assignment config
 * - useDomainGrowth: Parent's domain-level summaries
 * - useRecommendedCourses: Courses filtered by KO
 * 
 * All hooks handle loading/error states and provide React Query caching.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MasteryStateWithKO,
  ClassKOSummary,
  AssignmentWithDetails,
  AutoAssignSettings,
  DomainGrowthSummary,
  RecommendedCourse,
} from '@/lib/types/knowledgeMap';
import {
  getStudentSkills,
  getClassKOSummary,
  getStudentAssignments,
  getAutoAssignSettings,
  updateAutoAssignSettings,
  getDomainGrowth,
  getRecommendedCourses,
  createAssignment,
  updateMastery,
  type GetStudentSkillsParams,
  type GetClassKOSummaryParams,
  type GetStudentAssignmentsParams,
  type GetAutoAssignSettingsParams,
  type GetDomainGrowthParams,
  type GetRecommendedCoursesParams,
  type CreateAssignmentParams,
  type UpdateMasteryParams,
  type UpdateAutoAssignSettingsParams,
} from '@/lib/api/knowledgeMap';

// =====================================================
// QUERY KEYS
// =====================================================

export const knowledgeMapKeys = {
  all: ['knowledgeMap'] as const,
  studentSkills: (params: GetStudentSkillsParams) => 
    ['knowledgeMap', 'studentSkills', params] as const,
  classKOSummary: (params: GetClassKOSummaryParams) => 
    ['knowledgeMap', 'classKOSummary', params] as const,
  studentAssignments: (params: GetStudentAssignmentsParams) => 
    ['knowledgeMap', 'studentAssignments', params] as const,
  autoAssignSettings: (studentId: string) => 
    ['knowledgeMap', 'autoAssignSettings', studentId] as const,
  domainGrowth: (studentId: string) => 
    ['knowledgeMap', 'domainGrowth', studentId] as const,
  recommendedCourses: (params: GetRecommendedCoursesParams) => 
    ['knowledgeMap', 'recommendedCourses', params] as const,
};

// =====================================================
// STUDENT SKILLS
// =====================================================

export interface UseStudentSkillsResult {
  skills: MasteryStateWithKO[];
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch student's skills with mastery states
 * 
 * @example
 * const { skills, isLoading } = useStudentSkills({ studentId: 'student-1', domain: 'math' });
 */
export function useStudentSkills(params: GetStudentSkillsParams): UseStudentSkillsResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: knowledgeMapKeys.studentSkills(params),
    queryFn: () => getStudentSkills(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });

  return {
    skills: data?.skills ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// DOMAIN GROWTH (PARENT VIEW)
// =====================================================

export interface UseDomainGrowthResult {
  domains: DomainGrowthSummary[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch domain-level growth summaries for parent view
 * 
 * @example
 * const { domains, isLoading } = useDomainGrowth('student-3');
 */
export function useDomainGrowth(studentId: string): UseDomainGrowthResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: knowledgeMapKeys.domainGrowth(studentId),
    queryFn: () => getDomainGrowth({ studentId }),
    staleTime: 10 * 60 * 1000, // 10 minutes (less volatile)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  return {
    domains: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// CLASS KO SUMMARY (TEACHER VIEW)
// =====================================================

export interface UseClassKOSummaryResult {
  summaries: ClassKOSummary[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch class-level KO summaries for teacher view
 * 
 * @example
 * const { summaries, isLoading } = useClassKOSummary({ 
 *   teacherId: 'teacher-1',
 *   sortBy: 'struggling',
 *   sortOrder: 'desc'
 * });
 */
export function useClassKOSummary(params: GetClassKOSummaryParams): UseClassKOSummaryResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: knowledgeMapKeys.classKOSummary(params),
    queryFn: () => getClassKOSummary(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });

  return {
    summaries: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// STUDENT ASSIGNMENTS
// =====================================================

export interface UseStudentAssignmentsResult {
  assignments: AssignmentWithDetails[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch student's assignments
 * 
 * @example
 * const { assignments, isLoading } = useStudentAssignments({ 
 *   studentId: 'student-2',
 *   status: 'active'
 * });
 */
export function useStudentAssignments(
  params: GetStudentAssignmentsParams
): UseStudentAssignmentsResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: knowledgeMapKeys.studentAssignments(params),
    queryFn: () => getStudentAssignments(params),
    staleTime: 2 * 60 * 1000, // 2 minutes (more volatile)
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    assignments: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// RECOMMENDED COURSES
// =====================================================

export interface UseRecommendedCoursesResult {
  courses: RecommendedCourse[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetch recommended courses for a KO
 * 
 * @example
 * const { courses, isLoading } = useRecommendedCourses({ 
 *   koId: 'ko-math-addition',
 *   studentId: 'student-1'
 * });
 */
export function useRecommendedCourses(
  params: GetRecommendedCoursesParams
): UseRecommendedCoursesResult {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: knowledgeMapKeys.recommendedCourses(params),
    queryFn: () => getRecommendedCourses(params),
    staleTime: 10 * 60 * 1000, // 10 minutes (stable)
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!params.koId, // Only run if koId is provided
  });

  return {
    courses: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// AUTO-ASSIGN SETTINGS
// =====================================================

export interface UseAutoAssignSettingsResult {
  settings: AutoAssignSettings | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  updateSettings: (settings: Omit<AutoAssignSettings, 'studentId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  isUpdating: boolean;
}

/**
 * Fetch and update auto-assign settings
 * 
 * @example
 * const { settings, updateSettings, isLoading } = useAutoAssignSettings('student-4');
 * 
 * // Update settings
 * await updateSettings({ enabled: true, masteryThreshold: 0.6, ... });
 */
export function useAutoAssignSettings(studentId: string): UseAutoAssignSettingsResult {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: knowledgeMapKeys.autoAssignSettings(studentId),
    queryFn: () => getAutoAssignSettings({ studentId }),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  const mutation = useMutation({
    mutationFn: (settings: Omit<AutoAssignSettings, 'studentId' | 'createdAt' | 'updatedAt'>) =>
      updateAutoAssignSettings({ studentId, settings }),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({
        queryKey: knowledgeMapKeys.autoAssignSettings(studentId),
      });
    },
  });

  return {
    settings: data ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    updateSettings: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}

// =====================================================
// CREATE ASSIGNMENT MUTATION
// =====================================================

export interface UseCreateAssignmentResult {
  createAssignment: (params: CreateAssignmentParams) => Promise<void>;
  isCreating: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Create skill assignment mutation
 * 
 * @example
 * const { createAssignment, isCreating } = useCreateAssignment();
 * 
 * await createAssignment({
 *   studentIds: ['student-1', 'student-2'],
 *   koId: 'ko-math-addition',
 *   courseId: 'course-addition',
 *   assignedBy: 'teacher-1',
 *   assignedByRole: 'teacher',
 *   completionCriteria: { ... }
 * });
 */
export function useCreateAssignment(): UseCreateAssignmentResult {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createAssignment,
    onSuccess: (_, variables) => {
      // Invalidate assignments for all affected students
      variables.studentIds.forEach((studentId) => {
        queryClient.invalidateQueries({
          queryKey: ['knowledgeMap', 'studentAssignments'],
        });
      });

      // Invalidate class summary (teacher view)
      queryClient.invalidateQueries({
        queryKey: ['knowledgeMap', 'classKOSummary'],
      });
    },
  });

  return {
    createAssignment: mutation.mutateAsync,
    isCreating: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error as Error | null,
  };
}

// =====================================================
// UPDATE MASTERY MUTATION
// =====================================================

export interface UseUpdateMasteryResult {
  updateMastery: (params: UpdateMasteryParams) => Promise<void>;
  isUpdating: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Update mastery after exercise completion
 * 
 * @example
 * const { updateMastery } = useUpdateMastery();
 * 
 * await updateMastery({
 *   studentId: 'student-1',
 *   koId: 'ko-math-addition',
 *   exerciseScore: 0.85,
 *   weight: 1.0
 * });
 */
export function useUpdateMastery(): UseUpdateMasteryResult {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateMastery,
    onSuccess: (_, variables) => {
      // Invalidate student skills
      queryClient.invalidateQueries({
        queryKey: ['knowledgeMap', 'studentSkills'],
      });

      // Invalidate domain growth (parent view)
      queryClient.invalidateQueries({
        queryKey: knowledgeMapKeys.domainGrowth(variables.studentId),
      });

      // Invalidate class summary (teacher view)
      queryClient.invalidateQueries({
        queryKey: ['knowledgeMap', 'classKOSummary'],
      });

      // Invalidate assignments (may affect completion)
      queryClient.invalidateQueries({
        queryKey: ['knowledgeMap', 'studentAssignments'],
      });
    },
  });

  return {
    updateMastery: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error as Error | null,
  };
}
