export function repositoryBrowseHref(
  basePath: string,
  view: "tree" | "blob",
  branch: string,
  path: string,
): string {
  const query = new URLSearchParams({ branch, path });
  return `${basePath}/${view}?${query.toString()}`;
}
