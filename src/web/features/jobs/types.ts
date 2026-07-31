export type JobStatus = "success" | "error" | "running" | null;

export type Job = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  cron: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastStatus: JobStatus;
  lastError: string | null;
  state: Record<string, unknown> | null;
};

export type JobRun = {
  id: number;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  message: string | null;
  durationMs: number | null;
};

export type JobsResponse = { jobs: Job[] };
export type JobRunsResponse = { runs: JobRun[] };
export type JobResponse = { job: Job };
export type RunJobResponse = { ok: true; job: Job };
