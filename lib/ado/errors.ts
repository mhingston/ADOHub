import { AdoHttpError } from "@/lib/ado/client";

function safeAdoMessage(body?: string): string | undefined {
  if (!body || body.length > 50_000) return undefined;
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message !== "string") return undefined;
    let message = parsed.message
      .replace(/https?:\/\/\S+/gi, "Azure DevOps resource")
      .replace(/authorization\s*[:=]\s*(?:basic|bearer)\s+\S+/gi, "authorization redacted")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const pat = process.env.ADO_PAT;
    if (pat) message = message.split(pat).join("[redacted]");
    return message.slice(0, 400) || undefined;
  } catch {
    return undefined;
  }
}

export function publicError(error: unknown): { status: number; message: string } {
  if (error instanceof AdoHttpError) {
    if (error.status === 401 || error.status === 403) {
      return { status: error.status, message: "You do not have permission to perform this action." };
    }
    if (error.status === 404) {
      return { status: 404, message: "The Azure DevOps resource no longer exists." };
    }
    if (error.status === 409) {
      return {
        status: 409,
        message: safeAdoMessage(error.body) ?? "The pull request changed and can no longer be updated as requested.",
      };
    }
    if (error.status === 429) {
      return { status: 429, message: "Azure DevOps is rate limiting requests. Retry in a moment." };
    }
    return {
      status: error.status >= 400 && error.status < 600 ? error.status : 502,
      message: safeAdoMessage(error.body) ?? "Azure DevOps could not complete the request.",
    };
  }

  if (error instanceof Error && "status" in error && typeof error.status === "number") {
    return { status: error.status, message: error.message.slice(0, 240) };
  }

  const message = error instanceof Error ? error.message : "Azure DevOps could not complete the request.";
  return { status: 502, message: message.slice(0, 240) };
}
