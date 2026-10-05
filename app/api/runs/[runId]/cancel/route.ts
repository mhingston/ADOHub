import { NextResponse } from "next/server";
import { cancelRun, getRun } from "@/lib/ado/builds";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const url = new URL(request.url);
  const org = url.searchParams.get("org");
  const project = url.searchParams.get("project");
  if (!org || !project) return NextResponse.json({ error: "org and project are required" }, { status: 400 });
  await cancelRun(org, project, runId);
  return NextResponse.json(await getRun(org, project, runId));
}
