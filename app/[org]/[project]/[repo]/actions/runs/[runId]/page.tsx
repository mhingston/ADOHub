import { RunPanel } from "@/components/run-panel";
import { getRun, getRunLog } from "@/lib/ado/builds";
import { selectRunLogItem } from "@/lib/domain/run-log-selection";
import type { LogChunk } from "@/lib/domain";

export default async function RunPage({ params }: { params: Promise<{ org: string; project: string; repo: string; runId: string }> }) {
  const { org, project, repo, runId } = await params;
  const run = await getRun(org, project, runId);
  const logItem = selectRunLogItem(run);
  let initialLog: LogChunk | undefined;
  if (logItem?.logId) {
    try {
      initialLog = await getRunLog(org, project, runId, logItem.logId);
    } catch {
      // Keep the run view available; RunPanel retries and surfaces any log error.
    }
  }
  return <RunPanel org={org} project={project} repo={repo} mutationsEnabled={process.env.ADO_MUTATIONS_ENABLED === "true"} initialRun={run} initialLog={initialLog} />;
}
