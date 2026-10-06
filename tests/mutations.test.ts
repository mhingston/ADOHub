import { afterEach, describe, expect, it, vi } from "vitest";
import { AdoHttpError, AzureDevOpsClient } from "@/lib/ado/client";
import { publicError } from "@/lib/ado/errors";
import { assertMutationAllowed } from "@/lib/ado/mutations";
import { createCompletionPayload, createInlineCommentPayload } from "@/lib/ado/pull-request-mutations";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PR mutation payloads and safe Azure errors", () => {
  it("builds the minimal completion payload without enabling source deletion or work-item transitions", () => {
    expect(createCompletionPayload("0123456789abcdef", "squash", false)).toEqual({
      status: "completed",
      lastMergeSourceCommit: { commitId: "0123456789abcdef" },
      completionOptions: {
        mergeStrategy: "squash",
        deleteSourceBranch: false,
        transitionWorkItems: false,
      },
    });
    expect(createCompletionPayload("abcdef", "noFastForward", true).completionOptions).toMatchObject({
      mergeStrategy: "noFastForward",
      deleteSourceBranch: true,
    });
  });

  it("builds an Azure inline thread payload with the exact file and iteration anchor", () => {
    expect(createInlineCommentPayload("Review this line", {
      filePath: "/src/file.ts",
      lineNumber: 12,
      side: "new",
      changeTrackingId: 41,
      latestIteration: 3,
    })).toEqual({
      comments: [{ parentCommentId: 0, content: "Review this line", commentType: 1 }],
      status: 1,
      threadContext: {
        filePath: "/src/file.ts",
        leftFileStart: null,
        leftFileEnd: null,
        rightFileStart: { line: 12, offset: 1 },
        rightFileEnd: { line: 12, offset: 1 },
      },
      pullRequestThreadContext: {
        changeTrackingId: 41,
        iterationContext: { firstComparingIteration: 0, secondComparingIteration: 3 },
      },
    });
  });

  it("maps common Azure failures and never returns the request URL or authorization material", () => {
    expect(publicError(new AdoHttpError("failed", 403, "https://private.invalid/path"))).toMatchObject({ status: 403, message: "You do not have permission to perform this action." });
    expect(publicError(new AdoHttpError("failed", 404, "https://private.invalid/path")).message).toContain("no longer exists");
    expect(publicError(new AdoHttpError("failed", 409, "https://private.invalid/path", JSON.stringify({ message: "Policy rejected the request at https://private.invalid/detail" })))).toMatchObject({ status: 409, message: "Policy rejected the request at Azure DevOps resource" });
    expect(publicError(new AdoHttpError("failed", 429, "https://private.invalid/path")).message).toContain("rate limiting");
  });

  it("rejects disabled writes before making any Azure request", async () => {
    vi.stubEnv("ADO_MUTATIONS_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(assertMutationAllowed({
      org: "safe-org", project: "safe-project", repo: "safe-repo", resource: { kind: "pullRequest", id: 7 },
    })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the allowlist and verifies the PR's repository before allowing a mutation", async () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_MUTATIONS_ENABLED", "true");
    vi.stubEnv("ADO_ORG", "safe-org");
    vi.stubEnv("ADO_PROJECT", "safe-project");
    vi.stubEnv("ADO_REPO", "safe-repo");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "repo-id", name: "safe-repo" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repository: { id: "repo-id" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertMutationAllowed({
      org: "safe-org", project: "safe-project", repo: "safe-repo", resource: { kind: "pullRequest", id: 7 },
    })).resolves.toBe("repo-id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  });

  it("rejects a caller-supplied repository outside the deployment allowlist before network access", async () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_MUTATIONS_ENABLED", "true");
    vi.stubEnv("ADO_ORG", "safe-org");
    vi.stubEnv("ADO_PROJECT", "safe-project");
    vi.stubEnv("ADO_REPO", "safe-repo");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(assertMutationAllowed({
      org: "safe-org", project: "safe-project", repo: "other-repo", resource: { kind: "build", id: "42" },
    })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not automatically retry a POST after a transient Azure response", async () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    const fetchMock = vi.fn().mockResolvedValue(new Response("temporary failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new AzureDevOpsClient({ org: "safe-org" }).post("git/example", { content: "one request" })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
