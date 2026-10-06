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
  const scope = policy.configuration?.settings?.scope?.map((entry) => entry.refName?.replace(/^refs\/heads\//, ""));
  const scopeNames = [...new Set(scope?.filter((name): name is string => Boolean(name)))];
  const scopedName = scopeNames.length > 0
    ? `${type} · ${scopeNames.join(", ")}`
    : scope?.length
      ? `${type} · all branches`
      : type;
  const approvers = policy.configuration?.settings?.minimumApproverCount;
  return {
    id: `policy:${policy.evaluationId ?? policy.configuration?.id ?? type}`,
    name: scopedName,
    status: normalizePolicyStatus(policy.status),
    required: Boolean(policy.configuration?.isBlocking),
    source: "policy",
    runId: policy.context?.buildId ? String(policy.context.buildId) : undefined,
    description: approvers === undefined ? undefined : `${approvers} approving ${approvers === 1 ? "vote" : "votes"} required`,
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
      return "queued";
    default:
      return "queued";
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

function timelineKind(record: AdoTimelineRecord): TimelineItem["kind"] | null {
  switch (record.type?.toLowerCase()) {
    case "stage": return "stage";
    case "job": return "job";
    case "task": return "step";
    case "checkpoint":
    case "checkpoint.approval": return "approval";
    default: return null;
  }
}

export function normalizeTimelineRecord(record: AdoTimelineRecord): TimelineItem | null {
  const kind = timelineKind(record);
  if (!kind) return null;
  return {
    id: record.id,
    parentId: record.parentId,
    kind,
    name: record.name ?? (kind === "approval" ? "Approval gate" : "Unnamed pipeline record"),
    status: normalizeTimelineStatus(record),
    order: record.order ?? 0,
    startTime: record.startTime,
    finishTime: record.finishTime,
    logId: record.log?.id,
    errorCount: record.errorCount,
    warningCount: record.warningCount,
  };
}

/**
 * Keep the useful Stage → Job → Task hierarchy while accounting for ADO's
 * additional Phase layer. Approval checkpoints are visible pipeline blockers;
 * the structural Checkpoint parent is omitted when its Approval child exists.
 */
export function normalizeTimelineRecords(records: AdoTimelineRecord[]): TimelineItem[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const approvalParents = new Set(
    records
      .filter((record) => record.type?.toLowerCase() === "checkpoint.approval" && record.parentId)
      .map((record) => record.parentId as string),
  );
  const items: TimelineItem[] = [];
  const indexes = new Map<string, number>();

  records.forEach((record, index) => {
    if (record.type?.toLowerCase() === "checkpoint" && approvalParents.has(record.id)) return;
    const item = normalizeTimelineRecord(record);
    if (!item) return;

    let parentId = record.parentId ?? undefined;
    let hops = 0;
    while (parentId && hops <= records.length) {
      const parent = byId.get(parentId);
      if (!parent) {
        parentId = undefined;
        break;
      }
      const parentType = parent.type?.toLowerCase();
      if (parentType === "phase" || (parentType === "checkpoint" && approvalParents.has(parent.id))) {
        parentId = parent.parentId;
        hops += 1;
        continue;
      }
      if (timelineKind(parent)) break;
      parentId = parent.parentId;
      hops += 1;
    }

    item.parentId = parentId;
    items.push(item);
    indexes.set(item.id, index);
  });

  const itemIds = new Set(items.map((item) => item.id));
  const children = new Map<string, TimelineItem[]>();
  const roots: TimelineItem[] = [];
  for (const item of items) {
    if (item.parentId && itemIds.has(item.parentId)) {
      const siblings = children.get(item.parentId) ?? [];
      siblings.push(item);
      children.set(item.parentId, siblings);
    } else {
      roots.push(item);
    }
  }
  const byOrder = (left: TimelineItem, right: TimelineItem) =>
    left.order - right.order || (indexes.get(left.id) ?? 0) - (indexes.get(right.id) ?? 0);
  roots.sort(byOrder);
  for (const siblings of children.values()) siblings.sort(byOrder);

  const sorted: TimelineItem[] = [];
  const visited = new Set<string>();
  const visit = (item: TimelineItem) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    sorted.push(item);
    for (const child of children.get(item.id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  for (const item of [...items].sort(byOrder)) visit(item);
  return sorted;
}

export function normalizeBuild(build: AdoBuild): WorkflowRun {
  const start = build.startTime ? Date.parse(build.startTime) : undefined;
  const finish = build.finishTime ? Date.parse(build.finishTime) : undefined;
  const prRaw = build.triggerInfo?.["pr.number"] ?? build.triggerInfo?.["pr.id"];
  const branchPrId = /^refs\/pull\/(\d+)\/merge$/.exec(build.sourceBranch ?? "")?.[1];
  const prId = prRaw && /^\d+$/.test(prRaw)
    ? Number(prRaw)
    : branchPrId
      ? Number(branchPrId)
      : undefined;

  return {
    id: String(build.id),
    name: build.definition?.name ?? `Pipeline #${build.id}`,
    runNumber: build.buildNumber,
    status: normalizeBuildStatus(build),
    branch: stripRef(build.sourceBranch),
    commit: build.sourceVersion,
    prId,
    requestedBy: build.requestedFor?.displayName ?? build.requestedBy?.displayName,
    startTime: build.startTime ?? build.queueTime,
    finishTime: build.finishTime,
    durationMs: start !== undefined && finish !== undefined ? Math.max(0, finish - start) : undefined,
    webUrl: build._links?.web?.href,
    definitionId: build.definition?.id,
  };
}
