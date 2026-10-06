import { describe, expect, it } from "vitest";
import { organizationHref, projectHref, repositoryBrowseHref, repositoryHref } from "@/lib/route-paths";

describe("repository browse links", () => {
  it("keeps organization, project and repository navigation inside ADOHub", () => {
    expect(organizationHref("example-org")).toBe("/example-org");
    expect(projectHref("example-org", "Example Project")).toBe("/example-org/Example%20Project");
    expect(repositoryHref("example-org", "Example-Project", "sample api")).toBe(
      "/example-org/Example-Project/sample%20api",
    );
  });

  it("encodes slash-containing branch names and file paths as query values", () => {
    const href = repositoryBrowseHref("/org/project/repo", "tree", "feature/SAC-42 fix", "/src/deep/file.ts");
    const url = new URL(href, "http://localhost");
    expect(url.pathname).toBe("/org/project/repo/tree");
    expect(url.searchParams.get("branch")).toBe("feature/SAC-42 fix");
    expect(url.searchParams.get("path")).toBe("/src/deep/file.ts");
  });
});
