"use client";

import { DiffModeEnum, DiffView, SplitSide } from "@git-diff-view/react";
import { createDiffPatches } from "@/lib/domain/unified-diff";
import type { PullRequestFile } from "@/lib/domain";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";

type Props = {
  org: string;
  project: string;
  repo: string;
  prId: number;
  files: PullRequestFile[];
  mutationsEnabled: boolean;
};

function InlineCommentForm({
  filePath,
  lineNumber,
  side,
  onClose,
  onPosted,
  target,
}: {
  filePath: string;
  lineNumber: number;
  side: "old" | "new";
  onClose: () => void;
  onPosted: () => void;
  target: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`${target}/comments/inline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, filePath, lineNumber, side }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Azure DevOps could not post this inline comment.");
      onPosted();
      setContent("");
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Azure DevOps could not post this inline comment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-comment-form" onSubmit={(event) => void submit(event)}>
      <div className="comment-header"><strong>Comment on line {lineNumber} ({side === "new" ? "new version" : "old version"})</strong><button type="button" className="button" onClick={onClose} disabled={busy}>Cancel</button></div>
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      <textarea aria-label={`Comment on ${filePath} line ${lineNumber}`} rows={4} maxLength={10_000} value={content} onChange={(event) => setContent(event.target.value)} autoFocus placeholder="Leave a comment on this line" disabled={busy} />
      <div className="actions"><button className="button primary" disabled={busy || !content.trim()}>{busy ? "Commenting…" : "Comment"}</button></div>
    </form>
  );
}

export function PullRequestFiles({ org, project, repo, prId, files, mutationsEnabled }: Props) {
  const [mode, setMode] = useState<DiffModeEnum>(DiffModeEnum.Split);
  const [postedMessages, setPostedMessages] = useState<Record<string, string>>({});
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const componentId = useId();
  const target = `/api/repos/${[org, project, repo].map(encodeURIComponent).join("/")}/pull-requests/${prId}`;

  return (
    <>
      <div className="page-heading diff-toolbar">
        <span className="muted">{files.length} changed {files.length === 1 ? "file" : "files"}</span>
        <div className="actions" role="group" aria-label="Diff layout">
          <button type="button" className={`button ${mode === DiffModeEnum.Split ? "primary" : ""}`} onClick={() => setMode(DiffModeEnum.Split)}>Split</button>
          <button type="button" className={`button ${mode === DiffModeEnum.Unified ? "primary" : ""}`} onClick={() => setMode(DiffModeEnum.Unified)}>Unified</button>
        </div>
      </div>
      {files.length === 0 ? <div className="empty-state">No changed files found.</div> : files.map((file, index) => {
        const comments = file.inlineComments ?? [];
        const hasContent = file.beforeContent !== undefined && file.afterContent !== undefined;
        const patches = hasContent ? createDiffPatches(file.previousPath ?? file.path, file.path, file.beforeContent!, file.afterContent!) : [];
        const extension = file.path.split(".").at(-1);
        const expanded = !collapsedFiles[file.path];
        const contentId = `${componentId}-file-${index}`;
        const renderWidgetLine = mutationsEnabled ? ({ side, lineNumber, onClose }: { side: SplitSide; lineNumber: number; onClose: () => void }): ReactNode => (
          <InlineCommentForm
            filePath={file.path}
            lineNumber={lineNumber}
            side={side === SplitSide.old ? "old" : "new"}
            onClose={onClose}
            onPosted={() => setPostedMessages((current) => ({ ...current, [file.path]: `Comment posted on line ${lineNumber}.` }))}
            target={target}
          />
        ) : undefined;

        return (
          <section className="diff-card" key={file.path}>
            <div className="diff-header">
              <button
                type="button"
                className="diff-file-toggle"
                aria-expanded={expanded}
                aria-controls={contentId}
                onClick={() => setCollapsedFiles((current) => ({ ...current, [file.path]: expanded }))}
              >
                <span className={`diff-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true">▸</span>
                <strong>{file.path}{file.previousPath ? <span className="muted small"> (renamed from {file.previousPath})</span> : null}</strong>
              </button>
              <span className="muted">{file.changeType}{file.size !== undefined ? ` · ${file.size.toLocaleString()} bytes` : ""}</span>
            </div>
            <div id={contentId} hidden={!expanded}>
              {expanded ? <>
                {file.binary ? <div className="empty-state">Binary or unavailable content; diff cannot be rendered safely.</div> : file.tooLarge ? <div className="empty-state">File is too large for the inline diff.</div> : file.renderingDeferred ? <div className="empty-state">Inline diff omitted after the first 30 files; the file remains listed.</div> : hasContent && patches.length ? (
                  <DiffView
                    key={`${file.path}:${mode}`}
                    className="ado-diff-view"
                    data={{
                      oldFile: { fileName: file.previousPath ?? file.path, fileLang: extension, content: file.beforeContent },
                      newFile: { fileName: file.path, fileLang: extension, content: file.afterContent },
                      hunks: patches,
                    }}
                    diffViewMode={mode}
                    diffViewTheme="dark"
                    diffViewHighlight
                    diffViewWrap
                    diffViewAddWidget={mutationsEnabled}
                    renderWidgetLine={renderWidgetLine}
                  />
                ) : hasContent ? <div className="empty-state">No text changes to display.</div> : <div className="empty-state">Diff content unavailable.</div>}
                {comments.length ? <div className="inline-comment-list" aria-label={`Inline comments on ${file.path}`}>
                  {comments.map((comment) => <article className="inline-comment-preview" key={`${comment.threadId}-${comment.commentId}`}>
                    <div className="comment-header"><strong>{comment.author}</strong><span className="muted small">Line {comment.lineNumber} · {comment.side === "new" ? "new version" : "old version"}{comment.status && comment.status !== "active" ? ` · ${comment.status}` : ""}</span></div>
                    <pre className="prose-pre">{comment.content}</pre>
                  </article>)}
                </div> : null}
                {postedMessages[file.path] ? <div className="inline-comment-success" role="status">{postedMessages[file.path]}</div> : null}
              </> : null}
            </div>
          </section>
        );
      })}
      <p className="muted small">All changed files are listed. Inline diffs are rendered for the first 30 files and capped at 400 KB of combined text per file.{mutationsEnabled ? " Select a changed line to add an Azure DevOps review comment." : " Inline comments are disabled for this deployment."}</p>
    </>
  );
}
