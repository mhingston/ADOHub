import Link from "next/link";
import { getRepository, listRootItems } from "@/lib/ado/git";
import { repositoryBrowseHref } from "@/lib/route-paths";

export default async function CodePage({ params }: { params: Promise<{ org: string; project: string; repo: string }> }) {
  const { org, project, repo } = await params;
  const repository = await getRepository(org, project, repo);
  const items = await listRootItems(org, project, repository.id, repository.defaultBranch);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  return (
    <>
      <div className="page-heading">
        <div><Link className="branch-chip" href={`${base}/branches`} aria-label={`Browse branches; current default is ${repository.defaultBranch}`}>⑂ {repository.defaultBranch}</Link></div>
        {repository.webUrl ? <a className="button secondary" href={repository.webUrl}>Open in Azure DevOps</a> : null}
      </div>
      <div className="list-card code-list">
        {items.length === 0 ? <div className="empty-state">Repository root is empty.</div> : items.map((item) => (
          <Link
            className="list-row code-row"
            key={item.path}
            href={repositoryBrowseHref(base, item.isFolder ? "tree" : "blob", repository.defaultBranch, item.path)}
          >
            <span aria-hidden>{item.isFolder ? "▸" : "·"}</span>
            <span className="grow mono-name">{item.name}</span>
            {item.size ? <span className="muted small">{item.size.toLocaleString()} bytes</span> : null}
          </Link>
        ))}
      </div>
    </>
  );
}
