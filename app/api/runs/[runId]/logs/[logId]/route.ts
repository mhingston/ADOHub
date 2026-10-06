import { NextResponse } from "next/server";
import { getRunLog } from "@/lib/ado/builds";
import { publicError } from "@/lib/ado/errors";

export async function GET(request: Request, context: { params: Promise<{ runId: string; logId: string }> }) {
  const { runId, logId } = await context.params;
  const url = new URL(request.url);
  const org = url.searchParams.get("org");
  const project = url.searchParams.get("project");
  const startLine = Math.max(1, Number(url.searchParams.get("startLine") ?? "1") || 1);
  const numericLogId = Number(logId);
  if (!org || !project || !Number.isInteger(numericLogId)) return NextResponse.json({ error: "valid org, project and log id are required" }, { status: 400 });
  try {
    return NextResponse.json(await getRunLog(org, project, runId, numericLogId, startLine));
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
