import { createPkcePair, createState } from "./pkce.js";

const STORAGE_KEYS = {
  verifier: "app_spa_pkce_verifier",
  state: "app_spa_oauth_state",
  idToken: "app_spa_id_token",
  accessToken: "app_spa_access_token",
  nestAccessToken: "app_spa_nest_access_token",
  claims: "app_spa_claims",
};

function getConfig() {
  const config = window.APP_SPA_CONFIG;
  if (!config?.issuer || !config?.clientId) {
    throw new Error(
      "Missing SPA OAuth config. Run npm run setup in auth-server first.",
    );
  }
  return config;
}

async function discover() {
  const { issuer } = getConfig();
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`OIDC discovery failed (${response.status})`);
  }
  return response.json();
}

function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  if (!payload) throw new Error("Malformed JWT");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

/** Current Better Auth cookie session (SSO), if any. */
export async function fetchAuthServerSession() {
  const { issuer } = getConfig();
  const response = await fetch(`${issuer}/get-session`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  return body?.user ? body : null;
}

/**
 * Keep SPA sessionStorage tokens aligned with the Better Auth SSO cookie.
 * If the portal user changed (e.g. Mumtaz → admin), drop stale SPA tokens.
 */
export async function reconcileLocalSessionWithAuthServer() {
  const local = getSession();
  const remote = await fetchAuthServerSession();
  const remoteUser = remote?.user;

  if (!remoteUser) {
    if (local) clearSession();
    return { local: null, remoteUser: null, matched: false, action: "signed-out" };
  }

  if (!local) {
    return { local: null, remoteUser, matched: false, action: "needs-login" };
  }

  const sameUser =
    (local.claims.sub && local.claims.sub === remoteUser.id) ||
    (local.claims.email &&
      String(local.claims.email).toLowerCase() ===
        String(remoteUser.email ?? "").toLowerCase());

  if (!sameUser) {
    clearSession();
    return {
      local: null,
      remoteUser,
      matched: false,
      action: "user-switched",
    };
  }

  return { local, remoteUser, matched: true, action: "ok" };
}

async function nestFetch(url, bearerToken, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body.message || body.error || `Nest request failed (${response.status})`,
    );
  }
  return body;
}

export async function beginLogin() {
  const config = getConfig();
  const metadata = await discover();
  const { verifier, challenge } = await createPkcePair();
  const state = createState();

  sessionStorage.setItem(STORAGE_KEYS.verifier, verifier);
  sessionStorage.setItem(STORAGE_KEYS.state, state);

  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  location.href = url.href;
}

export async function completeLoginFromCallback() {
  const config = getConfig();
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  if (error) {
    throw new Error(
      params.get("error_description") || `Authorization failed: ${error}`,
    );
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = sessionStorage.getItem(STORAGE_KEYS.state);
  const verifier = sessionStorage.getItem(STORAGE_KEYS.verifier);

  if (!code || !state || !verifier || state !== expectedState) {
    throw new Error("Invalid or expired login state. Start login again.");
  }

  const metadata = await discover();
  const tokenResponse = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: verifier,
    }),
  });

  const tokens = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokens.id_token) {
    throw new Error(
      tokens.error_description ||
        tokens.error ||
        `Token exchange failed (${tokenResponse.status})`,
    );
  }

  const claims = decodeJwtPayload(tokens.id_token);
  sessionStorage.setItem(STORAGE_KEYS.idToken, tokens.id_token);
  if (tokens.access_token) {
    sessionStorage.setItem(STORAGE_KEYS.accessToken, tokens.access_token);
  }
  sessionStorage.removeItem(STORAGE_KEYS.nestAccessToken);
  sessionStorage.setItem(STORAGE_KEYS.claims, JSON.stringify(claims));
  sessionStorage.removeItem(STORAGE_KEYS.verifier);
  sessionStorage.removeItem(STORAGE_KEYS.state);

  return claims;
}

export function getSession() {
  const idToken = sessionStorage.getItem(STORAGE_KEYS.idToken);
  const claimsRaw = sessionStorage.getItem(STORAGE_KEYS.claims);
  if (!idToken || !claimsRaw) return null;
  try {
    return {
      idToken,
      nestAccessToken: sessionStorage.getItem(STORAGE_KEYS.nestAccessToken),
      claims: JSON.parse(claimsRaw),
    };
  } catch {
    return null;
  }
}

export function clearSession() {
  for (const key of Object.values(STORAGE_KEYS)) {
    sessionStorage.removeItem(key);
  }
}

/**
 * Clears SPA tokens and runs global logout (Better Auth + all app sessions),
 * then returns to the SPA home page.
 */
export function signOut() {
  clearSession();
  const finish = "http://localhost:3003/";
  const logoutUrl = new URL(
    window.APP_SPA_CONFIG?.signOutUrl ?? "http://localhost:3000/global-logout",
  );
  logoutUrl.searchParams.set("finish", finish);
  location.href = logoutUrl.href;
}

function preferredBearer(session) {
  return session.nestAccessToken || session.idToken;
}

export async function exchangeWithNest() {
  const config = getConfig();
  const session = getSession();
  if (!session?.idToken) {
    throw new Error("No ID token in browser session. Sign in first.");
  }

  const url = config.nestExchangeUrl ?? "http://localhost:3004/auth/exchange";
  // Prefer Nest token if already exchanged; otherwise send Better Auth ID token.
  const body = await nestFetch(url, preferredBearer(session));

  if (body.accessToken) {
    sessionStorage.setItem(STORAGE_KEYS.nestAccessToken, body.accessToken);
  }
  return body;
}

export async function verifyWithNest() {
  const config = getConfig();
  const session = getSession();
  if (!session?.idToken && !session?.nestAccessToken) {
    throw new Error("No token in browser session. Sign in first.");
  }

  const url = config.nestVerifyUrl ?? "http://localhost:3004/auth/verify";
  return nestFetch(url, preferredBearer(session));
}

export async function callNestProfile() {
  const config = getConfig();
  const session = getSession();
  if (!session?.idToken && !session?.nestAccessToken) {
    throw new Error("No token in browser session. Sign in first.");
  }

  const url = config.nestProfileUrl ?? "http://localhost:3004/demo/profile";
  const body = await nestFetch(url, preferredBearer(session), "GET");
  if (body.accessToken) {
    sessionStorage.setItem(STORAGE_KEYS.nestAccessToken, body.accessToken);
  }
  return body;
}
