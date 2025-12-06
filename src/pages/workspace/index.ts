/**
 * Workspace Module - Entity Editors following IgniteZero Manifest-First pattern
 * 
 * Each editor corresponds to a Root Entity defined in system-manifest.json:
 * - LearnerProfile (learner-profile)
 * - Assignment (assignment)
 * - CourseBlueprint (course-blueprint)
 * - MessageThread (message-thread)
 * - JobTicket (job-ticket)
 * 
 * Route pattern: /workspace/[entity-slug]/:id
 * - Use :id = "new" for creating new entities
 * - All data operations flow through useMCP() hook
 */

export { default as LearnerProfileEditor } from './LearnerProfileEditor';
export { default as AssignmentEditor } from './AssignmentEditor';
export { default as CourseBlueprintEditor } from './CourseBlueprintEditor';
export { default as MessageThreadEditor } from './MessageThreadEditor';
export { default as JobTicketEditor } from './JobTicketEditor';

// Re-export shared components
export { EntityForm } from './components/EntityForm';

