import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as v from '../src/validators.js';

type SchemaMap = Record<string, z.ZodTypeAny>;

const schemas: SchemaMap = {
  GetCourseInput: (v as any).GetCourseInput,
  ListJobsInput: (v as any).ListJobsInput,
  GetJobInput: (v as any).GetJobInput,
  EnqueueJobInput: (v as any).EnqueueJobInput,
  GetLogsInput: (v as any).GetLogsInput,
  SaveCourseInput: (v as any).SaveCourseInput,
  EnqueueAndTrackInput: (v as any).EnqueueAndTrackInput,
  ListMediaJobsInput: (v as any).ListMediaJobsInput,
  GetMediaJobInput: (v as any).GetMediaJobInput,
  EnqueueMediaInput: (v as any).EnqueueMediaInput,
  EnqueueMediaAndTrackInput: (v as any).EnqueueMediaAndTrackInput,
  ApplyJobResultInput: (v as any).ApplyJobResultInput,
  LocalizeInput: (v as any).LocalizeInput,
  GenerateImageInput: (v as any).GenerateImageInput,
  GenerateMarketingInput: (v as any).GenerateMarketingInput,
  GenerateCurriculumInput: (v as any).GenerateCurriculumInput,
  FunctionInfoInput: (v as any).FunctionInfoInput,
  RepairCourseInput: (v as any).RepairCourseInput,
  VariantsAuditInput: (v as any).VariantsAuditInput,
  VariantsGenerateMissingInput: (v as any).VariantsGenerateMissingInput,
  ValidateCourseInput: (v as any).ValidateCourseInput,
  ListCoursesInput: (v as any).ListCoursesInput,
};

function stableStringify(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as any).sort(), 2);
}

const output: Record<string, unknown> = {};
for (const [name, schema] of Object.entries(schemas)) {
  if (!schema || typeof (schema as any)._def === 'undefined') continue;
  const json = zodToJsonSchema(schema, { name });
  output[name] = json;
}

process.stdout.write(stableStringify(output));


