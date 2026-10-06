import { createTwoFilesPatch } from "diff";

export function extractUnifiedDiffHunks(patch: string): string[] {
  const hunks: string[] = [];
  let current: string[] | undefined;
  for (const line of patch.replace(/\r\n/g, "\n").split("\n")) {
    if (line.startsWith("@@ ")) {
      if (current) hunks.push(current.join("\n"));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) hunks.push(current.join("\n").replace(/\n+$/, ""));
  return hunks;
}

export function createDiffPatches(
  beforePath: string,
  afterPath: string,
  before: string,
  after: string,
): string[] {
  const patch = createTwoFilesPatch(`a${beforePath}`, `b${afterPath}`, before, after, "base", "head", { context: 4 });
  return patch.includes("\n@@ ") ? [patch] : [];
}
