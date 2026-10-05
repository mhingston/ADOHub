import { NextResponse } from "next/server";

export function GET(request: Request) {
  const source = new URL(request.url);
  const org = source.searchParams.get("org")?.trim();
  const project = source.searchParams.get("project")?.trim();
  const repo = source.searchParams.get("repo")?.trim();
  if (!org || !project || !repo) {
    const target = new URL("/", request.url);
    target.searchParams.set("error", "Organisation, project and repository are required.");
    return NextResponse.redirect(target);
  }
  const path = [org, project, repo].map(encodeURIComponent).join("/");
  return NextResponse.redirect(new URL(`/${path}`, request.url));
}
