import { describe, expect, it } from "vitest";
import iterationFixture from "./fixtures/ado/pull-request-iteration-changes.json";
import deleteFixture from "./fixtures/ado/pull-request-iteration-changes-deletes.json";
import manyFilesFixture from "./fixtures/ado/pull-request-many-files.json";
import { isInlineDiffDeferred, normalizeIterationChangePage, normalizePullRequestFileChanges } from "@/lib/ado/git";
import type { AdoPullRequestChange, AdoPullRequestIterationChanges } from "@/lib/ado/types";

function changesOf(fixture: { changes: { changeEntries: unknown[]; nextSkip?: number; nextTop?: number } }) {
  return fixture.changes.changeEntries as unknown as AdoPullRequestChange[];
}

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
});
