import Link from "next/link";
import { listRepositories } from "@/lib/ado/git";
import { organizationHref, repositoryHref } from "@/lib/route-paths";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params;
  const repositories = await listRepositories(org, project);

  return (
    <main className="directory-shell">
      <div className="code-breadcrumbs"><Link href={organizationHref(org)}>{org}</Link><span> / </span><strong>{project}</strong></div>
      <div className="page-heading directory-heading">
        <div><p className="eyebrow">Project</p><h1>{project}</h1></div>
        <span className="muted">{repositories.length} {repositories.length === 1 ? "repository" : "repositories"}</span>
      </div>
      <div className="list-card">
        {repositories.length === 0 ? <div className="empty-state">No accessible repositories found.</div> : repositories.map((repository) => (
          <Link className="list-row code-row" key={repository.id} href={repositoryHref(org, project, repository.name)}>
            <span aria-hidden="true">▧</span>
            <span className="grow directory-item-label"><strong>{repository.name}</strong><span className="muted small">Default branch: {repository.defaultBranch}</span></span>
          </Link>
        ))}
      </div>
    </main>
  );
}
