import { afterEach, describe, expect, it, vi } from "vitest";
import { listProjects } from "@/lib/ado/core";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Azure DevOps organization projects", () => {
  it("uses the 7.1 Core projects endpoint and returns normalized project summaries", async () => {
    vi.stubEnv("ADO_PAT", "test-pat");
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/example-org/_apis/projects");
      expect(url.searchParams.get("api-version")).toBe("7.1");
      expect(url.searchParams.get("stateFilter")).toBe("WellFormed");
      return new Response(JSON.stringify({ value: [{
        id: "project-id",
        name: "Example Project",
        description: "Product and growth engineering",
        visibility: "private",
        state: "wellFormed",
        url: "https://dev.azure.com/sensitive/_apis/projects/project-id",
      }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listProjects("example-org")).resolves.toEqual([{
      id: "project-id",
      name: "Example Project",
      description: "Product and growth engineering",
      visibility: "private",
    }]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
