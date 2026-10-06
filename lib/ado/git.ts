import { createTwoFilesPatch } from "diff";
import { AdoHttpError, AzureDevOpsClient } from "@/lib/ado/client";
import { normalizeVote, stripRef } from "@/lib/ado/normalizers";
import { extractUnifiedDiffHunks } from "@/lib/domain/unified-diff";
export { extractUnifiedDiffHunks } from "@/lib/domain/unified-diff";
import type {
  AdoGitItem,
  AdoPullRequest,
  AdoPullRequestChange,
  AdoPullRequestIteration,
  AdoPullRequestIterationChanges,
  AdoRef,
  AdoRepository,
  AdoThread,
} from "@/lib/ado/types";
import type {
  Branch,
  PullRequestComment,
  PullRequestInlineComment,
  PullRequestFile,
  PullRequestSummary,
  Repository,
  RepositoryFileContent,
  RepositoryItem,
  Review,
} from "@/lib/domain";

const API_VERSION = "7.1";

type ValueResponse<T> = { count?: number; value?: T[] };

function client(org: string, project: string) {
  return new AzureDevOpsClient({ org, project });
}

export async function getRepository(
  org: string,
  project: string,
  repo: string,
): Promise<Repository> {
  const raw = await client(org, project).get<AdoRepository>(`git/repositories/${encodeURIComponent(repo)}`, {
    "api-version": API_VERSION,
  });
  return {
    id: raw.id,
    name: raw.name,
    defaultBranch: stripRef(raw.defaultBranch) || "main",
    webUrl: raw.webUrl,
    projectId: raw.project?.id,
  };
}

export async function listRepositories(org: string, project: string): Promise<Repository[]> {
  const response = await client(org, project).get<ValueResponse<AdoRepository>>("git/repositories", {
    "api-version": API_VERSION,
  });
  return (response.value ?? []).map((raw) => ({
    id: raw.id,
    name: raw.name,
    defaultBranch: stripRef(raw.defaultBranch) || "main",
    webUrl: raw.webUrl,
    projectId: raw.project?.id,
  }));
}

export async function listRootItems(
  org: string,
  project: string,
  repoId: string,
  branch?: string,
): Promise<RepositoryItem[]> {
  return listRepositoryItems(org, project, repoId, branch, "/");
}

export function normalizeRepositoryPath(path: string): string {
  if (path.includes("\0") || path.includes("\\")) throw new Error("The repository path is invalid.");
  const segments = path.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) throw new Error("The repository path is invalid.");
  return segments.length ? `/${segments.join("/")}` : "/";
}

async function repositoryItems(
  org: string,
  project: string,
  repoId: string,
  path: string,
  commitId?: string,
): Promise<RepositoryItem[]> {
  const response = await client(org, project).get<ValueResponse<AdoGitItem>>(
    `git/repositories/${encodeURIComponent(repoId)}/items`,
    {
      scopePath: normalizeRepositoryPath(path),
      recursionLevel: "OneLevel",
      includeContentMetadata: true,
      "versionDescriptor.version": commitId,
      "versionDescriptor.versionType": commitId ? "commit" : undefined,
      "api-version": API_VERSION,
    },
  );
  return (response.value ?? [])
    .filter((item) => item.path !== "/")
    .map((item) => ({
      path: item.path,
      name: item.path.split("/").filter(Boolean).at(-1) ?? item.path,
      isFolder: Boolean(item.isFolder || item.gitObjectType === "tree"),
      commitId: item.commitId,
      size: item.size,
    }))
    .sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));
}

export async function getBranchCommit(
  org: string,
  project: string,
  repoId: string,
  branch: string,
): Promise<string> {
  const response = await client(org, project).get<ValueResponse<AdoRef>>(
    `git/repositories/${encodeURIComponent(repoId)}/refs`,
    { filter: "heads/", "api-version": API_VERSION },
  );
  const refName = `refs/heads/${branch}`;
  const ref = response.value?.find((candidate) => candidate.name === refName);
  if (!ref?.objectId) {
    throw new AdoHttpError("The selected repository branch no longer exists.", 404, "");
  }
  return ref.objectId;
}

export async function listRepositoryItems(
  org: string,
  project: string,
  repoId: string,
  branch: string | undefined,
  path: string,
): Promise<RepositoryItem[]> {
  const commitId = branch ? await getBranchCommit(org, project, repoId, branch) : undefined;
  return repositoryItems(org, project, repoId, path, commitId);
}

export async function getRepositoryFile(
  org: string,
  project: string,
  repoId: string,
  branch: string,
  path: string,
  maxBytes = 1_000_000,
): Promise<RepositoryFileContent> {
  const itemPath = normalizeRepositoryPath(path);
  if (itemPath === "/") throw new Error("A file path is required.");
  const commitId = await getBranchCommit(org, project, repoId, branch);
  const item = await client(org, project).get<AdoGitItem>(
    `git/repositories/${encodeURIComponent(repoId)}/items`,
    {
      path: itemPath,
      includeContentMetadata: true,
      "versionDescriptor.version": commitId,
      "versionDescriptor.versionType": "commit",
      "api-version": API_VERSION,
    },
  );
  if (item.isFolder || item.gitObjectType === "tree") throw new Error("The selected repository path is a directory.");
  if (item.size !== undefined && item.size > maxBytes) return { path: itemPath, branch, tooLarge: true };
  const content = await getItemText(org, project, repoId, itemPath, commitId);
  if (content === null) return { path: itemPath, branch, binary: true };
  if (content.length > maxBytes) return { path: itemPath, branch, tooLarge: true };
  return { path: itemPath, branch, content };
}

export async function listBranches(
  org: string,
  project: string,
  repoId: string,
  defaultBranch: string,
): Promise<Branch[]> {
  const response = await client(org, project).get<ValueResponse<AdoRef>>(
    `git/repositories/${encodeURIComponent(repoId)}/refs`,
    { filter: "heads/", "api-version": API_VERSION },
  );
  return (response.value ?? []).map((ref) => {
    const name = ref.name.replace(/^refs\/heads\//, "");
    return {
      name,
      objectId: ref.objectId,
      isDefault: name === defaultBranch,
    };
  });
}

function normalizeReview(identity: NonNullable<AdoPullRequest["reviewers"]>[number]): Review {
  return {
    id: identity.id ?? identity.uniqueName ?? identity.displayName ?? "unknown",
    displayName: identity.displayName ?? identity.uniqueName ?? "Unknown reviewer",
    avatarUrl: identity.imageUrl,
    state: normalizeVote(identity.vote),
    required: Boolean(identity.isRequired),
  };
}

export function normalizePullRequest(pr: AdoPullRequest): PullRequestSummary {
  const status = pr.status === "completed" ? "completed" : pr.status === "abandoned" ? "abandoned" : "open";
  const repoUrl = pr.repository?.webUrl?.replace(/\/$/, "");
  return {
    id: pr.pullRequestId,
    title: pr.title,
    description: pr.description,
    author: pr.createdBy?.displayName ?? pr.createdBy?.uniqueName ?? "Unknown author",
    authorAvatarUrl: pr.createdBy?.imageUrl,
    sourceBranch: stripRef(pr.sourceRefName),
    targetBranch: stripRef(pr.targetRefName),
    isDraft: Boolean(pr.isDraft),
    status,
    reviewers: (pr.reviewers ?? []).map(normalizeReview),
    createdAt: pr.creationDate ?? new Date(0).toISOString(),
    closedAt: pr.closedDate,
    updatedAt: pr.updatedDate,
    webUrl: pr._links?.web?.href ?? (repoUrl ? `${repoUrl}/pullrequest/${pr.pullRequestId}` : undefined),
    sourceCommit: pr.lastMergeSourceCommit?.commitId,
    targetCommit: pr.lastMergeTargetCommit?.commitId,
  };
}

export interface PullRequestFileEntry {
  change: AdoPullRequestChange;
  path: string;
  previousPath?: string;
  changeType: string;
  size?: number;
}

export function normalizeIterationChangePage(response: AdoPullRequestIterationChanges) {
  return {
    entries: response.changeEntries ?? response.changes?.changeEntries ?? [],
    nextSkip: response.nextSkip ?? response.changes?.nextSkip,
    nextTop: response.nextTop ?? response.changes?.nextTop,
  };
}

export function normalizePullRequestFileChanges(changes: AdoPullRequestChange[]): PullRequestFileEntry[] {
  return changes.flatMap((change) => {
    if (change.item?.isFolder) return [];
    const path = change.item?.path || change.originalPath;
    if (!path) return [];
    return [{
      change,
      path,
      previousPath: change.originalPath && change.originalPath !== path ? change.originalPath : undefined,
      changeType: change.changeType?.toLowerCase() ?? "edit",
      size: change.item?.size,
    }];
  });
}

export function isInlineDiffDeferred(index: number, maxDiffFiles: number) {
  return index >= maxDiffFiles;
}

export function createPullRequestFilePatch(
  beforePath: string,
  afterPath: string,
  before: string,
  after: string,
  beforeLabel: string,
  afterLabel: string,
) {
  return createTwoFilesPatch(`a${beforePath}`, `b${afterPath}`, before, after, beforeLabel, afterLabel, { context: 4 });
}

export async function listPullRequests(
  org: string,
  project: string,
  repoId: string,
  status: "active" | "completed" | "abandoned" | "all" = "active",
): Promise<PullRequestSummary[]> {
  const scoped = client(org, project);
  const pulls: AdoPullRequest[] = [];
  const pageSize = 100;
  for (let skip = 0; ; skip += pageSize) {
    const response = await scoped.get<ValueResponse<AdoPullRequest>>(
      `git/repositories/${encodeURIComponent(repoId)}/pullrequests`,
      {
        "searchCriteria.status": status,
        "$top": pageSize,
        "$skip": skip,
        "api-version": API_VERSION,
      },
    );
    const page = response.value ?? [];
    pulls.push(...page);
    if (page.length < pageSize) break;
  }
  return pulls.map(normalizePullRequest);
}

export async function getPullRequest(
  org: string,
  project: string,
  repoId: string,
  prId: number,
): Promise<PullRequestSummary & { mergeStatus?: string }> {
  const raw = await client(org, project).get<AdoPullRequest>(
    `git/repositories/${encodeURIComponent(repoId)}/pullrequests/${prId}`,
    { "api-version": API_VERSION },
  );
  return { ...normalizePullRequest(raw), mergeStatus: raw.mergeStatus };
}

async function listPullRequestThreads(
  org: string,
  project: string,
  repoId: string,
  prId: number,
): Promise<AdoThread[]> {
  const response = await client(org, project).get<ValueResponse<AdoThread>>(
    `git/repositories/${encodeURIComponent(repoId)}/pullRequests/${prId}/threads`,
    { "api-version": API_VERSION },
  );
  return response.value ?? [];
}

export async function getPullRequestComments(
  org: string,
  project: string,
  repoId: string,
  prId: number,
): Promise<PullRequestComment[]> {
  const threads = await listPullRequestThreads(org, project, repoId, prId);
  const comments: PullRequestComment[] = [];
  for (const thread of threads) {
    for (const comment of thread.comments ?? []) {
      if (comment.isDeleted || !comment.content) continue;
      comments.push({
        id: comment.id,
        threadId: thread.id,
        author: comment.author?.displayName ?? comment.author?.uniqueName ?? "Unknown author",
        content: comment.content,
        publishedAt: comment.publishedDate,
        updatedAt: comment.lastUpdatedDate,
        status: thread.status,
      });
    }
  }
  return comments.sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""));
}

export function normalizePullRequestInlineComments(threads: AdoThread[], path: string, aliases: string[] = []): PullRequestInlineComment[] {
  const filePaths = new Set([path, ...aliases].map((value) => normalizeRepositoryPath(value).toLocaleLowerCase("en-US")));
  return threads.flatMap((thread) => {
    const context = thread.threadContext;
    if (!context?.filePath) return [];
    let threadPath: string;
    try {
      threadPath = normalizeRepositoryPath(context.filePath).toLocaleLowerCase("en-US");
    } catch {
      return [];
    }
    if (!filePaths.has(threadPath)) return [];
    const position = context.rightFileStart
      ? { lineNumber: context.rightFileStart.line, side: "new" as const }
      : context.leftFileStart
        ? { lineNumber: context.leftFileStart.line, side: "old" as const }
        : undefined;
    if (!position) return [];
    const lineNumber = position.lineNumber;
    if (lineNumber === undefined || lineNumber < 1) return [];
    return (thread.comments ?? []).flatMap((comment) => {
      if (comment.isDeleted || !comment.content || comment.commentType === "system") return [];
      return [{
        threadId: thread.id,
        commentId: comment.id,
        author: comment.author?.displayName ?? comment.author?.uniqueName ?? "Unknown author",
        content: comment.content,
        publishedAt: comment.publishedDate,
        status: thread.status,
        lineNumber,
        side: position.side,
      }];
    });
  });
}

async function latestIteration(
  org: string,
  project: string,
  repoId: string,
  prId: number,
): Promise<number | undefined> {
  const response = await client(org, project).get<ValueResponse<AdoPullRequestIteration>>(
    `git/repositories/${encodeURIComponent(repoId)}/pullRequests/${prId}/iterations`,
    { "api-version": API_VERSION },
  );
  return response.value?.reduce<number | undefined>((latest, iteration) =>
    latest === undefined || iteration.id > latest ? iteration.id : latest, undefined);
}

async function listPrChanges(
  org: string,
  project: string,
  repoId: string,
  prId: number,
  iterationId?: number,
): Promise<AdoPullRequestChange[]> {
  const selectedIteration = iterationId ?? await latestIteration(org, project, repoId, prId);
  if (!selectedIteration) return [];
  const scoped = client(org, project);
  const changes: AdoPullRequestChange[] = [];
  let skip = 0;
  let top = 2000;
  while (true) {
    const response = await scoped.get<AdoPullRequestIterationChanges>(
      `git/repositories/${encodeURIComponent(repoId)}/pullRequests/${prId}/iterations/${selectedIteration}/changes`,
      { "$top": top, "$skip": skip, "api-version": API_VERSION },
    );
    const { entries: page, nextSkip, nextTop } = normalizeIterationChangePage(response);
    changes.push(...page);
    if (nextSkip === undefined || page.length === 0 || nextSkip <= skip) break;
    skip = nextSkip;
    top = nextTop ?? top;
  }
  return changes;
}

async function getItemText(
  org: string,
  project: string,
  repoId: string,
  path: string,
  commit: string,
): Promise<string | null> {
  try {
    return await client(org, project).getText(
      `git/repositories/${encodeURIComponent(repoId)}/items`,
      {
        path,
        "versionDescriptor.version": commit,
        "versionDescriptor.versionType": "commit",
        includeContent: true,
        "$format": "text",
        "api-version": API_VERSION,
      },
    );
  } catch (error) {
    if (error instanceof AdoHttpError && error.status === 415) return null;
    throw error;
  }
}

export interface PullRequestInlineCommentAnchor {
  filePath: string;
  lineNumber: number;
  side: "old" | "new";
  changeTrackingId: number;
  latestIteration: number;
}

export async function getPullRequestInlineCommentAnchor(
  org: string,
  project: string,
  repoId: string,
  prId: number,
  filePath: string,
  lineNumber: number,
  side: "old" | "new",
): Promise<PullRequestInlineCommentAnchor> {
  const normalizedPath = normalizeRepositoryPath(filePath);
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) {
    throw new AdoHttpError("A valid changed line is required.", 400, "", JSON.stringify({ message: "A valid changed line is required." }));
  }
  const iterationId = await latestIteration(org, project, repoId, prId);
  if (!iterationId) throw new AdoHttpError("This pull request has no review iteration to comment on.", 409, "", JSON.stringify({ message: "This pull request has no review iteration to comment on." }));
  const [pr, changes] = await Promise.all([
    getPullRequest(org, project, repoId, prId),
    listPrChanges(org, project, repoId, prId, iterationId),
  ]);
  const change = changes.find((entry) => {
    const candidatePath = entry.item?.path || entry.originalPath;
    return candidatePath && normalizeRepositoryPath(candidatePath) === normalizedPath;
  });
  if (!change) throw new AdoHttpError("That file is no longer part of this pull request. Refresh and try again.", 409, "", JSON.stringify({ message: "That file is no longer part of this pull request. Refresh and try again." }));
  if (change.changeTrackingId === undefined) {
    throw new AdoHttpError("Azure DevOps did not provide a review position for this file.", 409, "", JSON.stringify({ message: "Azure DevOps did not provide a review position for this file." }));
  }
  const sourceCommit = pr.sourceCommit;
  const targetCommit = pr.targetCommit;
  if (!sourceCommit || !targetCommit) {
    throw new AdoHttpError("Azure DevOps did not provide the current pull request commits.", 409, "", JSON.stringify({ message: "Azure DevOps did not provide the current pull request commits." }));
  }

  const changeType = change.changeType?.toLowerCase() ?? "edit";
  const isMissingOnSide = side === "old" ? changeType.includes("add") : changeType.includes("delete");
  const content = isMissingOnSide
    ? ""
    : await getItemText(
      org,
      project,
      repoId,
      side === "old" ? (change.originalPath ?? normalizedPath) : normalizedPath,
      side === "old" ? targetCommit : sourceCommit,
    );
  if (content === null) throw new AdoHttpError("Inline comments are unavailable for binary files.", 415, "", JSON.stringify({ message: "Inline comments are unavailable for binary files." }));
  const lineCount = content === "" ? 0 : content.split(/\r\n|\n/).length - (content.endsWith("\n") ? 1 : 0);
  if (lineNumber > lineCount) {
    throw new AdoHttpError("The pull request changed and that line is no longer available. Refresh and try again.", 409, "", JSON.stringify({ message: "The pull request changed and that line is no longer available. Refresh and try again." }));
  }

  return {
    filePath: normalizedPath,
    lineNumber,
    side,
    changeTrackingId: change.changeTrackingId,
    latestIteration: iterationId,
  };
}

async function mapInBatches<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const batch = await Promise.all(items.slice(index, index + size).map((item, offset) => fn(item, index + offset)));
    output.push(...batch);
  }
  return output;
}

export async function getPullRequestFiles(
  org: string,
  project: string,
  repoId: string,
  prId: number,
  maxDiffFiles = 30,
): Promise<PullRequestFile[]> {
  const [pr, changes, threads] = await Promise.all([
    getPullRequest(org, project, repoId, prId),
    listPrChanges(org, project, repoId, prId),
    listPullRequestThreads(org, project, repoId, prId),
  ]);
  const sourceCommit = pr.sourceCommit;
  const targetCommit = pr.targetCommit;
  const fileChanges = normalizePullRequestFileChanges(changes);

  if (!sourceCommit || !targetCommit) {
    return fileChanges.map(({ path, previousPath, changeType, size }) => ({
      path,
      previousPath,
      changeType,
      size,
      inlineComments: normalizePullRequestInlineComments(threads, path, previousPath ? [previousPath] : []),
    }));
  }

  return mapInBatches(fileChanges, 5, async ({ path, previousPath, changeType, size }, index) => {
    if (isInlineDiffDeferred(index, maxDiffFiles)) {
      return {
        path,
        previousPath,
        changeType,
        size,
        inlineComments: normalizePullRequestInlineComments(threads, path, previousPath ? [previousPath] : []),
        renderingDeferred: true,
      } satisfies PullRequestFile;
    }
    const beforePath = previousPath ?? path;
    const [before, after] = await Promise.all([
      changeType.includes("add") ? Promise.resolve("") : getItemText(org, project, repoId, beforePath, targetCommit),
      changeType.includes("delete") ? Promise.resolve("") : getItemText(org, project, repoId, path, sourceCommit),
    ]);

    if (before === null || after === null) {
      return { path, previousPath, changeType, size, inlineComments: normalizePullRequestInlineComments(threads, path, previousPath ? [previousPath] : []), binary: true } satisfies PullRequestFile;
    }
    if (before.length + after.length > 400_000) {
      return { path, previousPath, changeType, size, inlineComments: normalizePullRequestInlineComments(threads, path, previousPath ? [previousPath] : []), tooLarge: true } satisfies PullRequestFile;
    }
    return {
      path,
      previousPath,
      changeType,
      size,
      beforeContent: before,
      afterContent: after,
      inlineComments: normalizePullRequestInlineComments(threads, path, previousPath ? [previousPath] : []),
    } satisfies PullRequestFile;
  });
}
