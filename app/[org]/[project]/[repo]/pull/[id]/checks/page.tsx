import { PullRequestWorkflow } from "@/components/pull-request-workflow";
import { getPullRequestChecks } from "@/lib/ado/checks";
import { getPullRequest, getRepository } from "@/lib/ado/git";
import { getCurrentUserId } from "@/lib/ado/identity";
import { mutationsEnabledForOrg } from "@/lib/ado/mutations";

export const dynamic = "force-dynamic";

export default async function PullRequestChecksPage({ params }: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await params;
  const prId = Number(id);
  if (!Number.isSafeInteger(prId) || prId < 1) throw new Error("Invalid pull request id");
  const repository = await getRepository(org, project, repo);
  const [pr, checks, currentUserId] = await Promise.all([
    getPullRequest(org, project, repository.id, prId),
    getPullRequestChecks(org, project, repository.id, prId),
    getCurrentUserId(org),
  ]);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  return <PullRequestWorkflow org={org} project={project} repo={repo} base={base} activeTab="checks" mutationsEnabled={mutationsEnabledForOrg(org)} initial={{ pr, comments: [], checks, currentUserId }} />;
}
