import Link from "next/link";
import { CheckList } from "@/components/check-list";
import { ReviewBadge } from "@/components/status";
import { getPullRequestChecks } from "@/lib/ado/checks";
import { getPullRequest, getPullRequestComments, getRepository } from "@/lib/ado/git";

export default async function PullRequestPage({ params }: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await params;
  const prId = Number(id);
  if (!Number.isInteger(prId)) throw new Error("Invalid pull request id");
  const repository = await getRepository(org, project, repo);
  const [pr, comments, checks] = await Promise.all([
    getPullRequest(org, project, repository.id, prId),
    getPullRequestComments(org, project, repository.id, prId),
    getPullRequestChecks(org, project, repository.id, prId),
  ]);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  const summary = {
    success: checks.filter((c) => c.status === "success").length,
    failure: checks.filter((c) => c.status === "failure").length,
    running: checks.filter((c) => ["running", "queued"].includes(c.status)).length,
  };
  return (
    <>
      <div className="pr-heading">
        <h1>{pr.title} <span className="muted">#{pr.id}</span></h1>
        <div className="muted"><span className="state-badge open">{pr.isDraft ? "Draft" : pr.status}</span> {pr.author} wants to merge {pr.sourceBranch} into {pr.targetBranch}</div>
      </div>
      <nav className="subtabs">
        <span className="subtab active">Conversation</span>
        <a className="subtab" href="#checks">Checks {checks.length}</a>
        <Link className="subtab" href={`${base}/pull/${pr.id}/files`}>Files changed</Link>
      </nav>

      <div className="pr-grid">
        <div>
          <section className="card prose-card"><h2>Description</h2><pre className="prose-pre">{pr.description || "No description provided."}</pre></section>
          <section><h2>Conversation</h2>{comments.length === 0 ? <div className="empty-state">No comments yet.</div> : comments.map((comment) => (
            <article className="comment card" key={`${comment.threadId}-${comment.id}`}>
              <div className="comment-header"><strong>{comment.author}</strong><span className="muted small">{comment.publishedAt ? new Date(comment.publishedAt).toLocaleString() : ""}</span></div>
              <pre className="prose-pre">{comment.content}</pre>
            </article>
          ))}</section>
          <section id="checks"><div className="section-heading"><h2>Checks</h2><span className="muted">{summary.success} successful · {summary.failure} failing · {summary.running} running</span></div><CheckList checks={checks} runHref={(runId) => `${base}/actions/runs/${runId}`} /></section>
        </div>
        <aside className="sidebar">
          <div className="sidebar-block"><h3>Reviewers</h3>{pr.reviewers.length === 0 ? <span className="muted">None</span> : pr.reviewers.map((review) => <div className="reviewer" key={review.id}><span>{review.displayName}</span><ReviewBadge state={review.state} /></div>)}</div>
          <div className="sidebar-block"><h3>Merge state</h3><span>{pr.mergeStatus ?? "unknown"}</span></div>
          {pr.webUrl ? <a href={pr.webUrl}>Open PR in Azure DevOps ↗</a> : null}
        </aside>
      </div>
    </>
  );
}
