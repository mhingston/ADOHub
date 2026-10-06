import { AzureDevOpsClient } from "@/lib/ado/client";
import type { AdoBuild, AdoPullRequest, AdoRepository } from "@/lib/ado/types";

const API_VERSION = "7.1";

export class MutationAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MutationAccessError";
  }
}

export type MutationResource =
  | { kind: "pullRequest"; id: number }
  | { kind: "build"; id: string };

export interface MutationTarget {
  org: string;
  project: string;
  repo: string;
  resource: MutationResource;
}

function same(left: string, right: string) {
  return left.trim().toLocaleLowerCase("en-US") === right.trim().toLocaleLowerCase("en-US");
}

export function mutationsEnabledForOrg(org: string): boolean {
  const allowedOrg = process.env.ADO_ORG?.trim();
  return Boolean(
    allowedOrg
      && process.env.ADO_PAT?.trim()
      && process.env.ADO_MUTATIONS_ENABLED?.trim().toLocaleLowerCase("en-US") !== "false"
      && same(org, allowedOrg),
  );
}

/**
 * The configured organization and PAT enable writes by default. Before a write,
 * Azure reads prove the requested PR or build belongs to the route repository.
 */
export async function assertMutationAllowed({ org, project, repo, resource }: MutationTarget): Promise<string> {
  if (process.env.ADO_MUTATIONS_ENABLED?.trim().toLocaleLowerCase("en-US") === "false") {
    throw new MutationAccessError("Mutations are disabled for this ADOHub deployment.", 403);
  }

  const allowedOrg = process.env.ADO_ORG?.trim();
  if (!process.env.ADO_PAT?.trim() || !allowedOrg) {
    throw new MutationAccessError("Mutations require server-side ADO_PAT and ADO_ORG configuration.", 503);
  }
  if (!same(org, allowedOrg)) {
    throw new MutationAccessError("This Azure DevOps organization is not mutation-allowed.", 403);
  }
  if (!project.trim() || !repo.trim()) {
    throw new MutationAccessError("A project and repository are required to verify the mutation target.", 400);
  }

  const scoped = new AzureDevOpsClient({ org: allowedOrg, project });
  const repository = await scoped.get<AdoRepository>(`git/repositories/${encodeURIComponent(repo)}`, {
    "api-version": API_VERSION,
  });
  if (!same(repository.name, repo) || !repository.id) {
    throw new MutationAccessError("The requested repository could not be verified.", 403);
  }

  if (resource.kind === "pullRequest") {
    const pullRequest = await scoped.get<AdoPullRequest>(
      `git/repositories/${encodeURIComponent(repository.id)}/pullrequests/${resource.id}`,
      { "api-version": API_VERSION },
    );
    if (!pullRequest.repository?.id || !same(pullRequest.repository.id, repository.id)) {
      throw new MutationAccessError("This pull request does not belong to the requested repository.", 403);
    }
    return repository.id;
  }

  const build = await scoped.get<AdoBuild>(`build/builds/${encodeURIComponent(resource.id)}`, {
    "api-version": API_VERSION,
  });
  if (!build.repository?.id || !same(build.repository.id, repository.id)) {
    throw new MutationAccessError("This build does not belong to the requested repository.", 403);
  }
  return repository.id;
}
