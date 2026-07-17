import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auth, dbPool } from "./auth.js";

type CreatedClient = {
  client_id: string;
  client_secret?: string;
};

type AppRegistration = {
  envPrefix: string;
  name: string;
  callbackUrl: string;
  publicClient?: boolean;
};

const here = dirname(fileURLToPath(import.meta.url));
const distributionEnvPath = resolve(here, "../.env");
const spaConfigPath = resolve(here, "../../app-spa/js/config.js");
const apiServerEnvPath = resolve(here, "../../api-server/.env");
const rotateSecrets = process.argv.includes("--rotate-secrets");

const apps: AppRegistration[] = [
  {
    envPrefix: "APP_ONE",
    name: "Application One",
    callbackUrl: "http://localhost:3001/auth/callback",
  },
  {
    envPrefix: "APP_TWO",
    name: "Application Two",
    callbackUrl: "http://localhost:3002/auth/callback",
  },
  {
    envPrefix: "APP_SPA",
    name: "SPA Application",
    callbackUrl: "http://localhost:3003/callback.html",
    publicClient: true,
  },
];

async function getBootstrapHeaders() {
  const credentials = {
    email: "oauth-bootstrap@local.test",
    password: "local-bootstrap-password",
  };

  let response = await auth.api
    .signInEmail({
      body: credentials,
      asResponse: true,
    })
    .catch(() => undefined);

  if (!response?.ok) {
    await auth.api
      .createUser({
        body: {
          email: credentials.email,
          password: credentials.password,
          name: "OAuth Client Bootstrap",
          role: "admin",
        },
      })
      .catch(() => undefined);

    response = await auth.api.signInEmail({
      body: credentials,
      asResponse: true,
    });
  }

  // Ensure role survives older bootstraps (user may exist with role=null).
  await dbPool.execute(
    "UPDATE user SET role = ?, emailVerified = ? WHERE email = ?",
    ["admin", true, credentials.email],
  );

  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  if (!cookie) {
    throw new Error(
      `Could not create a bootstrap Better Auth session (${response.status} ${response.statusText})`,
    );
  }
  return new Headers({ cookie });
}

let bootstrapHeaders: Headers | undefined;

async function createClient(app: AppRegistration): Promise<CreatedClient> {
  bootstrapHeaders ??= await getBootstrapHeaders();
  const client = await auth.api.adminCreateOAuthClient({
    headers: bootstrapHeaders,
    body: {
      client_name: app.name,
      redirect_uris: [app.callbackUrl],
      token_endpoint_auth_method: app.publicClient
        ? "none"
        : "client_secret_basic",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid profile email offline_access",
      require_pkce: true,
      client_secret_expires_at: 0,
      skip_consent: true,
    },
  });

  return client as CreatedClient;
}

async function updateClient(app: AppRegistration, clientId: string) {
  bootstrapHeaders ??= await getBootstrapHeaders();
  await auth.api.adminUpdateOAuthClient({
    headers: bootstrapHeaders,
    body: {
      client_id: clientId,
      update: {
        client_name: app.name,
        redirect_uris: [app.callbackUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "openid profile email offline_access",
        client_secret_expires_at: 0,
        skip_consent: true,
        ...(app.publicClient
          ? { token_endpoint_auth_method: "none" as const }
          : {}),
      },
    },
  });
}

async function rotateClientSecret(clientId: string): Promise<CreatedClient> {
  bootstrapHeaders ??= await getBootstrapHeaders();
  const client = await auth.api.rotateClientSecret({
    headers: bootstrapHeaders,
    body: { client_id: clientId },
  });

  return client as CreatedClient;
}

function upsertEnvValues(
  envPath: string,
  values: Record<string, string>,
) {
  const contents = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = contents.split(/\r?\n/);

  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((line) => line.startsWith(`${key}=`));
    const entry = `${key}=${value}`;
    if (index >= 0) {
      lines[index] = entry;
    } else {
      lines.splice(lines.at(-1) === "" ? -1 : lines.length, 0, entry);
    }
  }

  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, lines.join("\n"), "utf8");
}

function exportConfidentialCredentials(
  envPrefix: string,
  client: Required<CreatedClient>,
) {
  upsertEnvValues(distributionEnvPath, {
    [`${envPrefix}_OIDC_CLIENT_ID`]: client.client_id,
    [`${envPrefix}_OIDC_CLIENT_SECRET`]: client.client_secret,
  });
}

function exportPublicCredentials(envPrefix: string, clientId: string) {
  upsertEnvValues(distributionEnvPath, {
    [`${envPrefix}_OIDC_CLIENT_ID`]: clientId,
  });
}

function writeSpaConfig(clientId: string) {
  const contents = `/* Generated by auth-server bootstrap — do not edit by hand. */
window.APP_SPA_CONFIG = {
  issuer: "http://localhost:3000/api/auth",
  clientId: ${JSON.stringify(clientId)},
  redirectUri: "http://localhost:3003/callback.html",
  nestVerifyUrl: "http://localhost:3004/auth/verify",
  nestExchangeUrl: "http://localhost:3004/auth/exchange",
  nestProfileUrl: "http://localhost:3004/demo/profile",
  signOutUrl: "http://localhost:3000/global-logout",
  scopes: "openid profile email",
};
`;
  mkdirSync(dirname(spaConfigPath), { recursive: true });
  writeFileSync(spaConfigPath, contents, "utf8");
}

const exportedClientIds: Record<string, string> = {};

for (const app of apps) {
  const clientId = process.env[`${app.envPrefix}_OIDC_CLIENT_ID`];
  const clientSecret = process.env[`${app.envPrefix}_OIDC_CLIENT_SECRET`];
  let client: CreatedClient;

  if (app.publicClient) {
    if (clientId) {
      await updateClient(app, clientId);
      client = { client_id: clientId };
    } else {
      client = await createClient(app);
    }
    exportPublicCredentials(app.envPrefix, client.client_id);
    writeSpaConfig(client.client_id);
    exportedClientIds[app.envPrefix] = client.client_id;
    console.log(
      `${app.name}: exported public OAuth client_id to ${distributionEnvPath} and ${spaConfigPath}`,
    );
    continue;
  }

  if (clientId && clientSecret) {
    await updateClient(app, clientId);
    client = rotateSecrets
      ? await rotateClientSecret(clientId)
      : { client_id: clientId, client_secret: clientSecret };
  } else {
    client = await createClient(app);
  }

  if (!client.client_secret) {
    throw new Error(`Better Auth did not return a secret for ${app.name}`);
  }
  exportConfidentialCredentials(app.envPrefix, {
    client_id: client.client_id,
    client_secret: client.client_secret,
  });
  exportedClientIds[app.envPrefix] = client.client_id;
  console.log(
    `${app.name}: ${rotateSecrets && clientId ? "rotated and exported" : "exported"} OAuth credentials to ${distributionEnvPath}`,
  );
}

upsertEnvValues(apiServerEnvPath, {
  PORT: "3004",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_ISSUER: "http://localhost:3000/api/auth",
  JWKS_URL: "http://localhost:3000/api/auth/jwks",
  APP_ONE_OIDC_CLIENT_ID:
    exportedClientIds.APP_ONE ?? process.env.APP_ONE_OIDC_CLIENT_ID ?? "",
  APP_TWO_OIDC_CLIENT_ID:
    exportedClientIds.APP_TWO ?? process.env.APP_TWO_OIDC_CLIENT_ID ?? "",
  APP_SPA_OIDC_CLIENT_ID:
    exportedClientIds.APP_SPA ?? process.env.APP_SPA_OIDC_CLIENT_ID ?? "",
  CORS_ORIGINS:
    "http://localhost:3001,http://localhost:3002,http://localhost:3003",
  NEST_JWT_SECRET:
    process.env.NEST_JWT_SECRET ??
    "local-api-server-jwt-secret-change-me-32+",
  NEST_JWT_ISSUER: "http://localhost:3004",
  NEST_JWT_AUDIENCE: "api-server",
  NEST_JWT_EXPIRES_IN: "1h",
});
console.log(`api-server: wrote audience/CORS/Nest JWT config to ${apiServerEnvPath}`);

await dbPool.end();
