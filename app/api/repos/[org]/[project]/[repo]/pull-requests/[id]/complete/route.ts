import { NextResponse } from "next/server";
import { publicError } from "@/lib/ado/errors";
import { assertMutationAllowed } from "@/lib/ado/mutations";
import { completePullRequest, type MergeStrategy } from "@/lib/ado/pull-request-mutations";

export async function POST(request: Request, context: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await context.params;
  const prId = Number(id);
  if (!Number.isSafeInteger(prId) || prId < 1) return NextResponse.json({ error: "A valid pull request id is required." }, { status: 400 });
  let body: { mergeStrategy?: unknown; deleteSourceBranch?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Completion options are required." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Completion options are required." }, { status: 400 });
  if ((body.mergeStrategy !== "squash" && body.mergeStrategy !== "noFastForward") || typeof body.deleteSourceBranch !== "boolean") {
    return NextResponse.json({ error: "Choose a merge strategy and source-branch option." }, { status: 400 });
  }
  try {
    const repoId = await assertMutationAllowed({ request, org, project, repo, resource: { kind: "pullRequest", id: prId } });
    const updated = await completePullRequest(org, project, repoId, prId, {
      mergeStrategy: body.mergeStrategy as MergeStrategy,
      deleteSourceBranch: body.deleteSourceBranch,
    });
    return NextResponse.json({ status: updated.status }, { status: 200 });
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
