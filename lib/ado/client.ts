type QueryValue = string | number | boolean | undefined | null;

type ClientOptions = {
  org: string;
  project?: string;
};

export class AdoHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = "AdoHttpError";
  }
}

function getPat(): string {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    throw new Error(
      "ADO_PAT is not configured. Copy .env.example to .env.local and provide a server-side Azure DevOps PAT.",
    );
  }
  return pat;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AzureDevOpsClient {
  private readonly authHeader: string;

  constructor(private readonly options: ClientOptions) {
    this.authHeader = `Basic ${Buffer.from(`:${getPat()}`).toString("base64")}`;
  }

  async get<T>(resource: string, query: Record<string, QueryValue> = {}): Promise<T> {
    return this.request<T>("GET", resource, query);
  }

  async getText(resource: string, query: Record<string, QueryValue> = {}): Promise<string> {
    return this.request<string>("GET", resource, query, undefined, "text");
  }

  async getTextWithContentType(resource: string, query: Record<string, QueryValue> = {}): Promise<{ text: string; contentType?: string }> {
    return this.request<{ text: string; contentType?: string }>("GET", resource, query, undefined, "text", true);
  }

  async post<T>(
    resource: string,
    body?: unknown,
    query: Record<string, QueryValue> = {},
  ): Promise<T> {
    return this.request<T>("POST", resource, query, body);
  }

  async put<T>(
    resource: string,
    body?: unknown,
    query: Record<string, QueryValue> = {},
  ): Promise<T> {
    return this.request<T>("PUT", resource, query, body);
  }

  async patch<T>(
    resource: string,
    body?: unknown,
    query: Record<string, QueryValue> = {},
  ): Promise<T> {
    return this.request<T>("PATCH", resource, query, body);
  }

  private buildUrl(resource: string, query: Record<string, QueryValue>) {
    const org = encodeURIComponent(this.options.org);
    const project = this.options.project
      ? `/${encodeURIComponent(this.options.project)}`
      : "";
    const cleanResource = resource.replace(/^\/+/, "");
    const url = new URL(
      `https://dev.azure.com/${org}${project}/_apis/${cleanResource}`,
    );
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH",
    resource: string,
    query: Record<string, QueryValue>,
    body?: unknown,
    responseType: "json" | "text" = "json",
    includeContentType = false,
  ): Promise<T> {
    const url = this.buildUrl(resource, query);
    const retryable = new Set([429, 502, 503, 504]);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: responseType === "text" ? "text/plain" : "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        if (responseType === "text") {
          const text = await response.text();
          return (includeContentType
            ? { text, contentType: response.headers.get("content-type") ?? undefined }
            : text) as T;
        }
        return (await response.json()) as T;
      }

      const errorBody = await response.text();
      // A retried POST/PUT/PATCH can repeat a comment or workflow mutation if
      // Azure completed the first request but the response was lost.
      if (method !== "GET" || !retryable.has(response.status) || attempt === 2) {
        throw new AdoHttpError(
          `Azure DevOps request failed (${response.status})`,
          response.status,
          url.toString(),
          errorBody,
        );
      }

      const retryAfter = Number(response.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : 300 * 2 ** attempt;
      await sleep(delay);
    }

    throw new Error("Unreachable Azure DevOps retry state");
  }
}
