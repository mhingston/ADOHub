import { RunPanel } from "@/components/run-panel";
import { getRun, getRunLog } from "@/lib/ado/builds";

export default async function RunPage({ params }: { params: Promise<{ org: string; project: string; repo: string; runId: string }> }) {
  const { org, project, runId } = await params;
  const run = await getRun(org, project, runId);
  const logItem = run.timeline.find((item) => item.status === "failure" && item.logId)
    ?? run.timeline.find((item) => item.status === "running" && item.logId)
    ?? [...run.timeline].reverse().find((item) => item.logId);
  const initialLog = logItem?.logId ? await getRunLog(org, project, runId, logItem.logId).catch(() => undefined) : undefined;
  return <RunPanel org={org} project={project} initialRun={run} initialLog={initialLog} />;
}
