import { describe, expect, it } from "vitest";
import {
  normalizeBuildCheck,
  normalizeBuildStatus,
  normalizePolicyCheck,
  normalizePrStatusCheck,
  normalizeTimelineRecord,
  normalizeVote,
} from "@/lib/ado/normalizers";

describe("Azure DevOps normalization", () => {
  it("maps reviewer votes into GitHub-like review states", () => {
    expect(normalizeVote(10)).toBe("approved");
    expect(normalizeVote(5)).toBe("approved-with-suggestions");
    expect(normalizeVote(-5)).toBe("waiting-for-author");
    expect(normalizeVote(-10)).toBe("changes-requested");
    expect(normalizeVote(0)).toBe("none");
  });

  it("maps build lifecycle into one check status vocabulary", () => {
    expect(normalizeBuildStatus({ id: 1, status: "inProgress" })).toBe("running");
    expect(normalizeBuildStatus({ id: 1, status: "completed", result: "succeeded" })).toBe("success");
    expect(normalizeBuildStatus({ id: 1, status: "completed", result: "failed" })).toBe("failure");
    expect(normalizeBuildStatus({ id: 1, status: "completed", result: "canceled" })).toBe("cancelled");
  });

  it("keeps source details out of the UI check shape", () => {
    expect(normalizeBuildCheck({ id: 42, definition: { id: 7, name: "CI" }, status: "completed", result: "failed" })).toMatchObject({ name: "CI", status: "failure", source: "build", runId: "42" });
    expect(normalizePolicyCheck({ evaluationId: "p1", status: "approved", configuration: { isBlocking: true, type: { displayName: "Build validation" } } })).toMatchObject({ name: "Build validation", status: "success", required: true, source: "policy" });
    expect(normalizePrStatusCheck({ id: 5, state: "pending", context: { genre: "security", name: "scan" } })).toMatchObject({ name: "security / scan", status: "running", source: "status" });
  });

  it("normalizes task timeline records and ignores unhelpful record types", () => {
    expect(normalizeTimelineRecord({ id: "1", type: "Task", name: "unit tests", state: "completed", result: "failed", log: { id: 99 } })).toMatchObject({ kind: "step", name: "unit tests", status: "failure", logId: 99 });
    expect(normalizeTimelineRecord({ id: "2", type: "Checkpoint", name: "approval" })).toBeNull();
  });
});
