import { describe, expect, it } from "vitest";
import pullRequest from "./fixtures/ado/pull-request.json";
import reviewerFixture from "./fixtures/ado/pull-request-reviewers.json";
import policyFixture from "./fixtures/ado/policy-evaluations.json";
import statusFixture from "./fixtures/ado/pull-request-statuses.json";
import buildFixture from "./fixtures/ado/build.json";
import {
  normalizeBuild,
  normalizeBuildCheck,
  normalizeBuildStatus,
  normalizePolicyCheck,
  normalizePrStatusCheck,
  normalizeTimelineRecord,
  normalizeVote,
} from "@/lib/ado/normalizers";
import { selectCurrentPolicies, selectLatestPrStatuses } from "@/lib/ado/checks";
import { normalizePullRequest } from "@/lib/ado/git";
import type { AdoBuild, AdoPolicyEvaluation, AdoPrStatus, AdoPullRequest } from "@/lib/ado/types";

describe("normalization against sanitized Azure DevOps fixtures", () => {
  it("covers the vote values present in real reviewer arrays and ADO wait-for-author semantics", () => {
    const votes = new Set<number>();
    for (const sample of reviewerFixture.samples) {
      for (const reviewer of sample.reviewers) votes.add(reviewer.vote);
    }
    expect([...votes].sort((a, b) => a - b)).toEqual([-10, 0, 5, 10]);
    expect(normalizeVote(-5)).toBe("waiting-for-author");
    expect(normalizeVote(10)).toBe("approved");
    expect(normalizeVote(5)).toBe("approved-with-suggestions");
    expect(normalizeVote(0)).toBe("none");
    expect(normalizeVote(-10)).toBe("changes-requested");
  });

  it("normalizes active, completed and abandoned PRs without inventing an updated timestamp", () => {
    const raw = pullRequest as unknown as AdoPullRequest;
    const active = normalizePullRequest(raw);
    expect(active.status).toBe("open");
    expect(active.isDraft).toBe(false);
    expect(active.updatedAt).toBeUndefined();
    expect(active.webUrl).toMatch(/\/pullrequest\/\d+$/);
    expect(normalizePullRequest({ ...raw, status: "completed", closedDate: "2026-10-05T12:00:00Z" })).toMatchObject({ status: "completed", closedAt: "2026-10-05T12:00:00Z" });
    expect(normalizePullRequest({ ...raw, status: "abandoned" }).status).toBe("abandoned");
  });

  it("selects the newest PR status per context from a history containing missing and terminal states", () => {
    const raw = statusFixture.value as unknown as AdoPrStatus[];
    const current = selectLatestPrStatuses(raw);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(8);
    expect(normalizePrStatusCheck(current[0])).toMatchObject({ status: "success", source: "status" });
    expect(normalizePrStatusCheck({ id: 9, state: undefined })).toMatchObject({ status: "queued" });
    expect(normalizePrStatusCheck({ id: 10, state: "pending" })).toMatchObject({ status: "queued" });
  });

  it("retains separately scoped blocking reviewer policies from the live policy response", () => {
    const policies = selectCurrentPolicies(policyFixture.value as unknown as AdoPolicyEvaluation[]);
    expect(policies).toHaveLength(5);
    const reviewerChecks = policies.map(normalizePolicyCheck).filter((check) => check.name.startsWith("Minimum number of reviewers"));
    expect(reviewerChecks).toHaveLength(2);
    expect(reviewerChecks.every((check) => check.required && check.status === "queued")).toBe(true);
    expect(reviewerChecks.every((check) => check.description === "1 approving vote required")).toBe(true);
    expect(reviewerChecks.map((check) => check.name)).toEqual(expect.arrayContaining([
      expect.stringContaining("all branches"),
      expect.stringContaining("main"),
    ]));
  });

  it("normalizes the captured failed build and its check vocabulary", () => {
    const build = buildFixture as unknown as AdoBuild;
    expect(normalizeBuildStatus(build)).toBe("failure");
    expect(normalizeBuild(build)).toMatchObject({ status: "failure", runNumber: build.buildNumber, branch: "main" });
    expect(normalizeBuildCheck(build)).toMatchObject({ status: "failure", source: "build", runId: String(build.id) });
    expect(normalizeBuildStatus({ id: 2, status: "completed", result: "canceled" })).toBe("cancelled");
    expect(normalizeBuildStatus({ id: 3, status: "notStarted" })).toBe("queued");
  });

  it("normalizes supported timeline leaf records and omits unrelated ADO record types", () => {
    expect(normalizeTimelineRecord({ id: "task", type: "Task", name: "Sanitized task", state: "completed", result: "failed", log: { id: 99 } })).toMatchObject({ kind: "step", status: "failure", logId: 99 });
    expect(normalizeTimelineRecord({ id: "approval", type: "Checkpoint.Approval", state: "inProgress" })).toMatchObject({ kind: "approval", name: "Approval gate", status: "running" });
    expect(normalizeTimelineRecord({ id: "phase", type: "Phase" })).toBeNull();
  });
});
