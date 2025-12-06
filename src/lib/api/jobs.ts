/**
 * Jobs API - IgniteZero compliant
 * Uses edge functions instead of direct Supabase calls
 */

import { callEdgeFunctionGet, callEdgeFunction, ApiError } from "./common";

// Types
export interface CourseJob {
  id: string;
  subject?: string;
  prompt?: string;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'dead_letter' | 'stale';
  retry_count: number;
  max_retries: number;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  processing_duration_ms?: number;
  generation_duration_ms?: number;
  last_heartbeat?: string;
  created_by: string;
  summary?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface JobEvent {
  id: string;
  job_id: string;
  event_type: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface JobMetrics {
  sinceHours: number;
  courseJobs: {
    total: number;
    byStatus: Record<string, number>;
    avgProcessingMs: number;
    maxProcessingMs: number;
  };
  mediaJobs: {
    total: number;
    byStatus: Record<string, number>;
  };
}

export interface JobQuota {
  jobs_last_hour: number;
  hourly_limit: number;
  jobs_last_day: number;
  daily_limit: number;
}

// Default quota for guest/unauthenticated users
const DEFAULT_QUOTA: JobQuota = {
  jobs_last_hour: 0,
  hourly_limit: 10,
  jobs_last_day: 0,
  daily_limit: 50,
};

// List course jobs with filtering
export interface ListCourseJobsParams {
  status?: string;
  sinceHours?: number;
  limit?: number;
  offset?: number;
  search?: string;
  jobId?: string;
}

export interface ListCourseJobsResponse {
  ok: boolean;
  jobs: CourseJob[];
  total: number;
  limit: number;
  offset: number;
}

export async function listCourseJobs(params: ListCourseJobsParams = {}): Promise<ListCourseJobsResponse> {
  const queryParams: Record<string, string> = {};
  
  if (params.status) queryParams.status = params.status;
  if (params.sinceHours) queryParams.sinceHours = String(params.sinceHours);
  if (params.limit) queryParams.limit = String(params.limit);
  if (params.offset) queryParams.offset = String(params.offset);
  if (params.search) queryParams.search = params.search;
  if (params.jobId) queryParams.jobId = params.jobId;

  return callEdgeFunctionGet<ListCourseJobsResponse>("list-course-jobs", queryParams);
}

// Get single course job with optional events
export interface GetCourseJobResponse {
  ok: boolean;
  job: CourseJob;
  events: JobEvent[];
}

export async function getCourseJob(jobId: string, includeEvents = false): Promise<GetCourseJobResponse> {
  return callEdgeFunctionGet<GetCourseJobResponse>("get-course-job", {
    id: jobId,
    includeEvents: includeEvents ? "true" : "false",
  });
}

// Requeue a failed job
export interface RequeueJobResponse {
  ok: boolean;
  job: CourseJob;
  message: string;
}

export async function requeueJob(
  jobId: string, 
  jobTable: 'ai_course_jobs' | 'ai_media_jobs' = 'ai_course_jobs'
): Promise<RequeueJobResponse> {
  return callEdgeFunction<{ jobId: string; jobTable: string }, RequeueJobResponse>(
    "requeue-job",
    { jobId, jobTable }
  );
}

// Delete a job
export interface DeleteJobResponse {
  ok: boolean;
  message: string;
}

export async function deleteJob(
  jobId: string,
  jobTable: 'ai_course_jobs' | 'ai_media_jobs' = 'ai_course_jobs'
): Promise<DeleteJobResponse> {
  return callEdgeFunction<{ jobId: string; jobTable: string }, DeleteJobResponse>(
    "delete-job",
    { jobId, jobTable }
  );
}

// Get job metrics
export interface GetJobMetricsResponse {
  ok: boolean;
  sinceHours: number;
  courseJobs: {
    total: number;
    byStatus: Record<string, number>;
    avgProcessingMs: number;
    maxProcessingMs: number;
  };
  mediaJobs: {
    total: number;
    byStatus: Record<string, number>;
  };
}

export async function getJobMetrics(sinceHours = 24): Promise<GetJobMetricsResponse> {
  return callEdgeFunctionGet<GetJobMetricsResponse>("get-job-metrics", {
    sinceHours: String(sinceHours),
  });
}

// List media jobs
export interface ListMediaJobsParams {
  courseId?: string;
  status?: string;
  limit?: number;
}

export interface MediaJob {
  id: string;
  course_id: string;
  item_id: number;
  media_type: 'image' | 'audio' | 'video';
  prompt: string;
  provider: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  result_url?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface ListMediaJobsResponse {
  ok: boolean;
  jobs: MediaJob[];
  total: number;
}

export async function listMediaJobs(params: ListMediaJobsParams = {}): Promise<ListMediaJobsResponse> {
  const queryParams: Record<string, string> = {};
  
  if (params.courseId) queryParams.courseId = params.courseId;
  if (params.status) queryParams.status = params.status;
  if (params.limit) queryParams.limit = String(params.limit);

  return callEdgeFunctionGet<ListMediaJobsResponse>("list-media-jobs", queryParams);
}

// Get job quota (with guest mode fallback)
export async function getJobQuota(): Promise<JobQuota> {
  // Check if in guest mode
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('guest') === '1') {
      return DEFAULT_QUOTA;
    }
    try {
      if (localStorage.getItem('guestMode') === 'true') {
        return DEFAULT_QUOTA;
      }
    } catch {
      // localStorage blocked
    }
  }

  try {
    // Try to get from edge function or direct query
    // For now, return default - this would be enhanced with a proper edge function
    return DEFAULT_QUOTA;
  } catch (err) {
    console.warn('[jobs.getJobQuota] Using default quota due to error:', err);
    return DEFAULT_QUOTA;
  }
}

