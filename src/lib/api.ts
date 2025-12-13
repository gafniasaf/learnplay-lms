/**
 * Unified API module - re-exports all domain-specific API functions
 * 
 * This file serves as the main entry point for API calls across the application.
 * All API functions are organized into domain-specific modules for better maintainability.
 */

import { getApiMode as getEnvApiMode } from "./env";

// Export common utilities and types
export {
  useMockData,
  shouldUseMockData,
  ApiError,
  callEdgeFunction,
  callEdgeFunctionGet,
  fetchWithTimeout,
} from "./api/common";
export type {} from "./api/common";

// Export catalog functions
export { getCourseCatalog, fetchCatalog, searchCourses } from "./api/catalog";

// Export course functions
export { getCourse, saveCourseToStorage } from "./api/course";

// Export game functions
export {
  startSession,
  startRound,
  logAttemptLive,
  logAttempt,
  endRound,
  logEvent,
  flushEvents,
} from "./api/game";
export type {
  AttemptData,
  RoundStartResponse,
  RoundEndResponse,
  LogAttemptPayload,
  LogAttemptResult,
} from "./api/game";

// Export assignment functions
export {
  createAssignment,
  listAssignments,
  listAssignmentsForTeacher,
  listAssignmentsForStudent,
  getAssignmentProgress,
  assignAssignees,
  exportGradebook,
} from "./api/assignments";
export type {
  CreateAssignmentRequest,
  CreateAssignmentResponse,
  Assignment,
  ListAssignmentsResponse,
  AssignmentProgressRow,
  AssignmentProgressResponse,
  AssignAssigneesInput,
} from "./api/assignments";

// Export analytics functions
export { getAnalytics, fetchAnalytics, getClassProgress } from "./api/analytics";
export type { ClassProgressResponse } from "./api/analytics";

// Export class management functions
export {
  listClasses,
  listOrgStudents,
  listStudentsForCourse,
  createClass,
  addClassMember,
  removeClassMember,
  inviteStudent,
  getClassRoster,
  generateClassCode,
  joinClass,
  createChildCode,
  linkChild,
} from "./api/classes";
export type { Class, ListClassesResponse, Student, ListStudentsResponse } from "./api/classes";

// Export messaging functions
export { sendMessage, listConversations, listMessages } from "./api/messaging";

// Export auth functions
export { getDashboard } from "./api/auth";

// Export parent timeline functions
export {
  getParentTimeline,
  type ParentTimelineEvent,
  type ParentTimelineParams,
  type ParentTimelineResponse,
} from "./api/parentTimeline";

// Export parent subjects functions
export {
  getParentSubjects,
  type ParentSubjectRecord,
  type ParentSubjectsParams,
  type ParentSubjectsResponse,
  type ParentSubjectsSummary,
} from "./api/parentSubjects";

// Export parent goals functions
export {
  getParentGoals,
  type ParentGoalRecord,
  type ParentGoalsParams,
  type ParentGoalsResponse,
  type ParentGoalsSummary,
} from "./api/parentGoals";

// Export parent dashboard functions
export {
  getParentDashboard,
  type ParentDashboardParams,
  type ParentDashboardResponse,
  type ParentDashboardSummary,
  type ParentDashboardChild,
} from "./api/parentDashboard";

// Export parent topics functions
export {
  getParentTopics,
  type ParentTopicsParams,
  type ParentTopicsResponse,
  type ParentTopicRecord,
  type ParentTopicsSummary,
} from "./api/parentTopics";

// Export student goals functions
export {
  getStudentGoals,
  type StudentGoalQueryParams,
  type StudentGoalsResponse,
  type StudentGoalRecord,
  type StudentGoalsSummary,
} from "./api/studentGoals";

// Export student timeline functions
export {
  getStudentTimeline,
  type StudentTimelineParams,
  type StudentTimelineResponse,
  type StudentTimelineEvent,
} from "./api/studentTimeline";

/**
 * Get current API mode (for debugging/display)
 */
export function getApiMode(): "mock" | "live" {
  return getEnvApiMode();
}
