import Link from "next/link";
import type { ReactNode } from "react";
import { RepoNav } from "@/components/repo-nav";
import { getRepository } from "@/lib/ado/git";
import { organizationHref, projectHref } from "@/lib/route-paths";

export const dynamic = "force-dynamic";

export default async function RepositoryLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string; project: string; repo: string }>;
}) {
  const { org, project, repo } = await params;
  const repository = await getRepository(org, project, repo);
  const basePath = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  const orgPath = organizationHref(org);
  const projectPath = projectHref(org, project);
  return (
    <>
      <div className="repo-header">
        <div className="repo-title">
          <Link href={orgPath} className="muted-link">{org}</Link><span>/</span><Link href={projectPath} className="project-label">{project}</Link><span>/</span><Link className="repo-breadcrumb" href={basePath}><strong>{repository.name}</strong></Link>
        </div>
        <RepoNav basePath={basePath} />
      </div>
      <main className="repo-shell">{children}</main>
    </>
  );
}
