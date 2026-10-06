import Link from "next/link";
import type { ReactNode } from "react";
import { RepoNav } from "@/components/repo-nav";
import { getRepository } from "@/lib/ado/git";

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
  const adoOrgUrl = `https://dev.azure.com/${encodeURIComponent(org)}`;
  const adoProjectUrl = `${adoOrgUrl}/${encodeURIComponent(project)}`;
  return (
    <>
      <div className="repo-header">
        <div className="repo-title">
          <a href={adoOrgUrl} className="muted-link">{org}</a><span>/</span><a href={adoProjectUrl} className="project-label">{project}</a><span>/</span><Link className="repo-breadcrumb" href={basePath}><strong>{repository.name}</strong></Link>
        </div>
        <RepoNav basePath={basePath} />
      </div>
      <main className="repo-shell">{children}</main>
    </>
  );
}
