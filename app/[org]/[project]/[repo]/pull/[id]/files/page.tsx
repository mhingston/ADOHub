import { PullRequestTabs } from "@/components/pull-request-tabs";
import { PullRequestFiles } from "@/components/pull-request-files";
import { getPullRequest, getPullRequestFiles, getRepository } from "@/lib/ado/git";

export default async function FilesPage({ params }: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await params;
  const prId = Number(id);
  if (!Number.isSafeInteger(prId) || prId < 1) throw new Error("Invalid pull request id");
  const repository = await getRepository(org, project, repo);
  const [pr, files] = await Promise.all([
    getPullRequest(org, project, repository.id, prId),
    getPullRequestFiles(org, project, repository.id, prId),
  ]);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  return (
    <>
      <PullRequestTabs pr={pr} base={base} activeTab="files" />
      <PullRequestFiles org={org} project={project} repo={repo} prId={prId} files={files} mutationsEnabled={process.env.ADO_MUTATIONS_ENABLED === "true"} />
    </>
  );
}
