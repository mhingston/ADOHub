import Link from "next/link";
import { ReviewBadge } from "@/components/status";
import { getRepository, listPullRequests } from "@/lib/ado/git";

export default async function PullsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string; repo: string }>;
  searchParams: Promise<{ state?: string; view?: string }>;
}) {
  const { org, project, repo } = await params;
  const filters = await searchParams;
  const repository = await getRepository(org, project, repo);
  const state = filters.state === "closed" || filters.state === "all" ? "all" : "active";
  let pulls = await listPullRequests(org, project, repository.id, state);
  if (filters.state === "closed") pulls = pulls.filter((pr) => pr.status === "completed" || pr.status === "abandoned");
  if (filters.view === "draft") pulls = pulls.filter((pr) => pr.isDraft);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;

  return (
    <>
      <div className="page-heading"><h1>Pull requests</h1><span className="counter">{pulls.length}</span></div>
      <div className="filter-bar">
        <Link href={`${base}/pulls`} className={!filters.state && !filters.view ? "filter active" : "filter"}>Open</Link>
        <Link href={`${base}/pulls?state=closed`} className={filters.state === "closed" ? "filter active" : "filter"}>Closed</Link>
        <Link href={`${base}/pulls?view=draft`} className={filters.view === "draft" ? "filter active" : "filter"}>Draft</Link>
        <Link href={`${base}/pulls?state=all`} className={filters.state === "all" ? "filter active" : "filter"}>All</Link>
      </div>
      <div className="list-card">
        {pulls.length === 0 ? <div className="empty-state">No pull requests match this filter.</div> : pulls.map((pr) => (
          <div className="pr-row" key={pr.id}>
            <div className="pr-icon">◇</div>
            <div className="grow">
              <div className="pr-title"><Link href={`${base}/pull/${pr.id}`}>{pr.title}</Link> <span className="muted">#{pr.id}</span> {pr.isDraft ? <span className="draft-badge">Draft</span> : null}</div>
              <div className="muted small">{pr.author} wants to merge <strong>{pr.sourceBranch}</strong> → <strong>{pr.targetBranch}</strong> · {pr.updatedAt ? `updated ${new Date(pr.updatedAt).toLocaleString()}` : pr.closedAt ? `closed ${new Date(pr.closedAt).toLocaleString()}` : `opened ${new Date(pr.createdAt).toLocaleString()}`}</div>
              <div className="review-line">{pr.reviewers.filter((review) => review.state !== "none").slice(0, 4).map((review) => <ReviewBadge key={review.id} state={review.state} />)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
