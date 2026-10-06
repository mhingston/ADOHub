import { afterEach, describe, expect, it, vi } from "vitest";
import { AdoHttpError, AzureDevOpsClient } from "@/lib/ado/client";
import { publicError } from "@/lib/ado/errors";
import { assertMutationAllowed, mutationsEnabledForOrg } from "@/lib/ado/mutations";
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
    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_ORG", "safe-org");
    vi.stubEnv("ADO_MUTATIONS_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(assertMutationAllowed({
      org: "safe-org", project: "safe-project", repo: "safe-repo", resource: { kind: "pullRequest", id: 7 },
    })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enables writes by default for the configured organization when PAT and org are present", () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_ORG", "safe-org");
    vi.stubEnv("ADO_MUTATIONS_ENABLED", "");
    expect(mutationsEnabledForOrg("SAFE-ORG")).toBe(true);
    expect(mutationsEnabledForOrg("other-org")).toBe(false);

    vi.stubEnv("ADO_MUTATIONS_ENABLED", "false");
    expect(mutationsEnabledForOrg("safe-org")).toBe(false);

    vi.stubEnv("ADO_MUTATIONS_ENABLED", "");
    vi.stubEnv("ADO_PAT", " ");
    expect(mutationsEnabledForOrg("safe-org")).toBe(false);
  });

  it("allows a matching PR without project or repo environment defaults and verifies its route repository", async () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_ORG", "safe-org");
    vi.stubEnv("ADO_MUTATIONS_ENABLED", "");
    vi.stubEnv("ADO_PROJECT", "");
    vi.stubEnv("ADO_REPO", "");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "repo-id", name: "route-repo" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repository: { id: "repo-id" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertMutationAllowed({
      org: "safe-org", project: "route-project", repo: "route-repo", resource: { kind: "pullRequest", id: 7 },
    })).resolves.toBe("repo-id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/safe-org/route-project/_apis/git/repositories/route-repo");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/safe-org/route-project/_apis/git/repositories/repo-id/pullrequests/7");
  });

  it("rejects an explicitly different organization before network access", async () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_ORG", "safe-org");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(assertMutationAllowed({
      org: "other-org", project: "route-project", repo: "route-repo", resource: { kind: "build", id: "42" },
    })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing PAT or organization before network access", async () => {
    vi.stubEnv("ADO_PAT", "");
    vi.stubEnv("ADO_ORG", "safe-org");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(assertMutationAllowed({
      org: "safe-org", project: "route-project", repo: "route-repo", resource: { kind: "pullRequest", id: 7 },
    })).rejects.toMatchObject({ status: 503 });

    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_ORG", "");
    await expect(assertMutationAllowed({
      org: "safe-org", project: "route-project", repo: "route-repo", resource: { kind: "pullRequest", id: 7 },
    })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a PR whose Azure repository differs from the repository in the route", async () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_ORG", "safe-org");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "route-repo-id", name: "route-repo" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repository: { id: "other-repo-id" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(assertMutationAllowed({
      org: "safe-org", project: "route-project", repo: "route-repo", resource: { kind: "pullRequest", id: 7 },
    })).rejects.toMatchObject({ status: 403, message: "This pull request does not belong to the requested repository." });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows a build from the route repository and rejects one from another repository", async () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    vi.stubEnv("ADO_ORG", "safe-org");
    const matchingBuildFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "route-repo-id", name: "route-repo" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repository: { id: "route-repo-id" } }), { status: 200 }));
    vi.stubGlobal("fetch", matchingBuildFetch);
    await expect(assertMutationAllowed({
      org: "safe-org", project: "route-project", repo: "route-repo", resource: { kind: "build", id: "42" },
    })).resolves.toBe("route-repo-id");

    const otherBuildFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "route-repo-id", name: "route-repo" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repository: { id: "other-repo-id" } }), { status: 200 }));
    vi.stubGlobal("fetch", otherBuildFetch);
    await expect(assertMutationAllowed({
      org: "safe-org", project: "route-project", repo: "route-repo", resource: { kind: "build", id: "42" },
    })).rejects.toMatchObject({ status: 403, message: "This build does not belong to the requested repository." });
  });

  it("does not automatically retry a POST after a transient Azure response", async () => {
    vi.stubEnv("ADO_PAT", "test-token-only");
    const fetchMock = vi.fn().mockResolvedValue(new Response("temporary failure", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new AzureDevOpsClient({ org: "safe-org" }).post("git/example", { content: "one request" })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
