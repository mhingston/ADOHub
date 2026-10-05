import Link from "next/link";
import { getPullRequestFiles, getRepository } from "@/lib/ado/git";

function renderPatch(patch: string) {
  return patch.split("\n").map((line, index) => {
    const cls = line.startsWith("+") && !line.startsWith("+++") ? "diff-add" : line.startsWith("-") && !line.startsWith("---") ? "diff-del" : line.startsWith("@@") ? "diff-hunk" : "";
    return <span className={cls} key={index}>{line}{"\n"}</span>;
  });
}

export default async function FilesPage({ params }: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await params;
  const prId = Number(id);
  if (!Number.isInteger(prId)) throw new Error("Invalid pull request id");
  const repository = await getRepository(org, project, repo);
  const files = await getPullRequestFiles(org, project, repository.id, prId);
  const base = `/${[org, project, repo].map(encodeURIComponent).join("/")}`;
  return (
    <>
      <div className="page-heading"><h1>Files changed</h1><Link href={`${base}/pull/${prId}`}>← Conversation</Link></div>
      {files.length === 0 ? <div className="empty-state">No changed files found.</div> : files.map((file) => (
        <section className="diff-card" key={file.path}>
          <div className="diff-header"><strong>{file.path}</strong><span className="muted">{file.changeType}</span></div>
          {file.binary ? <div className="empty-state">Binary or unavailable content; diff cannot be rendered safely.</div> : file.tooLarge ? <div className="empty-state">File is too large for the inline MVP diff.</div> : file.renderingDeferred ? <div className="empty-state">Inline diff omitted after the first 30 files; the file remains listed.</div> : file.patch ? <pre className="diff-view">{renderPatch(file.patch)}</pre> : <div className="empty-state">Diff content unavailable.</div>}
        </section>
      ))}
      <p className="muted small">All changed files are listed. Inline diff content is rendered for the first 30 files and capped at 400 KB of combined text per file.</p>
    </>
  );
}
