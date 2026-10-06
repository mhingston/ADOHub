"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Status } from "@/components/status";
import type { LogChunk, WorkflowRun, WorkflowRunDetail } from "@/lib/domain";
import { selectRunLogItem } from "@/lib/domain/run-log-selection";

function encode(value: string) {
  return encodeURIComponent(value);
}

export function RunPanel({
  org,
  project,
  repo,
  mutationsEnabled,
  initialRun,
  initialLog,
}: {
  org: string;
  project: string;
  repo: string;
  mutationsEnabled: boolean;
  initialRun: WorkflowRunDetail;
  initialLog?: LogChunk;
}) {
  const query = useQuery({
    queryKey: ["run", org, project, initialRun.id],
    queryFn: async () => {
      const response = await fetch(`/api/runs/${initialRun.id}?org=${encode(org)}&project=${encode(project)}`);
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<WorkflowRunDetail>;
    },
    initialData: initialRun,
    refetchInterval: (state) => {
      const run = state.state.data;
      return run && ["running", "queued"].includes(run.status) ? 3000 : false;
    },
  });

  const run = query.data;
  const logItem = selectRunLogItem(run);
  const [logText, setLogText] = useState(initialLog?.text ?? "");
  const [logId, setLogId] = useState<number | undefined>(initialLog?.logId);
  const [mutationError, setMutationError] = useState<string>();
  const [logError, setLogError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<"cancel" | "rerun">();
  const nextLine = useRef((initialLog?.lineCount ?? 0) + 1);

  useEffect(() => {
    if (!logItem?.logId) return;
    if (logId !== logItem.logId) {
      setLogId(logItem.logId);
      setLogText("");
      setLogError(undefined);
      nextLine.current = 1;
      return;
    }

    let cancelled = false;
    let fetching = false;
    const fetchChunk = async () => {
      if (fetching || cancelled) return;
      fetching = true;
      try {
        const response = await fetch(
          `/api/runs/${run.id}/logs/${logItem.logId}?org=${encode(org)}&project=${encode(project)}&startLine=${nextLine.current}`,
        );
        if (cancelled) return;
        const chunk = await response.json().catch(() => undefined) as (LogChunk & { error?: string }) | undefined;
        if (!response.ok) {
          setLogError(chunk?.error ?? "Could not retrieve more log lines.");
          return;
        }
        if (!chunk) {
          setLogError("Azure DevOps returned an invalid log response.");
          return;
        }
        setLogError(undefined);
        if (chunk.text && !cancelled) {
          setLogText((existing) => `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${chunk.text}`);
          nextLine.current += chunk.lineCount;
        }
      } catch {
        if (!cancelled) setLogError("Could not retrieve more log lines.");
      } finally {
        fetching = false;
      }
    };

    void fetchChunk();
    if (!["running", "queued"].includes(run.status)) return () => { cancelled = true; };
    const timer = window.setInterval(fetchChunk, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [logId, logItem?.logId, org, project, run.id, run.status]);

  async function mutate(action: "cancel" | "rerun") {
    setPendingAction(action);
    setMutationError(undefined);
    try {
      const response = await fetch(`/api/runs/${run.id}/${action}?org=${encode(org)}&project=${encode(project)}&repo=${encode(repo)}`, { method: "POST" });
      const body = await response.json().catch(() => undefined) as (WorkflowRun & { error?: string }) | undefined;
      if (!response.ok) throw new Error(body?.error ?? `Pipeline ${action} failed (${response.status})`);
      if (!body) throw new Error(`Pipeline ${action} returned no build`);
      if (action === "rerun") window.location.assign(window.location.pathname.replace(/\/\d+$/, `/${body.id}`));
      else await query.refetch();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : `Pipeline ${action} failed`);
    } finally {
      setPendingAction(undefined);
    }
  }

  return (
    <>
      <div className="run-header card">
        <div>
          <Status status={run.status} />
          <h2>{run.name} {run.runNumber ? `#${run.runNumber}` : `#${run.id}`}</h2>
          <div className="muted">{run.branch || "unknown branch"}{run.commit ? ` · ${run.commit.slice(0, 8)}` : ""}</div>
        </div>
        <div className="actions">
          {run.status === "running" ? <button disabled={!mutationsEnabled || Boolean(pendingAction)} className="button danger" onClick={() => void mutate("cancel")}>{pendingAction === "cancel" ? "Cancelling…" : "Cancel"}</button> : null}
          {["success", "failure", "cancelled"].includes(run.status) ? <button disabled={!mutationsEnabled || Boolean(pendingAction)} className="button" onClick={() => void mutate("rerun")}>{pendingAction === "rerun" ? "Re-running…" : "Re-run"}</button> : null}
          {run.webUrl ? <a className="button secondary" href={run.webUrl}>Open in Azure DevOps</a> : null}
        </div>
      </div>
      {!mutationsEnabled ? <div className="mutations-disabled" role="status">Pipeline mutations are disabled for this deployment.</div> : null}
      {mutationError ? <div className="error-banner" role="alert">{mutationError}</div> : null}

      <section>
        <h2>Jobs and steps</h2>
        <div className="timeline">
          {run.timeline.map((item) => (
            <div className={`timeline-row timeline-${item.kind} ${item.status === "failure" ? "failed" : ""}`} key={item.id}>
              <Status status={item.status} />
              <span>{item.name}</span>
              {item.errorCount ? <span className="muted">{item.errorCount} errors</span> : null}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>{logItem?.status === "failure" ? logItem.kind === "step" ? "Failed step log" : "Failed job log" : run.status === "running" || run.status === "queued" ? "Current log" : "Latest task log"}</h2>
          {logItem ? <span className="muted">{logItem.name}</span> : null}
        </div>
        {logError ? <div className="error-banner" role="alert">{logError}</div> : null}
        {logItem ? <pre className="log-view">{logText || "Waiting for log output…"}</pre> : (
          <div className="empty-state">
            {run.timeline.find((item) => item.kind === "approval" && item.status === "running")
              ? "This run is waiting for an approval. No step log is active."
              : run.status === "running" || run.status === "queued"
                ? "Waiting for an active step log."
                : "No task log is available for this run."}
          </div>
        )}
      </section>
    </>
  );
}
