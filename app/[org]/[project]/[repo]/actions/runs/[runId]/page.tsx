import { RunPanel } from "@/components/run-panel";
import { getRun, getRunLog } from "@/lib/ado/builds";
import { selectRunLogItem } from "@/lib/domain/run-log-selection";

export default async function RunPage({ params }: { params: Promise<{ org: string; project: string; repo: string; runId: string }> }) {
  const { org, project, repo, runId } = await params;
  const run = await getRun(org, project, runId);
  const logItem = selectRunLogItem(run);
  const initialLog = logItem?.logId ? await getRunLog(org, project, runId, logItem.logId) : undefined;
  return <RunPanel org={org} project={project} repo={repo} mutationsEnabled={process.env.ADO_MUTATIONS_ENABLED === "true"} initialRun={run} initialLog={initialLog} />;
}
