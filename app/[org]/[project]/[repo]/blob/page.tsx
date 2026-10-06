import Link from "next/link";
import { getRepository, getRepositoryFile, normalizeRepositoryPath } from "@/lib/ado/git";
import { repositoryBrowseHref } from "@/lib/route-paths";

type SearchParams = Promise<{ branch?: string | string[]; path?: string | string[] }>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BlobPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; project: string; repo: string }>;
  searchParams: SearchParams;
}) {
  const [{ org, project, repo }, search] = await Promise.all([params, searchParams]);
  const repository = await getRepository(org, project, repo);
  const branch = one(search.branch) || repository.defaultBranch;
  const path = normalizeRepositoryPath(one(search.path) || "/");
  const file = await getRepositoryFile(org, project, repository.id, branch, path);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  const parentPath = `/${path.split("/").filter(Boolean).slice(0, -1).join("/")}` || "/";

  return (
    <>
      <div className="page-heading code-heading">
        <div>
          <h1>Code</h1>
          <div className="code-breadcrumbs"><Link href={repositoryBrowseHref(base, "tree", branch, parentPath)}>{parentPath === "/" ? repository.name : parentPath}</Link><span aria-hidden> / </span><strong>{path.split("/").at(-1)}</strong></div>
        </div>
        <Link className="branch-chip" href={`${base}/branches`}>⑂ {branch}</Link>
      </div>
      {file.binary ? <div className="empty-state">This file is binary or Azure DevOps did not return text content.</div> : file.tooLarge ? <div className="empty-state">This file is larger than the 1 MB inline browsing limit. Open it in Azure DevOps to inspect it.</div> : (
        <section className="code-file card">
          <div className="diff-header"><strong>{path}</strong><span className="muted small">{file.content?.length.toLocaleString() ?? 0} characters</span></div>
          <pre className="code-file-content">{file.content}</pre>
        </section>
      )}
    </>
  );
}
