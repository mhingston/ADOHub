import type { TimelineItem, WorkflowRunDetail } from "@/lib/domain";

export function selectRunLogItem(run: Pick<WorkflowRunDetail, "timeline" | "status">): TimelineItem | undefined {
  if (run.status === "running" || run.status === "queued") {
    return run.timeline.find((item) => item.kind === "step" && item.status === "running" && item.logId)
      ?? run.timeline.find((item) => item.kind === "job" && item.status === "running" && item.logId);
  }
  return run.timeline.find((item) => item.kind === "step" && item.status === "failure" && item.logId)
    ?? run.timeline.find((item) => item.status === "failure" && item.logId)
    ?? [...run.timeline].reverse().find((item) => item.kind === "step" && item.logId);
}
