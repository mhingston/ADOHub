import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/ado/identity";
import { publicError } from "@/lib/ado/errors";
import { assertMutationAllowed } from "@/lib/ado/mutations";
import { setPullRequestVote, type AdoVote } from "@/lib/ado/pull-request-mutations";

const votes = new Set<number>([-10, -5, 0, 5, 10]);

export async function PUT(request: Request, context: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await context.params;
  const prId = Number(id);
  if (!Number.isSafeInteger(prId) || prId < 1) return NextResponse.json({ error: "A valid pull request id is required." }, { status: 400 });
  let vote: unknown;
  try {
    vote = (await request.json()).vote;
  } catch {
    return NextResponse.json({ error: "An Azure DevOps reviewer vote is required." }, { status: 400 });
  }
  if (typeof vote !== "number" || !votes.has(vote)) {
    return NextResponse.json({ error: "Choose a supported Azure DevOps review vote." }, { status: 400 });
  }
  try {
    const repoId = await assertMutationAllowed({ org, project, repo, resource: { kind: "pullRequest", id: prId } });
    const userId = await getCurrentUserId(org);
    await setPullRequestVote(org, project, repoId, prId, userId, vote as AdoVote);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
