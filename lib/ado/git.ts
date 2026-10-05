import { createTwoFilesPatch } from "diff";
import { AdoHttpError, AzureDevOpsClient } from "@/lib/ado/client";
import { normalizeVote, stripRef } from "@/lib/ado/normalizers";
import type {
  AdoGitItem,
  AdoPullRequest,
  AdoPullRequestChange,
  AdoPullRequestIteration,
  AdoRef,
  AdoRepository,
  AdoThread,
} from "@/lib/ado/types";
import type {
  Branch,
  PullRequestComment,
  PullRequestFile,
  PullRequestSummary,
  Repository,
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
): Promise<RepositoryItem[]> {
  const response = await client(org, project).get<ValueResponse<AdoGitItem>>(
    `git/repositories/${encodeURIComponent(repoId)}/items`,
    {
      scopePath: "/",
      recursionLevel: "OneLevel",
      includeContentMetadata: true,
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

function normalizePullRequest(pr: AdoPullRequest): PullRequestSummary {
  const status = pr.status === "completed" ? "completed" : pr.status === "abandoned" ? "abandoned" : "open";
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
    updatedAt: pr.closedDate ?? pr.creationDate ?? new Date(0).toISOString(),
    webUrl: pr._links?.web?.href,
    sourceCommit: pr.lastMergeSourceCommit?.commitId,
    targetCommit: pr.lastMergeTargetCommit?.commitId,
  };
}

export async function listPullRequests(
  org: string,
  project: string,
  repoId: string,
  status: "active" | "completed" | "abandoned" | "all" = "active",
): Promise<PullRequestSummary[]> {
  const response = await client(org, project).get<ValueResponse<AdoPullRequest>>(
    `git/repositories/${encodeURIComponent(repoId)}/pullrequests`,
    {
      "searchCriteria.status": status,
      "$top": 100,
      "api-version": API_VERSION,
    },
  );
  return (response.value ?? []).map(normalizePullRequest);
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

export async function getPullRequestComments(
  org: string,
  project: string,
  repoId: string,
  prId: number,
): Promise<PullRequestComment[]> {
  const response = await client(org, project).get<ValueResponse<AdoThread>>(
    `git/repositories/${encodeURIComponent(repoId)}/pullRequests/${prId}/threads`,
    { "api-version": API_VERSION },
  );
  const comments: PullRequestComment[] = [];
  for (const thread of response.value ?? []) {
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
  return response.value?.at(-1)?.id;
}

async function listPrChanges(
  org: string,
  project: string,
  repoId: string,
  prId: number,
): Promise<AdoPullRequestChange[]> {
  const iterationId = await latestIteration(org, project, repoId, prId);
  if (!iterationId) return [];
  const response = await client(org, project).get<ValueResponse<AdoPullRequestChange>>(
    `git/repositories/${encodeURIComponent(repoId)}/pullRequests/${prId}/iterations/${iterationId}/changes`,
    { "$top": 2000, "api-version": API_VERSION },
  );
  return response.value ?? [];
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
    if (error instanceof AdoHttpError && [404, 415].includes(error.status)) return null;
    throw error;
  }
}

async function mapInBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(...(await Promise.all(items.slice(index, index + size).map(fn))));
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
  const [pr, changes] = await Promise.all([
    getPullRequest(org, project, repoId, prId),
    listPrChanges(org, project, repoId, prId),
  ]);
  const sourceCommit = pr.sourceCommit;
  const targetCommit = pr.targetCommit;
  const fileChanges = changes.filter((change) => change.item?.path && !change.item.isFolder).slice(0, maxDiffFiles);

  if (!sourceCommit || !targetCommit) {
    return fileChanges.map((change) => ({
      path: change.item?.path ?? "unknown",
      changeType: change.changeType ?? "edit",
    }));
  }

  return mapInBatches(fileChanges, 5, async (change) => {
    const path = change.item?.path ?? "unknown";
    const changeType = change.changeType?.toLowerCase() ?? "edit";
    const [before, after] = await Promise.all([
      changeType.includes("add") ? Promise.resolve("") : getItemText(org, project, repoId, path, targetCommit),
      changeType.includes("delete") ? Promise.resolve("") : getItemText(org, project, repoId, path, sourceCommit),
    ]);

    if (before === null || after === null) {
      return { path, changeType, binary: true } satisfies PullRequestFile;
    }
    if (before.length + after.length > 400_000) {
      return { path, changeType, tooLarge: true } satisfies PullRequestFile;
    }
    return {
      path,
      changeType,
      patch: createTwoFilesPatch(`a${path}`, `b${path}`, before, after, targetCommit.slice(0, 8), sourceCommit.slice(0, 8), { context: 4 }),
    } satisfies PullRequestFile;
  });
}
