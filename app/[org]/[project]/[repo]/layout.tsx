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
  return (
    <>
      <div className="repo-header">
        <div className="repo-title">
          <Link href="/" className="muted-link">{org}</Link><span>/</span><span className="project-label">{project}</span><span>/</span><strong>{repository.name}</strong>
        </div>
        <RepoNav basePath={basePath} />
      </div>
      <main className="repo-shell">{children}</main>
    </>
  );
}
