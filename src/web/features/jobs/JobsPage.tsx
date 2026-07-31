import { useEffect, useState } from "react";
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
    <section className="page">
      <div className="page-header">
        <h1>Jobs</h1>
        <button type="button" onClick={() => void loadJobs()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading jobs…</p> : null}

      {!loading && jobs.length === 0 && !error ? (
        <p className="muted">No jobs registered.</p>
      ) : null}

      {jobs.length > 0 ? (
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Enabled</th>
              <th>Cron</th>
              <th>Last status</th>
              <th>Last started</th>
              <th>Last finished</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const selected = selectedId === job.id;
              const busy = busyId === job.id;
              return (
                <tr key={job.id} className={selected ? "selected" : undefined}>
                  <td>
                    <button type="button" className="linkish" onClick={() => selectJob(job.id)}>
                      {job.name}
                    </button>
                    {job.description ? <div className="muted small">{job.description}</div> : null}
                    <div className="muted small mono">{job.id}</div>
                  </td>
                  <td>{job.enabled ? "yes" : "no"}</td>
                  <td className="mono">{job.cron}</td>
                  <td>{job.lastStatus ?? "—"}</td>
                  <td>{formatTs(job.lastStartedAt)}</td>
                  <td>{formatTs(job.lastFinishedAt)}</td>
                  <td>
                    <div className="actions">
                      <button type="button" disabled={busy} onClick={() => void toggleEnabled(job)}>
                        {job.enabled ? "Disable" : "Enable"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => void runNow(job)}>
                        Run now
                      </button>
                      <button type="button" onClick={() => selectJob(job.id)}>
                        {selected ? "Hide runs" : "Runs"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {selectedId ? (
        <section className="runs-panel">
          <h2>Recent runs — {selectedId}</h2>
          {runsError ? <p className="error">{runsError}</p> : null}
          {runsLoading ? <p className="muted">Loading runs…</p> : null}
          {!runsLoading && runs.length === 0 && !runsError ? (
            <p className="muted">No runs yet.</p>
          ) : null}
          {runs.length > 0 ? (
            <table className="jobs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Duration</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.id}</td>
                    <td>{run.status}</td>
                    <td>{formatTs(run.startedAt)}</td>
                    <td>{formatTs(run.finishedAt)}</td>
                    <td>{run.durationMs != null ? `${run.durationMs} ms` : "—"}</td>
                    <td>{run.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
