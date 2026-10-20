/**
 * BWL OAuth 2.0 client-credentials token manager and HTTP helper.
 * Credentials come from environment variables only and are never logged.
 * For User Service IDs, set BWL_CONSENT_TYPE=user_consent to send consent_type.
 */

const REQUEST_TIMEOUT_MS = 60_000;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function getEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Required environment variable ${name} is not set`);
  return val;
}

export function getBwlServer(): string {
  const server = getEnv("BWL_SERVER").replace(/\/$/, "");
  if (!server.startsWith("https://")) {
    throw new Error("BWL_SERVER must be an https:// URL");
  }
  return server;
}

export async function getToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: getEnv("BWL_CLIENT_ID"),
    client_secret: getEnv("BWL_CLIENT_SECRET"),
  });
  const consentType = process.env["BWL_CONSENT_TYPE"];
  if (consentType) body.set("consent_type", consentType);

  const res = await fetch(`${getBwlServer()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Do not echo the response body; it may reference credentials.
    throw new Error(`Token request failed with HTTP ${res.status}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = json.access_token;
  tokenExpiresAt = now + json.expires_in * 1000;
  return cachedToken;
}

export interface BwlRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Path beginning with "/", e.g. /bwl/artifacts/123 */
  path: string;
  query?: Record<string, string | boolean | undefined>;
  /** JSON body (object or array). */
  json?: unknown;
  /** Multipart body. */
  form?: FormData;
  headers?: Record<string, string>;
}

export interface BwlResponse {
  status: number;
  ok: boolean;
  text: string;
}

/**
 * Perform an authenticated BWL API request. Retries once on 429 (Retry-After).
 */
export async function bwlRequest(req: BwlRequest): Promise<BwlResponse> {
  const url = new URL(`${getBwlServer()}${req.path}`);
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const onBehalfOf = process.env["BWL_ON_BEHALF_OF"];

  const send = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(onBehalfOf ? { "X-On-Behalf-Of": onBehalfOf } : {}),
      ...req.headers,
    };
    let body: BodyInit | undefined;
    if (req.form) {
      body = req.form;
    } else if (req.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(req.json);
    }
    return fetch(url, {
      method: req.method ?? "GET",
      headers,
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  let res = await send(await getToken());

  if (res.status === 401) {
    res = await send(await getToken(true));
  }
  if (res.status === 429) {
    const retryAfter = Math.min(parseInt(res.headers.get("Retry-After") ?? "60", 10) || 60, 120);
    console.error(`[bwl-authoring] Rate limited; waiting ${retryAfter}s`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    res = await send(await getToken(true));
  }

  return { status: res.status, ok: res.ok, text: await res.text() };
}
