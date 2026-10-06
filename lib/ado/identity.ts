import { AzureDevOpsClient } from "@/lib/ado/client";
import type { AdoConnectionData } from "@/lib/ado/types";

export async function getCurrentUserId(org: string): Promise<string> {
  const response = await new AzureDevOpsClient({ org }).get<AdoConnectionData>("connectionData", {
    connectOptions: 1,
    lastChangeId: -1,
    lastChangeId64: -1,
    "api-version": "7.1-preview.1",
  });
  if (!response.authenticatedUser?.id) throw new Error("Azure DevOps did not identify the authenticated user.");
  return response.authenticatedUser.id;
}
