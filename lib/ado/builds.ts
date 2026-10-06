import { AdoHttpError, AzureDevOpsClient } from "@/lib/ado/client";
import { normalizeBuild, normalizeTimelineRecords } from "@/lib/ado/normalizers";
import type { AdoBuild, AdoTimelineRecord } from "@/lib/ado/types";
import type { LogChunk, WorkflowRun, WorkflowRunDetail } from "@/lib/domain";

const API_VERSION = "7.1";
type ValueResponse<T> = { count?: number; value?: T[] };

function client(org: string, project: string) {
  return new AzureDevOpsClient({ org, project });
}

export async function listRuns(
  org: string,
  project: string,
  repoId: string,
  top = 50,
): Promise<WorkflowRun[]> {
  const response = await client(org, project).get<ValueResponse<AdoBuild>>("build/builds", {
    repositoryId: repoId,
    repositoryType: "TfsGit",
    queryOrder: "queueTimeDescending",
    "$top": top,
    "api-version": API_VERSION,
  });
  return (response.value ?? []).map(normalizeBuild);
}

export async function getRun(
  org: string,
  project: string,
  runId: string,
): Promise<WorkflowRunDetail> {
  const scoped = client(org, project);
  const build = await scoped.get<AdoBuild>(`build/builds/${encodeURIComponent(runId)}`, {
    "api-version": API_VERSION,
  });

  let timeline: { records?: AdoTimelineRecord[] } = { records: [] };
  try {
    timeline = await scoped.get<{ records?: AdoTimelineRecord[] }>(
      `build/builds/${encodeURIComponent(runId)}/timeline`,
      { "api-version": API_VERSION },
    );
  } catch (error) {
    // A newly queued build may not have a timeline yet. Treat that as an empty
    // timeline so polling can continue rather than turning queue success into failure.
    if (!(error instanceof AdoHttpError) || error.status !== 404) throw error;
  }

  const items = normalizeTimelineRecords(timeline.records ?? []);
  return { ...normalizeBuild(build), timeline: items };
}

export function countLogLines(text: string): number {
  if (text.length === 0) return 0;
  const parts = text.split("\n");
  return parts.length - (text.endsWith("\n") ? 1 : 0);
}

export function isTextLogContentType(contentType?: string): boolean {
  if (!contentType) return true;
  return contentType.split(";", 1)[0].trim().toLowerCase() === "text/plain";
}

export async function getRunLog(
  org: string,
  project: string,
  runId: string,
  logId: number,
  startLine = 1,
): Promise<LogChunk> {
  const response = await client(org, project).getTextWithContentType(
    `build/builds/${encodeURIComponent(runId)}/logs/${logId}`,
    {
      startLine,
      "api-version": API_VERSION,
    },
  );
  if (!isTextLogContentType(response.contentType)) {
    throw new Error("Azure DevOps returned a non-text response instead of a pipeline log.");
  }
  const normalized = response.text.replace(/\r\n/g, "\n");
  return { logId, text: normalized, startLine, lineCount: countLogLines(normalized) };
}

export async function cancelRun(org: string, project: string, runId: string): Promise<WorkflowRun> {
  const build = await client(org, project).patch<AdoBuild>(
    `build/builds/${encodeURIComponent(runId)}`,
    { status: "cancelling" },
    { "api-version": API_VERSION },
  );
  return normalizeBuild(build);
}

export async function rerunRun(org: string, project: string, runId: string): Promise<WorkflowRun> {
  const scoped = client(org, project);
  const build = await scoped.get<AdoBuild>(`build/builds/${encodeURIComponent(runId)}`, {
    "api-version": API_VERSION,
  });
  if (!build.definition?.id) throw new Error("Cannot re-run a build without a definition id");

  // sourceBuildId asks Azure DevOps to clone the original queue-time build
  // configuration, including supported parameters/template parameters, instead
  // of reconstructing a lossy queue request in ADOHub.
  const queued = await scoped.post<AdoBuild>(
    "build/builds",
    undefined,
    {
      sourceBuildId: build.id,
      definitionId: build.definition.id,
      "api-version": API_VERSION,
    },
  );
  return normalizeBuild(queued);
}
