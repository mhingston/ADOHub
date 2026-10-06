import { describe, expect, it } from "vitest";
import { repositoryBrowseHref } from "@/lib/route-paths";

describe("repository browse links", () => {
  it("encodes slash-containing branch names and file paths as query values", () => {
    const href = repositoryBrowseHref("/org/project/repo", "tree", "feature/SAC-42 fix", "/src/deep/file.ts");
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/org/project/repo/tree");
    expect(url.searchParams.get("branch")).toBe("feature/SAC-42 fix");
    expect(url.searchParams.get("path")).toBe("/src/deep/file.ts");
  });
});
