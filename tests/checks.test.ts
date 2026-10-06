import { describe, expect, it } from "vitest";
import buildFixture from "./fixtures/ado/build.json";
import prBuildFixture from "./fixtures/ado/build-pr.json";
import statusFixture from "./fixtures/ado/pull-request-statuses.json";
import policyFixture from "./fixtures/ado/policy-evaluations.json";
import { buildMatchesPullRequest, selectCurrentBuilds, selectCurrentPolicies, selectLatestPrStatuses } from "@/lib/ado/checks";
import { normalizeBuild } from "@/lib/ado/normalizers";
import type { AdoBuild, AdoPolicyEvaluation, AdoPrStatus } from "@/lib/ado/types";

describe("current PR check selection", () => {
  it("deduplicates historical PR status records by context and keeps the latest timestamp", () => {
    const statuses = statusFixture.value as unknown as AdoPrStatus[];
    const latest = selectLatestPrStatuses(statuses);
    expect(latest).toHaveLength(1);
    expect(latest[0].id).toBe(8);
    expect(latest[0].state).toBe("succeeded");
  });

  it("keeps distinct same-name policy scopes and drops deleted or disabled configuration", () => {
    const policies = policyFixture.value as unknown as AdoPolicyEvaluation[];
    expect(selectCurrentPolicies(policies)).toHaveLength(5);
    expect(selectCurrentPolicies([
      { configuration: { id: 1, isEnabled: false } },
      { configuration: { id: 2, isDeleted: true } },
    ])).toHaveLength(0);
  });

  it("matches PR builds from the merge ref or Azure triggerInfo and retains the newest run per definition", () => {
    const build = buildFixture as unknown as AdoBuild;
    const prBuild = prBuildFixture as unknown as AdoBuild;
    expect(buildMatchesPullRequest(prBuild, 42)).toBe(true);
    expect(buildMatchesPullRequest({ ...build, sourceBranch: "refs/pull/42/merge" }, 42)).toBe(true);
    expect(buildMatchesPullRequest({ ...prBuild, sourceBranch: "refs/heads/main", triggerInfo: { "pr.number": "42" } }, 42)).toBe(true);
    expect(buildMatchesPullRequest({ ...build, sourceBranch: "refs/heads/main", triggerInfo: {} }, 42)).toBe(false);
    expect(normalizeBuild({ ...prBuild, triggerInfo: {}, sourceBranch: "refs/pull/42/merge" }).prId).toBe(42);

    const older = { ...build, id: 100, queueTime: "2026-10-04T10:00:00Z" };
    const newer = { ...build, id: 101, queueTime: "2026-10-05T10:00:00Z" };
    expect(selectCurrentBuilds([older, newer])).toEqual([newer]);
  });
});
