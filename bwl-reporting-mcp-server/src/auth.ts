/**
 * BWL OAuth 2.0 client-credentials token manager.
 * Reads credentials from environment variables — never hardcoded.
 */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function getEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Required environment variable ${name} is not set`);
  return val;
}

export function getBwlServer(): string {
  return getEnv("BWL_SERVER").replace(/\/$/, "");
}

export async function getToken(): Promise<string> {
  const now = Date.now();
  // Refresh 60 s before expiry
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const server = getBwlServer();
  const clientId = getEnv("BWL_CLIENT_ID");
  const clientSecret = getEnv("BWL_CLIENT_SECRET");
  const consentType = process.env["BWL_CONSENT_TYPE"]; // set to "user_consent" for User Service IDs

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (consentType) body.set("consent_type", consentType);

  const res = await fetch(`${server}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    redirect: "follow",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed ${res.status}: ${text}`);
  }

  const json = (await res.json()) as TokenResponse;
  cachedToken = json.access_token;
  tokenExpiresAt = now + json.expires_in * 1000;
  return cachedToken;
}

/**
 * Perform an authenticated BWL API request with automatic 429 back-off.
 */
export async function bwlFetch(
  path: string,
  init: RequestInit = {},
  onBehalfOf?: string
): Promise<Response> {
  const token = await getToken();
  const server = getBwlServer();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (onBehalfOf) headers["X-On-Behalf-Of"] = onBehalfOf;

  const url = path.startsWith("http") ? path : `${server}${path}`;

  let res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    // Cached token may have been invalidated; refresh and retry once
    cachedToken = null;
    headers["Authorization"] = `Bearer ${await getToken()}`;
    res = await fetch(url, { ...init, headers });
  }

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
    console.error(`[bwl-mcp] Rate limited — waiting ${retryAfter}s`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    // Refresh token and retry once
    cachedToken = null;
    const retryToken = await getToken();
    headers["Authorization"] = `Bearer ${retryToken}`;
    res = await fetch(url, { ...init, headers });
  }

  return res;
}

/**
 * Helper: parse JSON response or throw a descriptive error.
 */
export async function bwlJson<T>(
  path: string,
  init?: RequestInit,
  onBehalfOf?: string
): Promise<T> {
  const res = await bwlFetch(path, init, onBehalfOf);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`BWL API ${res.status} on ${path}: ${text}`);
  }
  return JSON.parse(text) as T;
}
