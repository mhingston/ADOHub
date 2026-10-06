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

/**
 * Deployment-side allowlist plus an Azure read that proves the resource still
 * belongs to the configured repository before any write is sent.
 */
export async function assertMutationAllowed({ org, project, repo, resource }: MutationTarget): Promise<string> {
  if (process.env.ADO_MUTATIONS_ENABLED !== "true") {
    throw new MutationAccessError("Mutations are disabled for this ADOHub deployment.", 403);
  }

  const allowedOrg = process.env.ADO_ORG?.trim();
  const allowedProject = process.env.ADO_PROJECT?.trim();
  const allowedRepo = process.env.ADO_REPO?.trim();
  if (!allowedOrg || !allowedProject || !allowedRepo) {
    throw new MutationAccessError(
      "Mutations require ADO_ORG, ADO_PROJECT and ADO_REPO deployment allowlists.",
      503,
    );
  }
  if (!same(org, allowedOrg) || !same(project, allowedProject) || !same(repo, allowedRepo)) {
    throw new MutationAccessError("This Azure DevOps repository is not mutation-allowed.", 403);
  }

  const scoped = new AzureDevOpsClient({ org, project });
  const repository = await scoped.get<AdoRepository>(`git/repositories/${encodeURIComponent(allowedRepo)}`, {
    "api-version": API_VERSION,
  });
  if (!same(repository.name, allowedRepo) || !repository.id) {
    throw new MutationAccessError("The allowlisted repository could not be verified.", 403);
  }

  if (resource.kind === "pullRequest") {
    const pullRequest = await scoped.get<AdoPullRequest>(
      `git/repositories/${encodeURIComponent(repository.id)}/pullrequests/${resource.id}`,
      { "api-version": API_VERSION },
    );
    if (!pullRequest.repository?.id || !same(pullRequest.repository.id, repository.id)) {
      throw new MutationAccessError("This pull request does not belong to the mutation-allowed repository.", 403);
    }
    return repository.id;
  }

  const build = await scoped.get<AdoBuild>(`build/builds/${encodeURIComponent(resource.id)}`, {
    "api-version": API_VERSION,
  });
  if (!build.repository?.id || !same(build.repository.id, repository.id)) {
    throw new MutationAccessError("This build does not belong to the mutation-allowed repository.", 403);
  }
  return repository.id;
}
