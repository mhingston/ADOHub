import { NextResponse } from "next/server";
import { rerunRun } from "@/lib/ado/builds";
import { publicError } from "@/lib/ado/errors";
import { assertMutationAllowed } from "@/lib/ado/mutations";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const url = new URL(request.url);
  const org = url.searchParams.get("org");
  const project = url.searchParams.get("project");
  const repo = url.searchParams.get("repo");
  if (!org || !project || !repo) return NextResponse.json({ error: "org, project and repo are required" }, { status: 400 });

  try {
    await assertMutationAllowed({ org, project, repo, resource: { kind: "build", id: runId } });
    const rerun = await rerunRun(org, project, runId);
    // Return the queued build immediately. Its timeline may not exist yet; the
    // destination run page will poll until Azure DevOps creates it.
    return NextResponse.json(rerun, { status: 202 });
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
