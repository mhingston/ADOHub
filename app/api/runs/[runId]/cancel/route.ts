import { NextResponse } from "next/server";
import { cancelRun } from "@/lib/ado/builds";
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
    return NextResponse.json(await cancelRun(org, project, runId));
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
