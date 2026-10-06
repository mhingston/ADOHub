import Link from "next/link";
import { Status } from "@/components/status";
import { listRuns } from "@/lib/ado/builds";
import { getRepository } from "@/lib/ado/git";

function duration(ms?: number) {
  if (ms === undefined) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

export default async function ActionsPage({ params }: { params: Promise<{ org: string; project: string; repo: string }> }) {
  const { org, project, repo } = await params;
  const repository = await getRepository(org, project, repo);
  const runs = await listRuns(org, project, repository.id);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  const workflows = [...new Set(runs.map((run) => run.name))];
  return (
    <div className="actions-grid">
      <aside className="workflow-list"><h2>Workflows</h2>{workflows.length === 0 ? <span className="muted">No pipelines found.</span> : workflows.map((name) => <div className="workflow-name" key={name}>{name}</div>)}</aside>
      <section><div className="page-heading"><h1>Pipelines</h1></div><div className="list-card">{runs.length === 0 ? <div className="empty-state">No pipeline runs found for this repository.</div> : runs.map((run) => (
        <div className="run-row" key={run.id}>
          <Status status={run.status} />
          <div className="grow"><Link className="run-title" href={`${base}/actions/runs/${run.id}`}>{run.name} {run.runNumber ? `#${run.runNumber}` : `#${run.id}`}</Link><div className="muted small">{run.prId ? `PR #${run.prId}` : run.branch || "unknown branch"}{run.commit ? ` · ${run.commit.slice(0, 8)}` : ""}{run.requestedBy ? ` · ${run.requestedBy}` : ""}</div></div>
          <div className="muted small right">{duration(run.durationMs)}{run.startTime ? <><br />{new Date(run.startTime).toLocaleString()}</> : null}</div>
        </div>
      ))}</div></section>
    </div>
  );
}
