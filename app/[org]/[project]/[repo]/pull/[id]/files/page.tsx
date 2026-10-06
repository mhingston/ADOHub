import Link from "next/link";
import { PullRequestFiles } from "@/components/pull-request-files";
import { getPullRequestFiles, getRepository } from "@/lib/ado/git";

export default async function FilesPage({ params }: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await params;
  const prId = Number(id);
  if (!Number.isInteger(prId)) throw new Error("Invalid pull request id");
  const repository = await getRepository(org, project, repo);
  const files = await getPullRequestFiles(org, project, repository.id, prId);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  return (
    <>
      <div className="page-heading"><h1>Files changed</h1><Link href={`${base}/pull/${prId}`}>← Conversation</Link></div>
      <PullRequestFiles org={org} project={project} repo={repo} prId={prId} files={files} mutationsEnabled={process.env.ADO_MUTATIONS_ENABLED === "true"} />
    </>
  );
}
