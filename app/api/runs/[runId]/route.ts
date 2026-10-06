import { NextResponse } from "next/server";
import { getRun } from "@/lib/ado/builds";
import { publicError } from "@/lib/ado/errors";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const url = new URL(request.url);
  const org = url.searchParams.get("org");
  const project = url.searchParams.get("project");
  if (!org || !project) return NextResponse.json({ error: "org and project are required" }, { status: 400 });
  try {
    return NextResponse.json(await getRun(org, project, runId));
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
