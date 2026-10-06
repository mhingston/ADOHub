import { NextResponse } from "next/server";
import { publicError } from "@/lib/ado/errors";
import { getPullRequest, getPullRequestComments, getRepository } from "@/lib/ado/git";
import { getPullRequestChecks } from "@/lib/ado/checks";

export async function GET(_request: Request, context: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await context.params;
  const prId = Number(id);
  if (!Number.isSafeInteger(prId) || prId < 1) return NextResponse.json({ error: "A valid pull request id is required." }, { status: 400 });
  try {
    const repository = await getRepository(org, project, repo);
    const [pr, comments, checks] = await Promise.all([
      getPullRequest(org, project, repository.id, prId),
      getPullRequestComments(org, project, repository.id, prId),
      getPullRequestChecks(org, project, repository.id, prId),
    ]);
    return NextResponse.json({ pr, comments, checks });
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
