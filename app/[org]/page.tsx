import Link from "next/link";
import { listProjects } from "@/lib/ado/core";
import { projectHref } from "@/lib/route-paths";

export const dynamic = "force-dynamic";

export default async function OrganizationPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const projects = await listProjects(org);

  return (
    <main className="directory-shell">
      <div className="code-breadcrumbs"><Link href="/">Open repository</Link><span> / </span><strong>{org}</strong></div>
      <div className="page-heading directory-heading">
        <div><p className="eyebrow">Organization</p><h1>{org}</h1></div>
        <span className="muted">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>
      </div>
      <div className="list-card">
        {projects.length === 0 ? <div className="empty-state">No accessible projects found.</div> : projects.map((project) => (
          <Link className="list-row code-row" key={project.id} href={projectHref(org, project.name)}>
            <span aria-hidden="true">▦</span>
            <span className="grow directory-item-label">
              <strong>{project.name}</strong>
              {project.description ? <span className="muted small">{project.description}</span> : null}
            </span>
            {project.visibility ? <span className="muted small">{project.visibility}</span> : null}
          </Link>
        ))}
      </div>
    </main>
  );
}
