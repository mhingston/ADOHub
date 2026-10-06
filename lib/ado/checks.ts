import { AzureDevOpsClient } from "@/lib/ado/client";
import { normalizeBuildCheck, normalizePolicyCheck, normalizePrStatusCheck } from "@/lib/ado/normalizers";
import type { AdoBuild, AdoPolicyEvaluation, AdoPrStatus } from "@/lib/ado/types";
import type { Check } from "@/lib/domain";

const API_VERSION = "7.1";
type ValueResponse<T> = { count?: number; value?: T[] };

function latest<T>(left: T, right: T, date: (item: T) => string | undefined, tie: (item: T) => number) {
  const leftTime = Date.parse(date(left) ?? "") || 0;
  const rightTime = Date.parse(date(right) ?? "") || 0;
  return rightTime > leftTime || (rightTime === leftTime && tie(right) > tie(left)) ? right : left;
}

export function selectLatestPrStatuses(statuses: AdoPrStatus[]): AdoPrStatus[] {
  const byContext = new Map<string, AdoPrStatus>();
  for (const status of statuses) {
    const key = `${status.context?.genre ?? ""}\u0000${status.context?.name ?? `status:${status.id ?? "unknown"}`}`;
    const existing = byContext.get(key);
    byContext.set(key, existing ? latest(existing, status, (item) => item.updatedDate ?? item.creationDate, (item) => item.id ?? 0) : status);
  }
  return [...byContext.values()];
}

export function selectCurrentPolicies(policies: AdoPolicyEvaluation[]): AdoPolicyEvaluation[] {
  const byConfiguration = new Map<string, AdoPolicyEvaluation>();
  for (const policy of policies) {
    if (policy.configuration?.isEnabled === false || policy.configuration?.isDeleted === true) continue;
    const key = String(policy.configuration?.id ?? policy.evaluationId ?? `${policy.status ?? "unknown"}:${policy.startedDate ?? "unknown"}`);
    const existing = byConfiguration.get(key);
    byConfiguration.set(key, existing
      ? latest(existing, policy, (item) => item.startedDate ?? item.completedDate, () => 0)
      : policy);
  }
  return [...byConfiguration.values()];
}

export function selectCurrentBuilds(builds: AdoBuild[]): AdoBuild[] {
  const byDefinition = new Map<string, AdoBuild>();
  for (const build of builds) {
    const key = String(build.definition?.id ?? build.definition?.name ?? build.id);
    const existing = byDefinition.get(key);
    byDefinition.set(key, existing
      ? latest(existing, build, (item) => item.queueTime ?? item.startTime ?? item.finishTime, (item) => item.id)
      : build);
  }
  return [...byDefinition.values()];
}

export function buildMatchesPullRequest(build: AdoBuild, prId: number): boolean {
  const triggerPr = build.triggerInfo?.["pr.number"] ?? build.triggerInfo?.["pr.id"];
  return triggerPr === String(prId) || build.sourceBranch === `refs/pull/${prId}/merge`;
}

async function projectId(org: string, project: string): Promise<string> {
  const response = await new AzureDevOpsClient({ org }).get<{ id: string }>(`projects/${encodeURIComponent(project)}`, { "api-version": API_VERSION });
  return response.id;
}

export async function getPullRequestChecks(org: string, project: string, repoId: string, prId: number): Promise<Check[]> {
  const scoped = new AzureDevOpsClient({ org, project });
  const pid = await projectId(org, project);
  const artifactId = `vstfs:///CodeReview/CodeReviewId/${pid}/${prId}`;
  const [policyResponse, statusResponse, buildResponse] = await Promise.all([
    scoped.get<ValueResponse<AdoPolicyEvaluation>>("policy/evaluations", { artifactId, "api-version": "7.1-preview.1" }),
    scoped.get<ValueResponse<AdoPrStatus>>(`git/repositories/${encodeURIComponent(repoId)}/pullrequests/${prId}/statuses`, { "api-version": "7.1-preview.1" }),
    scoped.get<ValueResponse<AdoBuild>>("build/builds", {
      repositoryId: repoId,
      repositoryType: "TfsGit",
      reasonFilter: "pullRequest",
      branchName: `refs/pull/${prId}/merge`,
      queryOrder: "queueTimeDescending",
      "$top": 100,
      "api-version": API_VERSION,
    }),
  ]);
  const builds = (buildResponse.value ?? []).filter((build) => buildMatchesPullRequest(build, prId));
  const checks = [
    ...selectCurrentPolicies(policyResponse.value ?? []).map(normalizePolicyCheck),
    ...selectLatestPrStatuses(statusResponse.value ?? []).map(normalizePrStatusCheck),
    ...selectCurrentBuilds(builds).map(normalizeBuildCheck),
  ];
  const seen = new Set<string>();
  return checks.filter((check) => {
    const key = `${check.source}:${check.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
