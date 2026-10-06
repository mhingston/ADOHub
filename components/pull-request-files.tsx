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

type FileTreeNode = {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  fileIndex?: number;
};

function sortFileTree(nodes: Iterable<FileTreeNode>): FileTreeNode[] {
  return [...nodes].sort((left, right) => {
    const leftIsDirectory = left.fileIndex === undefined;
    const rightIsDirectory = right.fileIndex === undefined;
    if (leftIsDirectory !== rightIsDirectory) return leftIsDirectory ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function buildFileTree(files: PullRequestFile[]): FileTreeNode[] {
  const roots = new Map<string, FileTreeNode>();

  files.forEach((file, fileIndex) => {
    const segments = file.path.split("/").filter(Boolean);
    let nodes = roots;
    let node: FileTreeNode | undefined;

    segments.forEach((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join("/")}`;
      node = nodes.get(segment);
      if (!node) {
        node = { name: segment, path, children: new Map() };
        nodes.set(segment, node);
      }
      if (index === segments.length - 1) node.fileIndex = fileIndex;
      nodes = node.children;
    });
  });

  return sortFileTree(roots.values());
}

function changeMarker(changeType: string) {
  const type = changeType.toLowerCase();
  if (type.includes("add")) return { label: "A", kind: "added", description: "Added" };
  if (type.includes("delete")) return { label: "D", kind: "deleted", description: "Deleted" };
  if (type.includes("rename")) return { label: "R", kind: "renamed", description: "Renamed" };
  return { label: "M", kind: "modified", description: "Modified" };
}

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
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [selectedFile, setSelectedFile] = useState<string>();
  const componentId = useId();
  const target = `/api/repos/${[org, project, repo].map(encodeURIComponent).join("/")}/pull-requests/${prId}`;
  const fileTree = buildFileTree(files);

  function renderTree(nodes: FileTreeNode[]): ReactNode {
    return <ul className="file-tree-list">{nodes.map((node) => {
      const children = sortFileTree(node.children.values());
      const isFile = node.fileIndex !== undefined;
      const isCollapsed = Boolean(collapsedFolders[node.path]);
      const file = isFile ? files[node.fileIndex!] : undefined;
      const marker = file ? changeMarker(file.changeType) : undefined;
      const diffId = isFile ? `${componentId}-diff-${node.fileIndex}` : undefined;

      return <li className="file-tree-node" key={node.path}>
        {file ? <a
            className={`file-tree-file-link ${selectedFile === file.path ? "selected" : ""}`}
            href={`#${diffId}`}
            aria-label={`${marker?.description}: ${file.path}`}
            aria-current={selectedFile === file.path ? "location" : undefined}
            onClick={() => {
              setSelectedFile(file.path);
              setCollapsedFiles((current) => ({ ...current, [file.path]: false }));
            }}
          >
            <span className="file-tree-name" title={file.path.split("/").at(-1)}>{node.name}</span>
            <span className={`file-tree-marker ${marker?.kind ?? ""}`} aria-hidden="true">{marker?.label}</span>
          </a> : <button
          type="button"
          className="file-tree-folder"
          aria-expanded={!isCollapsed}
          onClick={() => setCollapsedFolders((current) => ({ ...current, [node.path]: !current[node.path] }))}
        >
          <span className={`file-tree-chevron ${isCollapsed ? "" : "expanded"}`} aria-hidden="true">▸</span>
          <span className="file-tree-name" title={node.name}>{node.name}</span>
        </button>}
        {children.length > 0 && (!isFile || !isCollapsed) ? renderTree(children) : null}
      </li>;
    })}</ul>;
  }

  return (
    <div className="file-review-layout">
      {files.length > 0 ? <nav className="file-tree" aria-label="Changed files">
        <div className="file-tree-heading"><strong>Files</strong><span className="muted small">{files.length}</span></div>
        {renderTree(fileTree)}
      </nav> : null}
      <div className="file-review-content">
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
          <section className="diff-card" id={`${componentId}-diff-${index}`} tabIndex={-1} key={file.path}>
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
      </div>
    </div>
  );
}
