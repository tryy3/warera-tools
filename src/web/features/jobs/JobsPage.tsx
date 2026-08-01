import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "../../api";
import type { Job, JobRun, JobRunsResponse, JobsResponse, RunJobResponse } from "./types";

function formatTs(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

export function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  async function loadJobs() {
    setLoading(true);
    setError(null);
    try {
      const data = await api<JobsResponse>("/api/jobs");
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns(jobId: string) {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const data = await api<JobRunsResponse>(`/api/jobs/${encodeURIComponent(jobId)}/runs`);
      setRuns(data.runs);
    } catch (err) {
      setRuns([]);
      setRunsError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunsLoading(false);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  useEffect(() => {
    if (selectedId) {
      void loadRuns(selectedId);
    } else {
      setRuns([]);
      setRunsError(null);
    }
  }, [selectedId]);

  function upsertJob(job: Job) {
    setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
  }

  async function toggleEnabled(job: Job) {
    setBusyId(job.id);
    setError(null);
    try {
      const data = await api<{ job: Job }>(`/api/jobs/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      upsertJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(job: Job) {
    setBusyId(job.id);
    setError(null);
    try {
      const data = await api<RunJobResponse>(`/api/jobs/${encodeURIComponent(job.id)}/run`, {
        method: "POST",
      });
      upsertJob(data.job);
      if (selectedId === job.id) {
        await loadRuns(job.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function selectJob(jobId: string) {
    setSelectedId((prev) => (prev === jobId ? null : jobId));
  }

  return (
    <section className="mx-auto max-w-[1100px] rounded-md border border-border bg-card p-4 pb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="m-0 text-[1.35rem] font-semibold tracking-tight">Jobs</h1>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadJobs()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {error ? <p className="my-2 text-destructive">{error}</p> : null}
      {loading ? <p className="text-muted-foreground">Loading jobs…</p> : null}

      {!loading && jobs.length === 0 && !error ? (
        <p className="text-muted-foreground">No jobs registered.</p>
      ) : null}

      {jobs.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Cron</TableHead>
              <TableHead>Last status</TableHead>
              <TableHead>Last started</TableHead>
              <TableHead>Last finished</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const selected = selectedId === job.id;
              const busy = busyId === job.id;
              return (
                <TableRow
                  key={job.id}
                  data-state={selected ? "selected" : undefined}
                  className={selected ? "bg-primary/15" : undefined}
                >
                  <TableCell>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 font-semibold"
                      onClick={() => selectJob(job.id)}
                    >
                      {job.name}
                    </Button>
                    {job.description ? (
                      <div className="text-sm text-muted-foreground">{job.description}</div>
                    ) : null}
                    <div className="font-mono text-sm text-muted-foreground">{job.id}</div>
                  </TableCell>
                  <TableCell>{job.enabled ? "yes" : "no"}</TableCell>
                  <TableCell className="font-mono">{job.cron}</TableCell>
                  <TableCell>{job.lastStatus ?? "—"}</TableCell>
                  <TableCell>{formatTs(job.lastStartedAt)}</TableCell>
                  <TableCell>{formatTs(job.lastFinishedAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void toggleEnabled(job)}
                      >
                        {job.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void runNow(job)}
                      >
                        Run now
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => selectJob(job.id)}
                      >
                        {selected ? "Hide runs" : "Runs"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      {selectedId ? (
        <section className="mt-4">
          <h2 className="mb-2 text-[1.05rem] font-semibold">Recent runs — {selectedId}</h2>
          {runsError ? <p className="my-2 text-destructive">{runsError}</p> : null}
          {runsLoading ? <p className="text-muted-foreground">Loading runs…</p> : null}
          {!runsLoading && runs.length === 0 && !runsError ? (
            <p className="text-muted-foreground">No runs yet.</p>
          ) : null}
          {runs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{run.id}</TableCell>
                    <TableCell>{run.status}</TableCell>
                    <TableCell>{formatTs(run.startedAt)}</TableCell>
                    <TableCell>{formatTs(run.finishedAt)}</TableCell>
                    <TableCell>{run.durationMs != null ? `${run.durationMs} ms` : "—"}</TableCell>
                    <TableCell>{run.message ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
