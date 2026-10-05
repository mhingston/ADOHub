import { AzureDevOpsClient } from "@/lib/ado/client";
import { normalizeBuildCheck, normalizePolicyCheck, normalizePrStatusCheck } from "@/lib/ado/normalizers";
import type { AdoBuild, AdoPolicyEvaluation, AdoPrStatus } from "@/lib/ado/types";
import type { Check } from "@/lib/domain";

const API_VERSION = "7.1";
type ValueResponse<T> = { count?: number; value?: T[] };

async function projectId(org: string, project: string): Promise<string> {
  const response = await new AzureDevOpsClient({ org }).get<{ id: string }>(`projects/${encodeURIComponent(project)}`, { "api-version": API_VERSION });
  return response.id;
}

export async function getPullRequestChecks(org: string, project: string, repoId: string, prId: number): Promise<Check[]> {
  const scoped = new AzureDevOpsClient({ org, project });
  const pid = await projectId(org, project);
  const artifactId = `vstfs:///CodeReview/CodeReviewId/${pid}/${prId}`;
  const [policyResponse, statusResponse, buildResponse] = await Promise.all([
    scoped.get<ValueResponse<AdoPolicyEvaluation>>("policy/evaluations", { artifactId, "api-version": "7.1-preview.1" }).catch(() => ({ value: [] })),
    scoped.get<ValueResponse<AdoPrStatus>>(`git/repositories/${encodeURIComponent(repoId)}/pullrequests/${prId}/statuses`, { "api-version": "7.1-preview.1" }).catch(() => ({ value: [] })),
    scoped.get<ValueResponse<AdoBuild>>("build/builds", {
      repositoryId: repoId,
      repositoryType: "TfsGit",
      reasonFilter: "pullRequest",
      queryOrder: "queueTimeDescending",
      "$top": 100,
      "api-version": API_VERSION,
    }).catch(() => ({ value: [] })),
  ]);
  const builds = (buildResponse.value ?? []).filter((build) => {
    const triggerPr = build.triggerInfo?.["pr.number"] ?? build.triggerInfo?.["pr.id"];
    return triggerPr === String(prId) || build.sourceBranch === `refs/pull/${prId}/merge`;
  });
  const checks = [
    ...(policyResponse.value ?? []).map(normalizePolicyCheck),
    ...(statusResponse.value ?? []).map(normalizePrStatusCheck),
    ...builds.map(normalizeBuildCheck),
  ];
  const seen = new Set<string>();
  return checks.filter((check) => {
    const key = `${check.source}:${check.name}:${check.runId ?? check.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
