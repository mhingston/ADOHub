import { AzureDevOpsClient } from "@/lib/ado/client";
import { normalizeBuild, normalizeTimelineRecord } from "@/lib/ado/normalizers";
import type { AdoBuild, AdoTimelineRecord } from "@/lib/ado/types";
import type { LogChunk, WorkflowRun, WorkflowRunDetail } from "@/lib/domain";

const API_VERSION = "7.1";
type ValueResponse<T> = { count?: number; value?: T[] };

function client(org: string, project: string) {
  return new AzureDevOpsClient({ org, project });
}

export async function listRuns(org: string, project: string, repoId: string, top = 50): Promise<WorkflowRun[]> {
  const response = await client(org, project).get<ValueResponse<AdoBuild>>("build/builds", {
    repositoryId: repoId,
    repositoryType: "TfsGit",
    queryOrder: "queueTimeDescending",
    "$top": top,
    "api-version": API_VERSION,
  });
  return (response.value ?? []).map(normalizeBuild);
}

export async function getRun(org: string, project: string, runId: string): Promise<WorkflowRunDetail> {
  const [build, timeline] = await Promise.all([
    client(org, project).get<AdoBuild>(`build/builds/${encodeURIComponent(runId)}`, { "api-version": API_VERSION }),
    client(org, project).get<{ records?: AdoTimelineRecord[] }>(`build/builds/${encodeURIComponent(runId)}/timeline`, { "api-version": API_VERSION }),
  ]);
  const items = (timeline.records ?? [])
    .map(normalizeTimelineRecord)
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return { ...normalizeBuild(build), timeline: items };
}

export async function getRunLog(org: string, project: string, runId: string, logId: number, startLine = 1): Promise<LogChunk> {
  const text = await client(org, project).getText(`build/builds/${encodeURIComponent(runId)}/logs/${logId}`, {
    startLine,
    "api-version": API_VERSION,
  });
  const normalized = text.replace(/\r\n/g, "\n");
  const lineCount = normalized.length === 0 ? 0 : normalized.split("\n").length;
  return { logId, text: normalized, startLine, lineCount };
}

export async function cancelRun(org: string, project: string, runId: string): Promise<WorkflowRun> {
  const build = await client(org, project).patch<AdoBuild>(`build/builds/${encodeURIComponent(runId)}`, { status: "cancelling" }, { "api-version": API_VERSION });
  return normalizeBuild(build);
}

export async function rerunRun(org: string, project: string, runId: string): Promise<WorkflowRun> {
  const build = await client(org, project).get<AdoBuild>(`build/builds/${encodeURIComponent(runId)}`, { "api-version": API_VERSION });
  if (!build.definition?.id) throw new Error("Cannot re-run a build without a definition id");
  const queued = await client(org, project).post<AdoBuild>("build/builds", {
    definition: { id: build.definition.id },
    sourceBranch: build.sourceBranch,
    sourceVersion: build.sourceVersion,
  }, { "api-version": API_VERSION });
  return normalizeBuild(queued);
}
