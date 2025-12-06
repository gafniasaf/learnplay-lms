/**
 * Knowledge Map Type Definitions
 * 
 * Domain types for the Knowledge Objectives system including:
 * - Knowledge Objectives (KOs)
 * - Mastery tracking
 * - Assignments and completion criteria
 * - Auto-assign settings
 * - Recommendations
 */

// =====================================================
// KNOWLEDGE OBJECTIVES
// =====================================================

export interface Topic {
  id: string;                             // e.g., "math.algebra"
  name: string;                           // e.g., "Algebra"
  domain: string;                         // e.g., "math"
  displayOrder: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeObjective {
  id: string;                             // UUID
  name: string;
  description?: string;
  domain: string;                         // "math", "reading", "science"
  topicClusterId?: string;                // References Topic.id
  
  // Prerequisite graph
  prerequisites: string[];                // Array of KO IDs
  
  // Display content
  examples: KOExample[];
  
  // Metadata
  difficulty?: number;                    // 0-1 scale
  levelScore?: number;                    // 0-100 scale for white-label mapping
  
  // Lifecycle
  status: 'draft' | 'published' | 'archived';
  aliasOf?: string;                       // UUID of canonical KO if merged
  
  // Audit
  createdAt: string;
  updatedAt: string;
  createdBy?: string;                     // User ID or 'llm'
}

export interface KOExample {
  problem: string;
  solution: string;
}

// =====================================================
// MASTERY STATE
// =====================================================

export interface MasteryState {
  studentId: string;
  koId: string;
  mastery: number;                        // 0-1 scale
  evidenceCount: number;                  // Number of attempts
  lastUpdated: string;                    // ISO timestamp
  firstPracticed: string;                 // ISO timestamp
}

// Extended mastery with KO details (for UI display)
export interface MasteryStateWithKO extends MasteryState {
  ko: KnowledgeObjective;
  status: 'locked' | 'in-progress' | 'mastered';
  daysSinceLastPractice: number;
}

// =====================================================
// EXERCISE-KO MAPPINGS
// =====================================================

export interface ExerciseKOMapping {
  exerciseId: string;                     // Format: "courseId:itemId"
  koId: string;
  weight: number;                         // 0-1, sum to ~1 per exercise
  confidence?: number;                    // LLM confidence (0-1)
  source: 'manual' | 'llm' | 'llm_verified';
  createdAt: string;
  createdBy?: string;
}

// =====================================================
// COURSE-KO SCOPE
// =====================================================

export interface CourseKOScope {
  courseId: string;
  koId: string;
  relevance: number;                      // 0-1 scale
  exerciseCount: number;                  // Cached count
  createdAt: string;
  updatedAt: string;
}

// =====================================================
// ASSIGNMENTS
// =====================================================

export type AssignmentMode = 'manual' | 'ai_assisted' | 'autonomous';
export type AssignmentStatus = 'active' | 'completed' | 'overdue' | 'cancelled';
export type AssignedByRole = 'teacher' | 'parent' | 'ai_autonomous';
export type CompletionReason = 'mastery_achieved' | 'exercises_completed' | 'deadline_exceeded' | 'both_criteria_met';

export interface CompletionCriteria {
  primary_kpi: 'mastery_score' | 'exercise_count' | 'hybrid';
  
  // Mastery-based
  target_mastery?: number;                // 0-1
  min_evidence?: number;                  // Min attempts to validate mastery
  
  // Exercise-based
  target_exercise_count?: number;
  
  // Time-based
  due_date?: string;                      // ISO timestamp
  
  // Hybrid
  require_both?: boolean;
}

export interface Assignment {
  id: string;                             // UUID
  studentId: string;
  koId: string;
  courseId: string;
  
  // Assignment metadata
  assignedBy: string;                     // User ID
  assignedByRole: AssignedByRole;
  
  // Completion criteria
  completionCriteria: CompletionCriteria;
  
  // AI context (if AI-recommended)
  llmRationale?: string;
  llmConfidence?: number;                 // 0-1
  
  // Status
  status: AssignmentStatus;
  completedAt?: string;
  completionReason?: CompletionReason;
  finalMastery?: number;
  
  // Dates
  createdAt: string;
  dueDate?: string;
}

// Extended assignment with related data (for UI display)
export interface AssignmentWithDetails extends Assignment {
  ko: KnowledgeObjective;
  courseName: string;
  currentMastery: number;
  progressCurrent: number;                // Exercises completed
  progressTarget: number;
  progressPercentage: number;             // 0-100
  daysUntilDue?: number;
  assignedByName?: string;
}

// =====================================================
// STUDENT KO PREFERENCES
// =====================================================

export type KOPriority = 'focus' | 'skip' | 'review';
export type KOPreferenceSource = 'teacher_assignment' | 'parent_assignment' | 'self';

export interface StudentKOPreference {
  studentId: string;
  koId: string;
  priority: KOPriority;
  source: KOPreferenceSource;
  setBy?: string;                         // User ID
  
  // Assignment details
  assignmentId?: string;
  courseId?: string;
  
  // Progress
  progressCurrent: number;
  progressTarget?: number;
  
  // Lifecycle
  createdAt: string;
  expiresAt?: string;
  supersededBy?: string;                  // User ID who overrode
}

// =====================================================
// AUTO-ASSIGN SETTINGS
// =====================================================

export type AutoAssignFrequency = 'daily' | 'weekly' | 'on_completion';

export interface AutoAssignSettings {
  studentId: string;
  enabled: boolean;
  masteryThreshold: number;               // 0-1, auto-assign if mastery < threshold
  frequency: AutoAssignFrequency;
  maxConcurrent: number;                  // Max concurrent assignments
  
  // Notifications
  notifyOnAssign: boolean;
  notifyEmail?: string;
  
  // Audit
  createdAt: string;
  updatedAt: string;
}

// =====================================================
// KO MERGE PROPOSALS
// =====================================================

export type MergeProposalStatus = 'pending' | 'approved' | 'rejected';

export interface KOMergeProposal {
  id: string;
  koA: string;                            // KO UUID
  koB: string;                            // KO UUID
  similarity: number;                     // 0-1
  llmReasoning?: string;
  status: MergeProposalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

// =====================================================
// RECOMMENDATIONS
// =====================================================

export interface RecommendedCourse {
  courseId: string;
  courseTitle: string;
  exerciseCount: number;                  // Exercises for this KO
  lastPracticed?: string;                 // ISO timestamp
  completionPct: number;                  // 0-100
  relevance: number;                      // 0-1
}

export interface KORecommendation {
  koId: string;
  koName: string;
  currentMastery: number;
  targetMastery: number;
  courses: RecommendedCourse[];
  reason: 'focus' | 'review' | 'stretch';
  priority: number;                       // Higher = more urgent
}

export interface AIRecommendationResult {
  recommendedCourseId: string;
  estimatedSessions: number;
  estimatedMinutes: number;
  confidence: number;                     // 0-1
  rationale: string;
}

// =====================================================
// TEACHER DASHBOARD DATA
// =====================================================

export interface ClassKOSummary {
  classId: string;
  className: string;
  koId: string;
  koName: string;
  domain: string;
  topicClusterId?: string;
  
  // Aggregate stats
  totalStudents: number;
  strugglingCount: number;                // Students with mastery < 0.5
  avgMastery: number;                     // 0-1
  lastPracticed?: string;                 // Most recent practice timestamp
  
  // Computed
  status: 'urgent' | 'opportunity' | 'strong';
}

export interface StudentKOMastery {
  studentId: string;
  studentName: string;
  mastery: number;                        // 0-1
  evidenceCount: number;
  lastPracticed?: string;
}

// =====================================================
// PARENT DASHBOARD DATA
// =====================================================

export interface DomainGrowthSummary {
  domain: string;                         // "math", "reading", "science"
  overallMastery: number;                 // 0-1
  trend: number;                          // Change over last month (-1 to 1)
  masteredCount: number;
  inProgressCount: number;
  lockedCount: number;
}

// =====================================================
// SKILL CARDS (STUDENT VIEW)
// =====================================================

export interface SkillCard {
  ko: KnowledgeObjective;
  mastery: number;
  evidenceCount: number;
  lastPracticed?: string;
  status: 'locked' | 'in-progress' | 'mastered';
  recommendedCourses: RecommendedCourse[];
  hasAssignment: boolean;
  assignmentDetails?: AssignmentWithDetails;
}

export interface SkillsViewData {
  practiceNow: SkillCard[];              // 2-4 KOs with mastery 0.3-0.69
  reviewSoon: SkillCard[];               // Mastered but aging (>10 days)
  mastered: SkillCard[];
  locked: SkillCard[];
}

// =====================================================
// PERMISSION CHECKS
// =====================================================

export interface AssignmentPermissions {
  canAssign: boolean;
  reason?: 'no_teacher' | 'has_teacher' | 'not_parent' | 'not_enrolled';
  teacherName?: string;
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

export interface GetStudentSkillsRequest {
  studentId: string;
  courseIds?: string[];                   // Filter to enrolled courses
}

export interface GetStudentSkillsResponse {
  skills: SkillsViewData;
  assignments: AssignmentWithDetails[];
  autoAssignSettings?: AutoAssignSettings;
}

export interface GetClassKOSummaryRequest {
  classId: string;
  domain?: string;                        // Filter by domain
  limit?: number;                         // Default: 5
}

export interface GetClassKOSummaryResponse {
  urgent: ClassKOSummary[];               // Avg mastery <50%
  opportunity: ClassKOSummary[];          // Avg mastery 50-69%
  strong: ClassKOSummary[];               // Avg mastery ≥70%
  totalKOs: number;
}

export interface GetRecommendedCoursesRequest {
  koId: string;
  studentId: string;
  limit?: number;                         // Default: 5
}

export interface GetRecommendedCoursesResponse {
  ko: KnowledgeObjective;
  courses: RecommendedCourse[];
}

export interface CreateAssignmentRequest {
  studentIds: string[];
  koId: string;
  courseId?: string;                      // Optional: let student choose
  assignedBy: string;
  assignedByRole: AssignedByRole;
  completionCriteria: CompletionCriteria;
  mode: AssignmentMode;
  
  // AI context
  useAIRecommendation?: boolean;
  llmRationale?: string;
  llmConfidence?: number;
}

export interface CreateAssignmentResponse {
  assignmentIds: string[];
  aiRecommendation?: AIRecommendationResult;
}

export interface UpdateMasteryRequest {
  studentId: string;
  koId: string;
  isCorrect: boolean;
  weight?: number;                        // From exercise mapping, default 1.0
}

export interface UpdateMasteryResponse {
  newMastery: number;
  evidenceCount: number;
  assignmentCompleted?: boolean;
  assignmentId?: string;
}

export interface CheckAssignmentCompletionRequest {
  assignmentId: string;
  currentMastery: number;
  exercisesCompleted: number;
}

export interface CheckAssignmentCompletionResponse {
  completed: boolean;
  overdue?: boolean;
  reason?: CompletionReason;
  progress: number;                       // 0-1
  masteryAtDeadline?: number;
}

// =====================================================
// HELPER TYPES
// =====================================================

export type KOStatus = 'locked' | 'in-progress' | 'mastered';

export interface KOFilters {
  domain?: string;
  topicClusterId?: string;
  status?: KOStatus;
  searchQuery?: string;
}

export interface KOSortOptions {
  sortBy: 'name' | 'mastery' | 'lastPracticed' | 'difficulty';
  sortDir: 'asc' | 'desc';
}
