# Better Auth OAuth SSO demo

Three independent Node/Express projects demonstrate central single sign-on:

- `auth-server` — Better Auth OAuth 2.1/OIDC provider on `http://localhost:3000`
- `app-one` — Express relying party on `http://localhost:3001`
- `app-two` — Express relying party on `http://localhost:3002`

Each directory has its own `package.json` and `node_modules`. The two applications use `openid-client` with Authorization Code flow, S256 PKCE, and state validation. Passwords and accounts exist only in the Better Auth server. Auth data is stored in MySQL.

## Prerequisites

- Node.js 22 or newer
- npm
- Docker (for the MySQL service)

## Install

Install each project independently:

```powershell
cd auth-server
npm install
cd ..\app-one
npm install
cd ..\app-two
npm install
```

## MySQL

From the repo root, start MySQL with a persistent named volume:

```powershell
docker compose up -d
```

Wait until the container is healthy (`docker compose ps`). Compose creates the `better_auth` database on first start. Data survives `docker compose down` / `up`; use `docker compose down -v` only if you want to wipe the volume.

Default credentials match `auth-server/.env.example`: root / root on `localhost:3306`.

## One-time setup

Optionally copy `auth-server/.env.example` to `auth-server/.env` and replace `BETTER_AUTH_SECRET`. The included fallback is suitable only for this local demo. `MYSQL_*` values already match the Compose service.

With MySQL running, run migrations and register both trusted OAuth clients:

```powershell
cd auth-server
npm run setup
```

This migrates Better Auth tables in MySQL and writes generated client credentials to `app-one/.env` and `app-two/.env`. These files are intentionally ignored by Git. Re-running setup keeps existing generated credentials.

### Re-bootstrap after a fresh database

If MySQL is emptied or recreated (new Docker volume, `docker compose down -v`, new database name), old `APP_*_OIDC_CLIENT_ID` / `APP_*_OIDC_CLIENT_SECRET` values in `auth-server/.env` still point at clients that no longer exist. Bootstrap then fails with:

```text
[APIError] { status: 'NOT_FOUND', body: { error: 'not_found', error_description: 'client not found' } }
```

Clear those four values in `auth-server/.env` (and the matching vars in `app-one/.env` / `app-two/.env` if present), then run `npm run setup` again so new clients are created and exported.

## Google sign-in

The IdP also supports Google as a social provider. App-one and app-two still use OIDC against Better Auth; only the central `/sign-in` / `/sign-up` pages offer **Continue with Google**.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Add this authorized redirect URI:

   `http://localhost:3000/api/auth/callback/google`
3. Put the Client ID and Client Secret in `auth-server/.env`:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

4. Restart the auth-server. On `/sign-in` (including when arriving from App One or App Two), choose **Continue with Google**.

Google is optional: the provider and its UI are enabled only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are non-empty. If Google uses the same email as an existing email/password account, Better Auth links them automatically. This demo trusts Google for that (`account.accountLinking` in `auth-server/src/auth.ts`) because local email verification is not enabled. Without that config you may see `account_not_linked`.

## JWT trust model

Better Auth keeps its private signing key in MySQL and publishes only the public keys through the OIDC `jwks_uri`. After exchanging an authorization code, each app:

1. Requires a signed OIDC ID token.
2. Fetches and caches the provider's public JWKS.
3. Uses `jose` to verify the signature, issuer, client-specific audience, expiry, and timing claims.
4. Creates its local Express session only from the verified JWT payload.

The ID token and access token remain server-side and are never sent to application browser JavaScript.

## Start

From the repo root, start all three servers at once (minimized PowerShell windows):

```powershell
npm run start:all
```

Stop or restart them the same way:

```powershell
npm run stop
npm run restart
```

These map to `scripts/stop-servers.ps1`, `scripts/start-servers.ps1`, and `scripts/restart-servers.ps1`.

Or open three terminals manually:

```powershell
cd auth-server
npm run dev
```

```powershell
cd app-one
npm run dev
```

```powershell
cd app-two
npm run dev
```

## Demonstrate SSO

1. Open `http://localhost:3001` and choose **Login with Better Auth**.
2. The browser moves to port 3000. Create an account or sign in there.
3. Better Auth returns an authorization code to App One, which exchanges it server-side and displays the OIDC claims.
4. Open App Two and choose **Login with Better Auth**.
5. The browser briefly visits port 3000 and immediately returns to App Two without asking for the password, because the central Better Auth session already exists.

Each relying party still has its own local session cookie. **Log out everywhere** clears the central Better Auth session and visits both applications to clear both local cookies before returning to the app where logout started.

The dashboards also display safe application-local session data. App One assigns the `report-viewer` role with a `blue` theme, while App Two independently assigns `operations-editor` with a `violet` theme. These values are not part of the shared ID token.

## Checks

After installing dependencies, run these in each directory:

```powershell
npm run typecheck
npm test
```

The OAuth client tests cover signed-out rendering, protected dashboard redirects, PKCE state rejection, explicit ID-token signature and claim verification, and the global logout chain. The full SSO flow is best verified in a browser because it spans three origins and the central session cookie.

## Demo-only choices

- HTTP and in-memory Express session stores are used for localhost clarity.
- The OAuth clients are trusted first-party clients with consent skipped.
- Production deployments should use HTTPS, strong secrets, a durable session store, explicit origin configuration, and a reviewed client-provisioning process.
