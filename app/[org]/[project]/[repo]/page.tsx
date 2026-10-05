import { getRepository, listRootItems } from "@/lib/ado/git";

export default async function CodePage({ params }: { params: Promise<{ org: string; project: string; repo: string }> }) {
  const { org, project, repo } = await params;
  const repository = await getRepository(org, project, repo);
  const items = await listRootItems(org, project, repository.id);
  return (
    <>
      <div className="page-heading">
        <div><span className="branch-chip">⑂ {repository.defaultBranch}</span></div>
        {repository.webUrl ? <a className="button secondary" href={repository.webUrl}>Open in Azure DevOps</a> : null}
      </div>
      <div className="list-card code-list">
        {items.length === 0 ? <div className="empty-state">Repository root is empty.</div> : items.map((item) => (
          <div className="list-row" key={item.path}>
            <span aria-hidden>{item.isFolder ? "▸" : "·"}</span>
            <span className="grow mono-name">{item.name}</span>
            {item.size ? <span className="muted small">{item.size.toLocaleString()} bytes</span> : null}
          </div>
        ))}
      </div>
    </>
  );
}
