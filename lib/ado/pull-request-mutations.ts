import { AzureDevOpsClient } from "@/lib/ado/client";
import type { PullRequestInlineCommentAnchor } from "@/lib/ado/git";
import type { AdoPullRequest, AdoThread } from "@/lib/ado/types";

const API_VERSION = "7.1";
export type AdoVote = -10 | -5 | 0 | 5 | 10;
export type MergeStrategy = "squash" | "noFastForward";

export function createInlineCommentPayload(content: string, anchor: PullRequestInlineCommentAnchor) {
  const position = { line: anchor.lineNumber, offset: 1 };
  return {
    comments: [{ parentCommentId: 0, content, commentType: 1 }],
    status: 1,
    threadContext: {
      filePath: anchor.filePath,
      leftFileStart: anchor.side === "old" ? position : null,
      leftFileEnd: anchor.side === "old" ? position : null,
      rightFileStart: anchor.side === "new" ? position : null,
      rightFileEnd: anchor.side === "new" ? position : null,
    },
    pullRequestThreadContext: {
      changeTrackingId: anchor.changeTrackingId,
      iterationContext: {
        firstComparingIteration: 0,
        secondComparingIteration: anchor.latestIteration,
      },
    },
  };
}

export async function addPullRequestInlineComment(
  org: string,
  project: string,
  repoId: string,
  prId: number,
  content: string,
  anchor: PullRequestInlineCommentAnchor,
): Promise<AdoThread> {
  return new AzureDevOpsClient({ org, project }).post<AdoThread>(
    `${prPath(repoId, prId)}/threads`,
    createInlineCommentPayload(content, anchor),
    { "api-version": API_VERSION },
  );
}

function prPath(repoId: string, prId: number) {
  return `git/repositories/${encodeURIComponent(repoId)}/pullrequests/${prId}`;
}

export async function addPullRequestComment(
  org: string,
  project: string,
  repoId: string,
  prId: number,
  content: string,
): Promise<void> {
  await new AzureDevOpsClient({ org, project }).post<AdoThread>(`${prPath(repoId, prId)}/threads`, {
    comments: [{ parentCommentId: 0, content, commentType: 1 }],
    status: 1,
  }, { "api-version": API_VERSION });
}

export async function setPullRequestVote(
  org: string,
  project: string,
  repoId: string,
  prId: number,
  userId: string,
  vote: AdoVote,
): Promise<void> {
  await new AzureDevOpsClient({ org, project }).put(
    `${prPath(repoId, prId)}/reviewers/${encodeURIComponent(userId)}`,
    { vote },
    { "api-version": API_VERSION },
  );
}

export function createCompletionPayload(
  sourceCommit: string,
  mergeStrategy: MergeStrategy,
  deleteSourceBranch: boolean,
) {
  return {
    status: "completed",
    lastMergeSourceCommit: { commitId: sourceCommit },
    completionOptions: {
      mergeStrategy,
      deleteSourceBranch,
      transitionWorkItems: false,
    },
  };
}

export async function completePullRequest(
  org: string,
  project: string,
  repoId: string,
  prId: number,
  options: { mergeStrategy: MergeStrategy; deleteSourceBranch: boolean },
): Promise<AdoPullRequest> {
  const client = new AzureDevOpsClient({ org, project });
  const current = await client.get<AdoPullRequest>(prPath(repoId, prId), { "api-version": API_VERSION });
  const sourceCommit = current.lastMergeSourceCommit?.commitId;
  if (!sourceCommit) throw new Error("Azure DevOps has not provided the current source commit for this pull request.");
  return client.patch<AdoPullRequest>(
    prPath(repoId, prId),
    createCompletionPayload(sourceCommit, options.mergeStrategy, options.deleteSourceBranch),
    { "api-version": API_VERSION },
  );
}

export async function setPullRequestStatus(
  org: string,
  project: string,
  repoId: string,
  prId: number,
  status: "active" | "abandoned",
): Promise<AdoPullRequest> {
  return new AzureDevOpsClient({ org, project }).patch<AdoPullRequest>(
    prPath(repoId, prId),
    { status },
    { "api-version": API_VERSION },
  );
}
