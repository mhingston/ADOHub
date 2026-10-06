import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import timelineFixture from "./fixtures/ado/build-timeline.json";
import approvalFixture from "./fixtures/ado/build-timeline-approval.json";
import buildFixture from "./fixtures/ado/build.json";
import { countLogLines, isTextLogContentType } from "@/lib/ado/builds";
import { normalizeBuild, normalizeTimelineRecords } from "@/lib/ado/normalizers";
import { selectRunLogItem } from "@/lib/domain/run-log-selection";
import type { AdoBuild, AdoTimelineRecord } from "@/lib/ado/types";

describe("Azure build timeline and log fixtures", () => {
  it("preserves the Stage → Job → Task failure hierarchy through ADO Phase records", () => {
    const records = timelineFixture.records as unknown as AdoTimelineRecord[];
    const rawTask = records.find((record) => record.type === "Task" && record.result === "failed");
    const rawJob = records.find((record) => record.id === rawTask?.parentId);
    const phase = records.find((record) => record.id === rawJob?.parentId);
    const rawStage = records.find((record) => record.id === phase?.parentId);
    const items = normalizeTimelineRecords(records);
    const task = items.find((item) => item.id === rawTask?.id);
    const job = items.find((item) => item.id === rawJob?.id);
    const stage = items.find((item) => item.id === rawStage?.id);

    expect(rawTask?.log?.id).toBe(202);
    expect(task).toMatchObject({ kind: "step", status: "failure", logId: 202, errorCount: 2 });
    expect(job).toMatchObject({ kind: "job", status: "failure", parentId: stage?.id, logId: 219 });
    expect(stage).toMatchObject({ kind: "stage", status: "failure" });
    expect(items.findIndex((item) => item.id === stage?.id)).toBeLessThan(items.findIndex((item) => item.id === job?.id));
    expect(items.findIndex((item) => item.id === job?.id)).toBeLessThan(items.findIndex((item) => item.id === task?.id));
    expect(items.some((item) => records.some((record) => record.type === "Phase" && record.id === item.id))).toBe(false);
    const run = { ...normalizeBuild(buildFixture as unknown as AdoBuild), timeline: items };
    expect(selectRunLogItem(run)).toMatchObject({ id: rawTask?.id, kind: "step", logId: 202 });
    const noTaskLog = { ...run, timeline: items.map((item) => item.id === rawTask?.id ? { ...item, logId: undefined } : item) };
    expect(selectRunLogItem(noTaskLog)).toMatchObject({ id: rawJob?.id, kind: "job", logId: 219 });
  });

  it("uses captured build lifecycle data and keeps line counts consistent with the sanitized log", () => {
    const build = buildFixture as unknown as AdoBuild;
    expect(normalizeBuild(build)).toMatchObject({ status: "failure", branch: "main", runNumber: build.buildNumber });
    const log = readFileSync(new URL("./fixtures/ado/failed-step-log.txt", import.meta.url), "utf8");
    expect(log.endsWith("\n")).toBe(true);
    expect(countLogLines(log)).toBe(91);
    expect(countLogLines("one\ntwo\n")).toBe(2);
    expect(countLogLines("one\ntwo")).toBe(2);
    expect(countLogLines("")).toBe(0);
    expect(isTextLogContentType("text/plain; charset=utf-8; api-version=7.1")).toBe(true);
    expect(isTextLogContentType("application/json")).toBe(false);
    expect(isTextLogContentType("text/html; charset=utf-8")).toBe(false);
  });

  it("keeps the live approval checkpoint visible and does not expose its structural parent", () => {
    const items = normalizeTimelineRecords(approvalFixture.records as unknown as AdoTimelineRecord[]);
    expect(items).toEqual([
      expect.objectContaining({ id: "record-1", kind: "stage", status: "queued" }),
      expect.objectContaining({ id: "record-3", parentId: "record-1", kind: "approval", status: "running" }),
    ]);
    expect(items.some((item) => item.id === "record-2")).toBe(false);
    expect(selectRunLogItem({ status: "running", timeline: items })).toBeUndefined();
  });
});
