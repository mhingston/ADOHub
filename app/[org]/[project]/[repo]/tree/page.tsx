import Link from "next/link";
import { getRepository, listRepositoryItems, normalizeRepositoryPath } from "@/lib/ado/git";
import { repositoryBrowseHref } from "@/lib/route-paths";

type SearchParams = Promise<{ branch?: string | string[]; path?: string | string[] }>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TreePage({
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
  const items = await listRepositoryItems(org, project, repository.id, branch, path);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  const segments = path.split("/").filter(Boolean);
  const parentPath = segments.length > 0 ? `/${segments.slice(0, -1).join("/")}` || "/" : undefined;

  return (
    <>
      <div className="page-heading code-heading">
        <div>
          <h1>Code</h1>
          <nav className="code-breadcrumbs" aria-label="Code path">
            <Link href={repositoryBrowseHref(base, "tree", branch, "/")}>/{repository.name}</Link>
            {segments.map((segment, index) => {
              const currentPath = `/${segments.slice(0, index + 1).join("/")}`;
              const isLast = index === segments.length - 1;
              return <span key={currentPath}><span aria-hidden> / </span>{isLast ? <strong>{segment}</strong> : <Link href={repositoryBrowseHref(base, "tree", branch, currentPath)}>{segment}</Link>}</span>;
            })}
          </nav>
        </div>
        <Link className="branch-chip" href={`${base}/branches`}>⑂ {branch}</Link>
      </div>
      <div className="list-card code-list">
        {parentPath ? <Link className="list-row code-row" href={repositoryBrowseHref(base, "tree", branch, parentPath)}><span aria-hidden>↰</span><span className="grow">..</span></Link> : null}
        {items.length === 0 ? <div className="empty-state">This directory is empty.</div> : items.map((item) => (
          <Link
            className="list-row code-row"
            key={item.path}
            href={repositoryBrowseHref(base, item.isFolder ? "tree" : "blob", branch, item.path)}
          >
            <span aria-hidden>{item.isFolder ? "▸" : "·"}</span>
            <span className="grow mono-name">{item.name}</span>
            {item.size !== undefined ? <span className="muted small">{item.size.toLocaleString()} bytes</span> : null}
          </Link>
        ))}
      </div>
    </>
  );
}
