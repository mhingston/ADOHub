export function organizationHref(org: string): string {
  return `/${encodeURIComponent(org)}`;
}

export function projectHref(org: string, project: string): string {
  return `${organizationHref(org)}/${encodeURIComponent(project)}`;
}

export function repositoryHref(org: string, project: string, repo: string): string {
  return `${projectHref(org, project)}/${encodeURIComponent(repo)}`;
}

export function repositoryBrowseHref(
  basePath: string,
  view: "tree" | "blob",
  branch: string,
  path: string,
): string {
  const query = new URLSearchParams({ branch, path });
  return `${basePath}/${view}?${query.toString()}`;
}
