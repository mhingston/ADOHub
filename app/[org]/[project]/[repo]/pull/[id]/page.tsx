import { PullRequestWorkflow } from "@/components/pull-request-workflow";
import { getPullRequestChecks } from "@/lib/ado/checks";
import { getPullRequest, getPullRequestComments, getRepository } from "@/lib/ado/git";
import { getCurrentUserId } from "@/lib/ado/identity";

export default async function PullRequestPage({ params }: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await params;
  const prId = Number(id);
  if (!Number.isInteger(prId) || prId < 1) throw new Error("Invalid pull request id");
  const repository = await getRepository(org, project, repo);
  const [pr, comments, checks, currentUserId] = await Promise.all([
    getPullRequest(org, project, repository.id, prId),
    getPullRequestComments(org, project, repository.id, prId),
    getPullRequestChecks(org, project, repository.id, prId),
    getCurrentUserId(org),
  ]);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  return <PullRequestWorkflow org={org} project={project} repo={repo} base={base} mutationsEnabled={process.env.ADO_MUTATIONS_ENABLED === "true"} initial={{ pr, comments, checks, currentUserId }} />;
}
