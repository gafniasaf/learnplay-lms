import { z } from 'zod';
import { 
  JobPayloadSchema,
  // Entities
  LearnerProfileSchema,
  AssignmentSchema,
  CourseBlueprintSchema,
  GameSessionSchema,
  MessageThreadSchema,
  JobTicketSchema,
  MasteryStateSchema,
  StudentGoalSchema,
  ClassMembershipSchema,
  SessionEventSchema,
  GoalUpdateSchema,
  // Constants
  JOB_MODES,
  ENTITY_FIELDS,
  EDGE_FUNCTION_SCHEMAS
} from '../../src/lib/contracts';

// Re-export core schemas
export {
  JobPayloadSchema,
  LearnerProfileSchema,
  AssignmentSchema,
  CourseBlueprintSchema,
  GameSessionSchema,
  MessageThreadSchema,
  JobTicketSchema,
  MasteryStateSchema,
  StudentGoalSchema,
  ClassMembershipSchema,
  SessionEventSchema,
  GoalUpdateSchema,
  JOB_MODES,
  ENTITY_FIELDS,
  EDGE_FUNCTION_SCHEMAS
};

// --- MCP Handler Input Schemas ---

export const GetCourseInput = z.object({ courseId: z.string() });
export type GetCourseInputT = z.infer<typeof GetCourseInput>;

export const ListJobsInput = z.object({ limit: z.number().optional() });
export type ListJobsInputT = z.infer<typeof ListJobsInput>;

export const GetJobInput = z.object({ id: z.string() });
export type GetJobInputT = z.infer<typeof GetJobInput>;

export const EnqueueJobInput = z.object({ jobType: z.string(), payload: z.any().optional() });
export type EnqueueJobInputT = z.infer<typeof EnqueueJobInput>;

export const GetLogsInput = z.object({ jobId: z.string() });
export type GetLogsInputT = z.infer<typeof GetLogsInput>;

export const SaveCourseInput = z.object({ course: z.any() });
export type SaveCourseInputT = z.infer<typeof SaveCourseInput>;

export const EnqueueAndTrackInput = EnqueueJobInput;
export type EnqueueAndTrackInputT = z.infer<typeof EnqueueAndTrackInput>;

export const ListMediaJobsInput = z.object({ limit: z.number().optional() });
export type ListMediaJobsInputT = z.infer<typeof ListMediaJobsInput>;

export const GetMediaJobInput = z.object({ id: z.string() });
export type GetMediaJobInputT = z.infer<typeof GetMediaJobInput>;

// Generic schemas for now (can be tightened later)
export const EnqueueMediaInput = z.any();
export const EnqueueMediaAndTrackInput = z.any();
export const ApplyJobResultInput = z.any();
export const LocalizeInput = z.any();
export const GenerateImageInput = z.any();
export const GenerateMarketingInput = z.any();
export const GenerateCurriculumInput = z.any();
export const FunctionInfoInput = z.any();
export type GetFunctionInfoInputT = z.infer<typeof FunctionInfoInput>;

export const RepairCourseInput = z.any();
export type RepairCourseInputT = z.infer<typeof RepairCourseInput>;

export const VariantsAuditInput = z.any();
export const VariantsGenerateMissingInput = z.any();
export const ValidateCourseInput = z.any();
export type ValidateCourseInputT = z.infer<typeof ValidateCourseInput>;

export const ListCoursesInput = z.any();
export type ListCoursesInputT = z.infer<typeof ListCoursesInput>;

export const UiAuditIssue = z.any();
export const UiAuditOutput = z.any();
export const UiAuditSummary = z.any();
export const UiAuditFixInput = z.any();
export const UiAuditFixOutput = z.any();
export const HealthOutput = z.any();
export const CheckStorageIntegrityInputT = z.any();
export const ItemRewriteQualityInputT = z.any();
export const ItemGenerateMoreInputT = z.any();
export const ItemClusterAuditInputT = z.any();
export const EnqueueCourseMediaMissingInputT = z.any();
export const PublishCourseInput = z.any();

// --- Validation Helper ---
export function invalid(message: string): never {
  throw new Error(message);
}
