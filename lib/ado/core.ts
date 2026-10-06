import { AzureDevOpsClient } from "@/lib/ado/client";
import type { AdoProject } from "@/lib/ado/types";
import type { ProjectSummary } from "@/lib/domain";

const API_VERSION = "7.1";
const MAX_PROJECTS = 1000;

type ValueResponse<T> = { count?: number; value?: T[] };

export async function listProjects(org: string): Promise<ProjectSummary[]> {
  const response = await new AzureDevOpsClient({ org }).get<ValueResponse<AdoProject>>("projects", {
    stateFilter: "WellFormed",
    "$top": MAX_PROJECTS,
    "api-version": API_VERSION,
  });
  return (response.value ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    description: project.description,
    visibility: project.visibility,
  }));
}
