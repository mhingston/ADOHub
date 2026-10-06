export interface AdoIdentity {
  id?: string;
  displayName?: string;
  uniqueName?: string;
  imageUrl?: string;
  isRequired?: boolean;
  vote?: number;
}

export interface AdoRepository {
  id: string;
  name: string;
  defaultBranch?: string;
  webUrl?: string;
  project?: { id?: string; name?: string };
}

export interface AdoConnectionData {
  authenticatedUser?: { id?: string };
}

export interface AdoGitItem {
  path: string;
  gitObjectType?: string;
  commitId?: string;
  size?: number;
  isFolder?: boolean;
}

export interface AdoRef {
  name: string;
  objectId: string;
}

export interface AdoPullRequest {
  pullRequestId: number;
  title: string;
  description?: string;
  status: string;
  isDraft?: boolean;
  creationDate?: string;
  closedDate?: string;
  updatedDate?: string;
  createdBy?: AdoIdentity;
  reviewers?: AdoIdentity[];
  sourceRefName: string;
  targetRefName: string;
  mergeStatus?: string;
  repository?: Pick<AdoRepository, "id" | "name" | "webUrl">;
  url?: string;
  lastMergeSourceCommit?: { commitId?: string };
  lastMergeTargetCommit?: { commitId?: string };
  completionOptions?: {
    mergeStrategy?: string;
    deleteSourceBranch?: boolean;
    transitionWorkItems?: boolean;
  };
  mergeOptions?: { conflict?: string };
  completionQueueTime?: string;
  _links?: Record<string, { href?: string }>;
}

export interface AdoComment {
  id: number;
  parentCommentId?: number;
  content?: string;
  publishedDate?: string;
  lastUpdatedDate?: string;
  author?: AdoIdentity;
  isDeleted?: boolean;
  commentType?: string;
}

export interface AdoThread {
  id: number;
  status?: string;
  comments?: AdoComment[];
  threadContext?: {
    filePath?: string;
    leftFileStart?: { line?: number; offset?: number };
    rightFileStart?: { line?: number; offset?: number };
  };
  pullRequestThreadContext?: {
    changeTrackingId?: number;
    iterationContext?: {
      firstComparingIteration?: number;
      secondComparingIteration?: number;
    };
  };
}

export interface AdoPullRequestIteration {
  id: number;
}

export interface AdoPullRequestChange {
  changeId?: number;
  changeTrackingId?: number;
  changeType?: string;
  originalPath?: string;
  item?: {
    path?: string | null;
    gitObjectType?: string;
    isFolder?: boolean;
    size?: number;
    objectId?: string;
  };
}

export interface AdoPullRequestIterationChanges {
  changeEntries?: AdoPullRequestChange[];
  nextSkip?: number;
  nextTop?: number;
  changes?: {
    changeEntries?: AdoPullRequestChange[];
    nextSkip?: number;
    nextTop?: number;
  };
}

export interface AdoBuild {
  id: number;
  buildNumber?: string;
  status?: string;
  result?: string;
  sourceBranch?: string;
  sourceVersion?: string;
  queueTime?: string;
  startTime?: string;
  finishTime?: string;
  reason?: string;
  requestedFor?: AdoIdentity;
  requestedBy?: AdoIdentity;
  definition?: { id?: number; name?: string };
  repository?: { id?: string; name?: string; type?: string };
  triggerInfo?: Record<string, string>;
  _links?: { web?: { href?: string } };
}

export interface AdoTimelineRecord {
  id: string;
  parentId?: string;
  type?: string;
  name?: string;
  order?: number;
  state?: string;
  result?: string;
  startTime?: string;
  finishTime?: string;
  errorCount?: number;
  warningCount?: number;
  log?: { id?: number };
}

export interface AdoPolicyEvaluation {
  evaluationId?: string;
  startedDate?: string;
  completedDate?: string;
  status?: string;
  configuration?: {
    id?: number;
    isEnabled?: boolean;
    isDeleted?: boolean;
    isBlocking?: boolean;
    type?: { displayName?: string; id?: string };
    settings?: {
      minimumApproverCount?: number;
      scope?: Array<{ refName?: string | null; matchKind?: string; repositoryId?: string | null }>;
      [key: string]: unknown;
    };
  };
  context?: { buildId?: number };
}

export interface AdoPrStatus {
  id?: number;
  state?: string;
  description?: string;
  targetUrl?: string;
  context?: { name?: string; genre?: string };
  creationDate?: string;
  updatedDate?: string;
}
