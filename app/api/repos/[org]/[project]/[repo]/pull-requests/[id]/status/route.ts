import { NextResponse } from "next/server";
import { publicError } from "@/lib/ado/errors";
import { assertMutationAllowed } from "@/lib/ado/mutations";
import { setPullRequestStatus } from "@/lib/ado/pull-request-mutations";

export async function PATCH(request: Request, context: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await context.params;
  const prId = Number(id);
  if (!Number.isSafeInteger(prId) || prId < 1) return NextResponse.json({ error: "A valid pull request id is required." }, { status: 400 });
  let status: unknown;
  try {
    status = (await request.json()).status;
  } catch {
    return NextResponse.json({ error: "Choose abandon or reactivate." }, { status: 400 });
  }
  if (status !== "active" && status !== "abandoned") {
    return NextResponse.json({ error: "Choose abandon or reactivate." }, { status: 400 });
  }
  try {
    const repoId = await assertMutationAllowed({ request, org, project, repo, resource: { kind: "pullRequest", id: prId } });
    const updated = await setPullRequestStatus(org, project, repoId, prId, status);
    return NextResponse.json({ status: updated.status });
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
