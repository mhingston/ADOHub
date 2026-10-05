import { AzureDevOpsClient } from "@/lib/ado/client";
import type { AdoBuild } from "@/lib/ado/types";

const API_VERSION = "7.1";

export class MutationAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MutationAccessError";
  }
}

function same(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

export async function assertMutationAllowed(
  org: string,
  project: string,
  runId: string,
): Promise<void> {
  if (process.env.ADO_MUTATIONS_ENABLED !== "true") {
    throw new MutationAccessError("Pipeline mutations are disabled for this ADOHub deployment.", 403);
  }

  const allowedOrg = process.env.ADO_ORG?.trim();
  const allowedProject = process.env.ADO_PROJECT?.trim();
  const allowedRepo = process.env.ADO_REPO?.trim();
  if (!allowedOrg || !allowedProject || !allowedRepo) {
    throw new MutationAccessError(
      "Pipeline mutations require ADO_ORG, ADO_PROJECT and ADO_REPO deployment allowlists.",
      503,
    );
  }

  if (!same(org, allowedOrg) || !same(project, allowedProject)) {
    throw new MutationAccessError("This Azure DevOps organisation/project is not mutation-allowed.", 403);
  }

  const build = await new AzureDevOpsClient({ org, project }).get<AdoBuild>(
    `build/builds/${encodeURIComponent(runId)}`,
    { "api-version": API_VERSION },
  );
  const repository = build.repository;
  if (!repository || (!same(repository.id ?? "", allowedRepo) && !same(repository.name ?? "", allowedRepo))) {
    throw new MutationAccessError("This build does not belong to the mutation-allowed repository.", 403);
  }
}
