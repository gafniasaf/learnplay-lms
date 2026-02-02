export interface JobContext {
  jobId: string;
  payload: Record<string, unknown>;
}

export interface JobExecutor {
  execute(context: JobContext): Promise<unknown>;
}

