"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Status } from "@/components/status";
import type { LogChunk, TimelineItem, WorkflowRunDetail } from "@/lib/domain";

function encode(value: string) {
  return encodeURIComponent(value);
}

function activeLogItem(run: WorkflowRunDetail): TimelineItem | undefined {
  return run.timeline.find((item) => item.status === "failure" && item.logId)
    ?? run.timeline.find((item) => item.status === "running" && item.logId)
    ?? [...run.timeline].reverse().find((item) => item.logId);
}

export function RunPanel({
  org,
  project,
  initialRun,
  initialLog,
}: {
  org: string;
  project: string;
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
  const logItem = useMemo(() => activeLogItem(run), [run]);
  const [logText, setLogText] = useState(initialLog?.text ?? "");
  const [logId, setLogId] = useState<number | undefined>(initialLog?.logId);
  const nextLine = useRef((initialLog?.lineCount ?? 0) + 1);

  useEffect(() => {
    if (!logItem?.logId) return;
    if (logId !== logItem.logId) {
      setLogId(logItem.logId);
      setLogText("");
      nextLine.current = 1;
    }

    let cancelled = false;
    const fetchChunk = async () => {
      const response = await fetch(
        `/api/runs/${run.id}/logs/${logItem.logId}?org=${encode(org)}&project=${encode(project)}&startLine=${nextLine.current}`,
      );
      if (!response.ok || cancelled) return;
      const chunk = (await response.json()) as LogChunk;
      if (chunk.text && !cancelled) {
        setLogText((existing) => `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${chunk.text}`);
        nextLine.current += chunk.lineCount;
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
    const response = await fetch(`/api/runs/${run.id}/${action}?org=${encode(org)}&project=${encode(project)}`, { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    const next = (await response.json()) as WorkflowRunDetail;
    if (action === "rerun") window.location.assign(window.location.pathname.replace(/\/\d+$/, `/${next.id}`));
    else await query.refetch();
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
          {run.status === "running" ? <button className="button danger" onClick={() => void mutate("cancel")}>Cancel</button> : null}
          {["success", "failure", "cancelled"].includes(run.status) ? <button className="button" onClick={() => void mutate("rerun")}>Re-run</button> : null}
          {run.webUrl ? <a className="button secondary" href={run.webUrl}>Open in Azure DevOps</a> : null}
        </div>
      </div>

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
          <h2>{logItem?.status === "failure" ? "Failed step log" : "Current log"}</h2>
          {logItem ? <span className="muted">{logItem.name}</span> : null}
        </div>
        {logItem ? <pre className="log-view">{logText || "Waiting for log output…"}</pre> : <div className="empty-state">No task log is available for this run.</div>}
      </section>
    </>
  );
}
