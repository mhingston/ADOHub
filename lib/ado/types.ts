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
  createdBy?: AdoIdentity;
  reviewers?: AdoIdentity[];
  sourceRefName: string;
  targetRefName: string;
  mergeStatus?: string;
  lastMergeSourceCommit?: { commitId?: string };
  lastMergeTargetCommit?: { commitId?: string };
  _links?: { web?: { href?: string } };
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
}

export interface AdoPullRequestIteration {
  id: number;
}

export interface AdoPullRequestChange {
  changeId?: number;
  changeType?: string;
  item?: { path?: string; gitObjectType?: string; isFolder?: boolean };
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
  definition?: { id?: number; name?: string };
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
  status?: string;
  configuration?: {
    id?: number;
    isEnabled?: boolean;
    isBlocking?: boolean;
    type?: { displayName?: string; id?: string };
    settings?: Record<string, unknown>;
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
