import type {
  Check,
  CheckStatus,
  ReviewState,
  RunStatus,
  TimelineItem,
  WorkflowRun,
} from "@/lib/domain";
import type {
  AdoBuild,
  AdoPolicyEvaluation,
  AdoPrStatus,
  AdoTimelineRecord,
} from "@/lib/ado/types";

export function stripRef(ref?: string): string {
  if (!ref) return "";
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/pull\//, "PR ");
}

export function normalizeVote(vote = 0): ReviewState {
  if (vote >= 10) return "approved";
  if (vote >= 5) return "approved-with-suggestions";
  if (vote <= -10) return "changes-requested";
  if (vote <= -5) return "waiting-for-author";
  return "none";
}

export function normalizeBuildStatus(build: AdoBuild): RunStatus {
  const result = build.result?.toLowerCase();
  const status = build.status?.toLowerCase();

  if (result === "succeeded" || result === "partiallysucceeded") return "success";
  if (result === "failed") return "failure";
  if (result === "canceled" || result === "cancelled") return "cancelled";
  if (result === "skipped") return "skipped";
  if (status === "inprogress" || status === "cancelling") return "running";
  return "queued";
}

export function normalizeBuildCheck(build: AdoBuild): Check {
  return {
    id: `build:${build.id}`,
    name: build.definition?.name ?? `Pipeline #${build.id}`,
    status: normalizeBuildStatus(build),
    required: false,
    source: "build",
    detailsUrl: build._links?.web?.href,
    runId: String(build.id),
    description: build.buildNumber ? `Run ${build.buildNumber}` : undefined,
  };
}

function normalizePolicyStatus(status?: string): CheckStatus {
  switch (status?.toLowerCase()) {
    case "approved":
      return "success";
    case "rejected":
    case "broken":
      return "failure";
    case "running":
      return "running";
    case "queued":
      return "queued";
    case "notapplicable":
      return "skipped";
    default:
      return "queued";
  }
}

export function normalizePolicyCheck(policy: AdoPolicyEvaluation): Check {
  const type = policy.configuration?.type?.displayName ?? "Branch policy";
  return {
    id: `policy:${policy.evaluationId ?? policy.configuration?.id ?? type}`,
    name: type,
    status: normalizePolicyStatus(policy.status),
    required: Boolean(policy.configuration?.isBlocking),
    source: "policy",
    runId: policy.context?.buildId ? String(policy.context.buildId) : undefined,
  };
}

function normalizePrStatusState(state?: string): CheckStatus {
  switch (state?.toLowerCase()) {
    case "succeeded":
      return "success";
    case "failed":
    case "error":
      return "failure";
    case "notapplicable":
      return "skipped";
    case "pending":
    default:
      return "running";
  }
}

export function normalizePrStatusCheck(status: AdoPrStatus): Check {
  const genre = status.context?.genre;
  const name = status.context?.name ?? "External status";
  return {
    id: `status:${genre ?? "status"}:${name}:${status.id ?? "latest"}`,
    name: genre ? `${genre} / ${name}` : name,
    status: normalizePrStatusState(status.state),
    required: false,
    source: "status",
    detailsUrl: status.targetUrl,
    description: status.description,
  };
}

export function normalizeTimelineStatus(record: AdoTimelineRecord): RunStatus {
  const result = record.result?.toLowerCase();
  const state = record.state?.toLowerCase();
  if (result === "succeeded" || result === "succeededwithissues") return "success";
  if (result === "failed") return "failure";
  if (result === "canceled" || result === "cancelled" || result === "abandoned") return "cancelled";
  if (result === "skipped") return "skipped";
  if (state === "inprogress") return "running";
  return "queued";
}

export function normalizeTimelineRecord(record: AdoTimelineRecord): TimelineItem | null {
  const type = record.type?.toLowerCase();
  const kind = type === "stage" ? "stage" : type === "job" ? "job" : type === "task" ? "step" : null;
  if (!kind || !record.name) return null;
  return {
    id: record.id,
    parentId: record.parentId,
    kind,
    name: record.name,
    status: normalizeTimelineStatus(record),
    order: record.order ?? 0,
    startTime: record.startTime,
    finishTime: record.finishTime,
    logId: record.log?.id,
    errorCount: record.errorCount,
    warningCount: record.warningCount,
  };
}

export function normalizeBuild(build: AdoBuild): WorkflowRun {
  const start = build.startTime ? Date.parse(build.startTime) : undefined;
  const finish = build.finishTime ? Date.parse(build.finishTime) : undefined;
  const prRaw = build.triggerInfo?.["pr.number"] ?? build.triggerInfo?.["pr.id"];
  const prId = prRaw && /^\d+$/.test(prRaw) ? Number(prRaw) : undefined;

  return {
    id: String(build.id),
    name: build.definition?.name ?? `Pipeline #${build.id}`,
    runNumber: build.buildNumber,
    status: normalizeBuildStatus(build),
    branch: stripRef(build.sourceBranch),
    commit: build.sourceVersion,
    prId,
    requestedBy: build.requestedFor?.displayName,
    startTime: build.startTime ?? build.queueTime,
    finishTime: build.finishTime,
    durationMs: start !== undefined && finish !== undefined ? Math.max(0, finish - start) : undefined,
    webUrl: build._links?.web?.href,
    definitionId: build.definition?.id,
  };
}
