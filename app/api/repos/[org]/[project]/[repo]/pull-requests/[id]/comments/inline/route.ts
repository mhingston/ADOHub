import { NextResponse } from "next/server";
import { publicError } from "@/lib/ado/errors";
import { getPullRequestInlineCommentAnchor } from "@/lib/ado/git";
import { assertMutationAllowed } from "@/lib/ado/mutations";
import { addPullRequestInlineComment } from "@/lib/ado/pull-request-mutations";

export async function POST(
  request: Request,
  context: { params: Promise<{ org: string; project: string; repo: string; id: string }> },
) {
  const { org, project, repo, id } = await context.params;
  const prId = Number(id);
  if (!Number.isSafeInteger(prId) || prId < 1) {
    return NextResponse.json({ error: "A valid pull request id is required." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A file, line and comment are required." }, { status: 400 });
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const { content, filePath, lineNumber, side } = input;
  if (typeof content !== "string" || !content.trim() || content.length > 10_000) {
    return NextResponse.json({ error: "Enter a comment of 1 to 10,000 characters." }, { status: 400 });
  }
  if (typeof filePath !== "string" || !filePath.startsWith("/") || filePath.length > 2_000) {
    return NextResponse.json({ error: "A valid changed file is required." }, { status: 400 });
  }
  if (typeof lineNumber !== "number" || !Number.isSafeInteger(lineNumber) || lineNumber < 1 || (side !== "old" && side !== "new")) {
    return NextResponse.json({ error: "A valid changed line is required." }, { status: 400 });
  }

  try {
    const repoId = await assertMutationAllowed({ org, project, repo, resource: { kind: "pullRequest", id: prId } });
    const anchor = await getPullRequestInlineCommentAnchor(org, project, repoId, prId, filePath, lineNumber, side);
    await addPullRequestInlineComment(org, project, repoId, prId, content.trim(), anchor);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
}
