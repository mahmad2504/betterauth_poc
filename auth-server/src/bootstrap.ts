import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auth, dbPool } from "./auth.js";

type CreatedClient = {
  client_id: string;
  client_secret?: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const distributionEnvPath = resolve(here, "../.env");
const rotateSecrets = process.argv.includes("--rotate-secrets");

const apps = [
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
] as const;

async function getBootstrapHeaders() {
  const credentials = {
    email: "oauth-bootstrap@local.test",
    password: "local-bootstrap-password",
  };

  let response: Response | undefined;
  try {
    response = await auth.api.signUpEmail({
      body: {
        ...credentials,
        name: "OAuth Client Bootstrap",
      },
      asResponse: true,
    });
  } catch {}

  if (!response?.ok) {
    response = await auth.api.signInEmail({
      body: credentials,
      asResponse: true,
    });
  }

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

async function createClient(
  name: string,
  callbackUrl: string,
): Promise<CreatedClient> {
  bootstrapHeaders ??= await getBootstrapHeaders();
  const client = await auth.api.adminCreateOAuthClient({
    headers: bootstrapHeaders,
    body: {
      client_name: name,
      redirect_uris: [callbackUrl],
      token_endpoint_auth_method: "client_secret_basic",
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

async function updateClient(
  clientId: string,
  name: string,
  callbackUrl: string,
) {
  bootstrapHeaders ??= await getBootstrapHeaders();
  await auth.api.adminUpdateOAuthClient({
    headers: bootstrapHeaders,
    body: {
      client_id: clientId,
      update: {
        client_name: name,
        redirect_uris: [callbackUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "openid profile email offline_access",
        client_secret_expires_at: 0,
        skip_consent: true,
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

function exportCredentials(envPrefix: string, client: Required<CreatedClient>) {
  const values = {
    [`${envPrefix}_OIDC_CLIENT_ID`]: client.client_id,
    [`${envPrefix}_OIDC_CLIENT_SECRET`]: client.client_secret,
  };
  const contents = existsSync(distributionEnvPath)
    ? readFileSync(distributionEnvPath, "utf8")
    : "";
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

  writeFileSync(distributionEnvPath, lines.join("\n"), "utf8");
}

for (const app of apps) {
  const clientId = process.env[`${app.envPrefix}_OIDC_CLIENT_ID`];
  const clientSecret = process.env[`${app.envPrefix}_OIDC_CLIENT_SECRET`];
  let client: CreatedClient;

  if (clientId && clientSecret) {
    await updateClient(clientId, app.name, app.callbackUrl);
    client = rotateSecrets
      ? await rotateClientSecret(clientId)
      : { client_id: clientId, client_secret: clientSecret };
  } else {
    client = await createClient(app.name, app.callbackUrl);
  }

  if (!client.client_secret) {
    throw new Error(`Better Auth did not return a secret for ${app.name}`);
  }
  exportCredentials(app.envPrefix, {
    client_id: client.client_id,
    client_secret: client.client_secret,
  });
  console.log(
    `${app.name}: ${rotateSecrets && clientId ? "rotated and exported" : "exported"} OAuth credentials to ${distributionEnvPath}`,
  );
}

await dbPool.end();

