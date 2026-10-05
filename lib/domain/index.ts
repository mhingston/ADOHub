export type CheckStatus =
  | "queued"
  | "running"
  | "success"
  | "failure"
  | "cancelled"
  | "skipped";

export interface Check {
  id: string;
  name: string;
  status: CheckStatus;
  required: boolean;
  source: "build" | "policy" | "status" | "merge";
  detailsUrl?: string;
  runId?: string;
  description?: string;
}

export interface Repository {
  id: string;
  name: string;
  defaultBranch: string;
  webUrl?: string;
  projectId?: string;
}

export interface RepositoryItem {
  path: string;
  name: string;
  isFolder: boolean;
  commitId?: string;
  size?: number;
}

export interface Branch {
  name: string;
  objectId: string;
  isDefault: boolean;
}

export type ReviewState =
  | "approved"
  | "approved-with-suggestions"
  | "waiting-for-author"
  | "changes-requested"
  | "none";

export interface Review {
  id: string;
  displayName: string;
  avatarUrl?: string;
  state: ReviewState;
  required: boolean;
}

export interface PullRequestSummary {
  id: number;
  title: string;
  description?: string;
  author: string;
  authorAvatarUrl?: string;
  sourceBranch: string;
  targetBranch: string;
  isDraft: boolean;
  status: "open" | "completed" | "abandoned";
  reviewers: Review[];
  updatedAt: string;
  createdAt: string;
  webUrl?: string;
  sourceCommit?: string;
  targetCommit?: string;
}

export interface PullRequestComment {
  id: number;
  threadId: number;
  author: string;
  content: string;
  publishedAt?: string;
  updatedAt?: string;
  status?: string;
}

export interface PullRequestDetail extends PullRequestSummary {
  comments: PullRequestComment[];
  checks: Check[];
  mergeStatus?: string;
}

export interface PullRequestFile {
  path: string;
  changeType: string;
  patch?: string;
  binary?: boolean;
  tooLarge?: boolean;
}

export type RunStatus = CheckStatus;

export interface WorkflowRun {
  id: string;
  name: string;
  runNumber?: string;
  status: RunStatus;
  branch?: string;
  commit?: string;
  prId?: number;
  requestedBy?: string;
  startTime?: string;
  finishTime?: string;
  durationMs?: number;
  webUrl?: string;
  definitionId?: number;
}

export type TimelineKind = "stage" | "job" | "step";

export interface TimelineItem {
  id: string;
  parentId?: string;
  kind: TimelineKind;
  name: string;
  status: RunStatus;
  order: number;
  startTime?: string;
  finishTime?: string;
  logId?: number;
  errorCount?: number;
  warningCount?: number;
}

export interface WorkflowRunDetail extends WorkflowRun {
  timeline: TimelineItem[];
}

export interface LogChunk {
  logId: number;
  text: string;
  startLine: number;
  lineCount: number;
}
