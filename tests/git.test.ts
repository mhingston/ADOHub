import { afterEach, describe, expect, it, vi } from "vitest";
import { DiffFile, getSplitContentLines } from "@git-diff-view/react";
import iterationFixture from "./fixtures/ado/pull-request-iteration-changes.json";
import deleteFixture from "./fixtures/ado/pull-request-iteration-changes-deletes.json";
import manyFilesFixture from "./fixtures/ado/pull-request-many-files.json";
import { createPullRequestFilePatch, extractUnifiedDiffHunks, getPullRequestInlineCommentAnchor, isInlineDiffDeferred, normalizeIterationChangePage, normalizePullRequestFileChanges, normalizePullRequestInlineComments } from "@/lib/ado/git";
import { createDiffPatches } from "@/lib/domain/unified-diff";
import type { AdoPullRequestChange, AdoPullRequestIterationChanges } from "@/lib/ado/types";

function changesOf(fixture: { changes: { changeEntries: unknown[]; nextSkip?: number; nextTop?: number } }) {
  return fixture.changes.changeEntries as unknown as AdoPullRequestChange[];
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PR iteration changes captured from Azure DevOps", () => {
  it("reads the observed nested changeEntries response and preserves all 29 file entries", () => {
    const response = iterationFixture as unknown as AdoPullRequestIterationChanges & { iterationId: number };
    expect(normalizeIterationChangePage(response).entries).toHaveLength(29);
    expect(normalizePullRequestFileChanges(changesOf(iterationFixture))).toHaveLength(29);
  });

  it("keeps deleted files whose only path is originalPath", () => {
    const files = normalizePullRequestFileChanges(changesOf(deleteFixture));
    const deleted = files.filter((file) => file.changeType === "delete");
    expect(files).toHaveLength(28);
    expect(deleted).toHaveLength(3);
    expect(deleted.map((file) => file.path)).toEqual([
      "/sample/file-045.cs",
      "/sample/file-046.cs",
      "/sample/file-047.cs",
    ]);
  });

  it("retains all 61 metadata rows while deferring only inline rendering after 30", () => {
    const files = normalizePullRequestFileChanges(changesOf(manyFilesFixture));
    expect(files).toHaveLength(61);
    expect(files[30].path).toBeTruthy();
    expect(isInlineDiffDeferred(29, 30)).toBe(false);
    expect(isInlineDiffDeferred(30, 30)).toBe(true);
  });

  it("preserves a rename's old and new paths when Azure supplies both", () => {
    const [file] = normalizePullRequestFileChanges([{
      changeType: "rename",
      originalPath: "/old/name.txt",
      item: { path: "/new/name.txt", size: 12 },
    }]);
    expect(file).toMatchObject({ path: "/new/name.txt", previousPath: "/old/name.txt", changeType: "rename", size: 12 });
  });

  it("uses the original path for the old side of a renamed file patch", () => {
    const patch = createPullRequestFilePatch(
      "/old/name.txt",
      "/new/name.txt",
      "before\n",
      "after\n",
      "basecommit",
      "sourcecommit",
    );
    expect(patch).toContain("--- a/old/name.txt");
    expect(patch).toContain("+++ b/new/name.txt");
  });

  it("preserves the complete unified patch headers required by the diff renderer", () => {
    const patch = createPullRequestFilePatch("/file.ts", "/file.ts", "const value = 1;\n", "const value = 2;\n", "base", "head");
    const hunks = extractUnifiedDiffHunks(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatch(/@@ -1(?:,1)? \+1(?:,1)? @@/);
    expect(hunks[0]).toContain("-const value = 1;");
    expect(hunks[0]).toContain("+const value = 2;");
    const rendererPatches = createDiffPatches("/file.ts", "/file.ts", "const value = 1;\n", "const value = 2;\n");
    expect(rendererPatches).toHaveLength(1);
    expect(rendererPatches[0]).toContain("--- a/file.ts\tbase");
    expect(rendererPatches[0]).toContain("+++ b/file.ts\thead");
    expect(rendererPatches[0]).toContain(hunks[0]);

    const diffFile = new DiffFile(
      "/file.ts",
      "const value = 1;\n",
      "/file.ts",
      "const value = 2;\n",
      rendererPatches,
      "ts",
      "ts",
    );
    diffFile.initRaw();
    diffFile.buildSplitDiffLines();
    const renderedLines = getSplitContentLines(diffFile);
    expect(renderedLines).toHaveLength(1);
    expect(renderedLines[0].splitLine.left.value).toContain("1");
    expect(renderedLines[0].splitLine.right.value).toContain("2");
  });

  it("returns no renderable patch when the file contents have no textual changes", () => {
    expect(createDiffPatches("/same.txt", "/same.txt", "unchanged\n", "unchanged\n")).toEqual([]);
  });

  it("normalizes Azure inline threads onto the current file and side-specific line", () => {
    const inline = normalizePullRequestInlineComments([{
      id: 8,
      status: "active",
      threadContext: { filePath: "/src/file.ts", rightFileStart: { line: 12, offset: 1 } },
      comments: [{ id: 2, content: "Please rename this value.", author: { displayName: "Reviewer" }, publishedDate: "2026-01-02T00:00:00Z" }],
    }], "/src/file.ts");
    expect(inline).toEqual([expect.objectContaining({
      threadId: 8,
      commentId: 2,
      author: "Reviewer",
      lineNumber: 12,
      side: "new",
      status: "active",
    })]);
    expect(normalizePullRequestInlineComments([{
      id: 9,
      threadContext: { filePath: "/src/other.ts", leftFileStart: { line: 3 } },
      comments: [{ id: 1, content: "not on this file" }],
    }], "/src/file.ts")).toEqual([]);
    expect(normalizePullRequestInlineComments([{
      id: 10,
      threadContext: { filePath: "/src/old-file.ts", leftFileStart: { line: 4 } },
      comments: [{ id: 3, content: "A comment on the old side." }],
    }], "/src/new-file.ts", ["/src/old-file.ts"])).toEqual([
      expect.objectContaining({ lineNumber: 4, side: "old" }),
    ]);
  });

  it("derives a comment anchor from the latest Azure iteration and rejects files outside the PR", async () => {
    vi.stubEnv("ADO_PAT", "test-pat");
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      const path = url.pathname.toLowerCase();
      if (path.endsWith("/pullrequests/17/iterations")) {
        return new Response(JSON.stringify({ value: [{ id: 3 }] }), { status: 200 });
      }
      if (path.endsWith("/pullrequests/17/iterations/3/changes")) {
        return new Response(JSON.stringify({ changes: { changeEntries: [{
          changeTrackingId: 41,
          changeType: "edit",
          item: { path: "/src/app.ts" },
        }] } }), { status: 200 });
      }
      if (path.endsWith("/pullrequests/17")) {
        return new Response(JSON.stringify({
          pullRequestId: 17,
          title: "Reviewable change",
          status: "active",
          sourceRefName: "refs/heads/feature/example",
          targetRefName: "refs/heads/main",
          lastMergeSourceCommit: { commitId: "source-commit" },
          lastMergeTargetCommit: { commitId: "target-commit" },
        }), { status: 200 });
      }
      if (path.endsWith("/items")) return new Response("first line\nsecond line\n", { status: 200 });
      return new Response("unexpected request", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPullRequestInlineCommentAnchor("org", "project", "repo-id", 17, "/src/app.ts", 2, "old"))
      .resolves.toMatchObject({ filePath: "/src/app.ts", lineNumber: 2, side: "old", changeTrackingId: 41, latestIteration: 3 });
    await expect(getPullRequestInlineCommentAnchor("org", "project", "repo-id", 17, "/src/other.ts", 2, "old"))
      .rejects.toMatchObject({ status: 409 });
  });
});
