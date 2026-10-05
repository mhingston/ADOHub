import { getRepository, listBranches } from "@/lib/ado/git";

export default async function BranchesPage({ params }: { params: Promise<{ org: string; project: string; repo: string }> }) {
  const { org, project, repo } = await params;
  const repository = await getRepository(org, project, repo);
  const branches = await listBranches(org, project, repository.id, repository.defaultBranch);
  return (
    <>
      <div className="page-heading"><h1>Branches</h1><span className="counter">{branches.length}</span></div>
      <div className="list-card">{branches.map((branch) => (
        <div className="list-row" key={branch.name}><span aria-hidden>⑂</span><strong className="grow">{branch.name}</strong>{branch.isDefault ? <span className="state-badge">default</span> : null}<code className="muted">{branch.objectId.slice(0, 8)}</code></div>
      ))}</div>
    </>
  );
}
