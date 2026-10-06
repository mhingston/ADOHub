import { NextResponse } from "next/server";
import { publicError } from "@/lib/ado/errors";
import { addPullRequestComment } from "@/lib/ado/pull-request-mutations";
import { assertMutationAllowed } from "@/lib/ado/mutations";

export async function POST(request: Request, context: { params: Promise<{ org: string; project: string; repo: string; id: string }> }) {
  const { org, project, repo, id } = await context.params;
  const prId = Number(id);
  if (!Number.isSafeInteger(prId) || prId < 1) return NextResponse.json({ error: "A valid pull request id is required." }, { status: 400 });
  let content: unknown;
  try {
    content = (await request.json()).content;
  } catch {
    return NextResponse.json({ error: "A comment is required." }, { status: 400 });
  }
  if (typeof content !== "string" || !content.trim() || content.length > 10_000) {
    return NextResponse.json({ error: "Enter a comment of 1 to 10,000 characters." }, { status: 400 });
  }
  try {
    const repoId = await assertMutationAllowed({ request, org, project, repo, resource: { kind: "pullRequest", id: prId } });
    await addPullRequestComment(org, project, repoId, prId, content.trim());
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
