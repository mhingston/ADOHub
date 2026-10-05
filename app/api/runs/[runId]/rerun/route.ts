import { NextResponse } from "next/server";
import { rerunRun } from "@/lib/ado/builds";
import { assertMutationAllowed, MutationAccessError } from "@/lib/ado/mutations";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const url = new URL(request.url);
  const org = url.searchParams.get("org");
  const project = url.searchParams.get("project");
  if (!org || !project) return NextResponse.json({ error: "org and project are required" }, { status: 400 });

  try {
    await assertMutationAllowed(org, project, runId);
    const rerun = await rerunRun(org, project, runId);
    // Return the queued build immediately. Its timeline may not exist yet; the
    // destination run page will poll until Azure DevOps creates it.
    return NextResponse.json(rerun, { status: 202 });
  } catch (error) {
    if (error instanceof MutationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
