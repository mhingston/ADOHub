"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { CheckList } from "@/components/check-list";
import { ReviewBadge, Status } from "@/components/status";
import type { Check, PullRequestComment, PullRequestSummary, Review } from "@/lib/domain";

type PullRequestView = PullRequestSummary & { mergeStatus?: string };
type WorkflowData = { pr: PullRequestView; comments: PullRequestComment[]; checks: Check[]; currentUserId: string };

type Props = {
  org: string;
  project: string;
  repo: string;
  base: string;
  mutationsEnabled: boolean;
  initial: WorkflowData;
};

function reviewLabel(review: Review) {
  switch (review.state) {
    case "approved": return "Approved";
    case "approved-with-suggestions": return "Approved with suggestions";
    case "waiting-for-author": return "Waiting for author";
    case "changes-requested": return "Changes requested";
    default: return "No vote";
  }
}

function mergeLabel(status?: string) {
  switch (status?.toLowerCase()) {
    case "succeeded": return "Ready to merge";
    case "conflicts": return "Merge conflicts";
    case "queued": return "Merge evaluation queued";
    case "failure": return "Merge evaluation failed";
    case "notset":
    case undefined: return "Not evaluated";
    default: return "Merge evaluation pending";
  }
}

function blockers(data: WorkflowData): string[] {
  const output = data.checks.flatMap((check) => {
    if (!check.required) return [];
    if (check.status === "failure") return [`Required check failed: ${check.name}`];
    if (check.status === "queued" || check.status === "running") return [`Required check is pending: ${check.name}`];
    return [];
  });
  for (const reviewer of data.pr.reviewers.filter((item) => item.required)) {
    if (["none", "waiting-for-author", "changes-requested"].includes(reviewer.state)) {
      output.push(`Required reviewer ${reviewer.displayName}: ${reviewLabel(reviewer).toLowerCase()}`);
    }
  }
  if (data.pr.mergeStatus?.toLowerCase().includes("conflict")) output.push("Azure DevOps reports merge conflicts.");
  if (data.pr.mergeStatus?.toLowerCase() === "failure") output.push("Azure DevOps merge evaluation failed.");
  return output;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

export function PullRequestWorkflow({ org, project, repo, base, mutationsEnabled, initial }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["pull-request-workflow", org, project, repo, initial.pr.id];
  const target = `/api/repos/${[org, project, repo].map(encodeURIComponent).join("/")}/pull-requests/${initial.pr.id}`;
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await fetch(target);
      const body = await readJson(response);
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not refresh pull request state.");
      return { ...body, currentUserId: initial.currentUserId } as unknown as WorkflowData;
    },
    initialData: initial,
    refetchInterval: 15_000,
  });
  const data = query.data;
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const mutationInFlight = useRef(false);
  const [mergeStrategy, setMergeStrategy] = useState<"squash" | "noFastForward">("squash");
  const [deleteSourceBranch, setDeleteSourceBranch] = useState(false);
  const requiredBlockers = blockers(data);
  const passed = data.checks.filter((check) => check.status === "success").length;
  const failed = data.checks.filter((check) => check.status === "failure").length;
  const pending = data.checks.filter((check) => check.status === "queued" || check.status === "running").length;
  const currentReview = data.pr.reviewers.find((review) => review.id.toLocaleLowerCase() === data.currentUserId.toLocaleLowerCase());

  async function mutate(action: string, method: string, body?: unknown, busyKey = action) {
    if (mutationInFlight.current) return undefined;
    mutationInFlight.current = true;
    setBusy(busyKey);
    setActionError(undefined);
    try {
      const response = await fetch(`${target}/${action}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Azure DevOps could not complete this action.");
      await queryClient.invalidateQueries({ queryKey });
      return result;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Azure DevOps could not complete this action.");
      return undefined;
    } finally {
      mutationInFlight.current = false;
      setBusy(undefined);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentText.trim() || busy) return;
    const result = await mutate("comments", "POST", { content: commentText });
    if (result) setCommentText("");
  }

  async function castVote(vote: -10 | -5 | 0 | 5 | 10) {
    await mutate("vote", "PUT", { vote }, `vote:${vote}`);
  }

  async function changeStatus(status: "abandoned" | "active") {
    const verb = status === "abandoned" ? "Abandon" : "Reactivate";
    if (!window.confirm(`${verb} pull request #${data.pr.id}?`)) return;
    await mutate("status", "PATCH", { status });
  }

  async function complete() {
    const options = `${mergeStrategy === "squash" ? "squash" : "merge commit"}${deleteSourceBranch ? " and delete the source branch" : ""}`;
    if (!window.confirm(`Complete pull request #${data.pr.id} using ${options}? Azure DevOps will decide whether current policies allow completion.`)) return;
    await mutate("complete", "POST", { mergeStrategy, deleteSourceBranch });
  }

  const active = data.pr.status === "open";
  return (
    <>
      {query.error ? <div className="error-banner" role="alert">{query.error.message}</div> : null}
      {actionError ? <div className="error-banner" role="alert">{actionError}</div> : null}
      {!mutationsEnabled ? <div className="mutations-disabled" role="status">PR mutations are disabled for this deployment.</div> : null}
      <div className="pr-heading">
        <h1>{data.pr.title} <span className="muted">#{data.pr.id}</span></h1>
        <div className="muted"><span className={`state-badge ${active ? "open" : ""}`}>{data.pr.isDraft ? "Draft" : data.pr.status}</span> {data.pr.author} wants to merge <strong>{data.pr.sourceBranch}</strong> into <strong>{data.pr.targetBranch}</strong></div>
      </div>
      <nav className="subtabs">
        <a className="subtab active" href="#conversation">Conversation</a>
        <a className="subtab" href="#checks">Checks {data.checks.length}</a>
        <Link className="subtab" href={`${base}/pull/${data.pr.id}/files`}>Files changed</Link>
      </nav>
      <div className="pr-grid">
        <div>
          <section className="card prose-card"><h2>Description</h2><pre className="prose-pre">{data.pr.description || "No description provided."}</pre></section>
          <section id="conversation">
            <h2>Conversation</h2>
            {data.comments.length === 0 ? <div className="empty-state">No comments yet.</div> : data.comments.map((comment) => (
              <article className="comment card" key={`${comment.threadId}-${comment.id}`}>
                <div className="comment-header"><strong>{comment.author}</strong><span className="muted small">{comment.publishedAt ? new Date(comment.publishedAt).toLocaleString() : ""}</span></div>
                <pre className="prose-pre">{comment.content}</pre>
              </article>
            ))}
            {active ? <form className="comment-form card" onSubmit={(event) => void submitComment(event)}>
              <label htmlFor="pr-comment"><strong>Add a comment</strong></label>
              <textarea id="pr-comment" rows={5} maxLength={10_000} disabled={!mutationsEnabled} value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Leave a comment" />
              <div className="actions"><button className="button primary" disabled={!mutationsEnabled || Boolean(busy) || !commentText.trim()}>{busy === "comments" ? "Commenting…" : "Comment"}</button></div>
            </form> : null}
          </section>
          <section id="checks">
            <div className="section-heading"><h2>Checks</h2><span className="muted">{passed} passed · {failed} failed · {pending} pending</span></div>
            <CheckList checks={data.checks} runHref={(runId) => `${base}/actions/runs/${runId}`} />
          </section>
        </div>
        <aside className="sidebar">
          <div className="sidebar-block">
            <h3>Reviewers</h3>
            {data.pr.reviewers.length === 0 ? <span className="muted">None</span> : data.pr.reviewers.map((review) => {
              const isCurrent = review.id.toLocaleLowerCase() === data.currentUserId.toLocaleLowerCase();
              return <div className="reviewer" key={review.id}><span>{review.displayName}{isCurrent ? <strong className="you-badge">You</strong> : null}{review.required ? <span className="muted small">Required</span> : null}</span><ReviewBadge state={review.state} /></div>;
            })}
            {active ? <div className="review-actions">
              {([
              [10, "Approve"], [5, "Approve with suggestions"], [-5, "Wait for author"], [-10, "Request changes"], [0, "Reset vote"],
              ] as const).map(([vote, label]) => <button className="button" key={vote} disabled={!mutationsEnabled || Boolean(busy)} onClick={() => void castVote(vote)}>{busy === `vote:${vote}` ? "Saving…" : label}</button>)}
              {currentReview ? <span className="muted small">Your current review: {reviewLabel(currentReview)}</span> : <span className="muted small">Your current review: no vote</span>}
            </div> : null}
          </div>
          <div className="sidebar-block"><h3>Merge state</h3><p className={requiredBlockers.length ? "merge-blocked" : ""}>{requiredBlockers.length ? "Blocked" : mergeLabel(data.pr.mergeStatus)}</p>
            {requiredBlockers.length ? <div className="blocker-list"><strong>Blockers</strong><ul>{requiredBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : <p className="muted small">No required blockers are reported by the current checks and reviewer state. Azure DevOps remains the final authority.</p>}
          </div>
          {active ? <div className="sidebar-block">
            <h3>Complete pull request</h3>
            <label className="field-label">Merge strategy<select value={mergeStrategy} disabled={!mutationsEnabled || Boolean(busy)} onChange={(event) => setMergeStrategy(event.target.value as "squash" | "noFastForward")}><option value="squash">Squash</option><option value="noFastForward">Merge commit</option></select></label>
            <label className="checkbox-label"><input type="checkbox" checked={deleteSourceBranch} disabled={!mutationsEnabled || Boolean(busy)} onChange={(event) => setDeleteSourceBranch(event.target.checked)} /> Delete source branch</label>
            <button className="button primary full-width" disabled={!mutationsEnabled || Boolean(busy)} onClick={() => void complete()}>{busy === "complete" ? "Completing…" : "Complete pull request"}</button>
            <button className="button danger full-width" disabled={!mutationsEnabled || Boolean(busy)} onClick={() => void changeStatus("abandoned")}>{busy === "status" ? "Updating…" : "Abandon pull request"}</button>
          </div> : data.pr.status === "abandoned" ? <div className="sidebar-block"><h3>Pull request actions</h3><button className="button" disabled={!mutationsEnabled || Boolean(busy)} onClick={() => void changeStatus("active")}>{busy === "status" ? "Updating…" : "Reactivate pull request"}</button></div> : null}
          {data.pr.webUrl ? <a href={data.pr.webUrl}>Open PR in Azure DevOps ↗</a> : null}
        </aside>
      </div>
    </>
  );
}
