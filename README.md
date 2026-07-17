# Better Auth OAuth SSO demo

Independent projects demonstrate central single sign-on and JWT verification:

- `auth-server` — Better Auth OAuth 2.1/OIDC provider and **company product portal** on `http://localhost:3000`
- `app-one` — Express relying party on `http://localhost:3001` (confidential client, server-side PKCE)
- `app-two` — Express relying party on `http://localhost:3002` (confidential client, server-side PKCE)
- `api-server` — NestJS REST API on `http://localhost:3004` (verifies OIDC ID tokens via JWKS)
- `app-spa` — vanilla HTML/CSS/JS SPA on `http://localhost:3003` (public client, browser PKCE)

Each directory has its own `package.json` and `node_modules`. App One/Two use `openid-client` with Authorization Code flow, S256 PKCE, and state validation on the server. The SPA exchanges the code in the browser and can call Nest directly with the ID token. Passwords and accounts exist only in the Better Auth server. Auth data is stored in MySQL.

## Company product portal

Open [http://localhost:3000](http://localhost:3000) for the product portal. Application links are loaded from `auth-server/portal-apps.json`. Edit that file to add, remove, rename, or disable products (`"enabled": false`), then reload the page — no code change required.

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
cd ..\api-server
npm install
cd ..\app-spa
npm install
```

## MySQL

From the repo root, start MySQL with a persistent named volume:

```powershell
docker compose up -d
```

Wait until the container is healthy (`docker compose ps`). Compose creates the `better_auth` database on first start. Data survives `docker compose down` / `up`; use `docker compose down -v` only if you want to wipe the volume.

Default credentials match `auth-server/.env.example`: root / root on `localhost:3306`.

phpMyAdmin is included in Compose at [http://localhost:8080](http://localhost:8080) (server: `mysql`, user: `root`, password: `root`).

## One-time setup

Optionally copy `auth-server/.env.example` to `auth-server/.env` and replace `BETTER_AUTH_SECRET`. The included fallback is suitable only for this local demo. `MYSQL_*` values already match the Compose service.

### SMTP (required for password setup emails)

The auth server now sends password setup links over SMTP. Set these in `auth-server/.env`:

```env
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=Auth Demo <no-reply@example.com>
# Set to false if SMTP fails with "self-signed certificate" (common behind corporate proxies).
SMTP_TLS_REJECT_UNAUTHORIZED=false
```

With MySQL running, run migrations and register trusted OAuth clients:

```powershell
cd auth-server
npm run setup
```

This migrates Better Auth tables in MySQL and:

- writes confidential client credentials for App One/Two into `auth-server/.env`
- registers a **public** SPA client (`token_endpoint_auth_method: none`) and writes `APP_SPA_OIDC_CLIENT_ID`
- generates `app-spa/js/config.js` with the SPA `clientId`
- writes audience/CORS settings into `api-server/.env`

Re-running setup keeps existing generated credentials.

### Re-bootstrap after a fresh database

If MySQL is emptied or recreated (new Docker volume, `docker compose down -v`, new database name), old `APP_*_OIDC_CLIENT_ID` / `APP_*_OIDC_CLIENT_SECRET` values in `auth-server/.env` still point at clients that no longer exist. Bootstrap then fails with:

```text
[APIError] { status: 'NOT_FOUND', body: { error: 'not_found', error_description: 'client not found' } }
```

Clear those `APP_*_OIDC_*` values in `auth-server/.env` (and matching vars in `app-one/.env` / `app-two/.env` / `api-server/.env` if present), then run `npm run setup` again so new clients are created and exported.

## Dormant account flow

Signup is invite-style:

1. User submits name + email on `/sign-up` (no password field).
2. A dormant account is created.
3. A password setup link is emailed to the user.
4. User opens `/set-password?token=...` and sets a password.
5. Account is activated (`accountStatus=active`, `emailVerified=true`) and can sign in / use SSO.

If a dormant user tries to authenticate before setting a password, the auth server blocks session creation.

### Admin/API provisioning

After `npm run setup`, the bootstrap user is seeded with role `admin`:

- Email: `oauth-bootstrap@local.test`
- Password: `local-bootstrap-password`

Open the admin panel at [http://localhost:3000/admin](http://localhost:3000/admin), sign in with that account, then create users with **name + email only**. Existing emails return an error; new accounts get a password setup email (same flow as public signup).

REST equivalent (admin session cookie required):

```http
POST /api/admin/create-user
Content-Type: application/json
Cookie: <admin-session-cookie>

{ "name": "Alice", "email": "alice@example.com" }
```

Responses:

- `201` — account created, setup email sent
- `409` — email already exists
- `403` — not an admin session

Resend a setup email for an existing pending user:

```http
POST /api/admin/send-setup-email
Content-Type: application/json
Cookie: <admin-session-cookie>

{ "email": "alice@example.com" }
```

You can also use Better Auth’s built-in admin create-user (password optional depending on config):

```http
POST /api/auth/admin/create-user
Content-Type: application/json

{ "name": "Alice", "email": "alice@example.com", "role": "user" }
```

Then trigger setup email via `/api/admin/send-setup-email` as above.
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

Google is optional: the provider and its UI are enabled only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are non-empty.

Google is **sign-in only** for existing accounts (`disableSignUp: true`). New users must sign up with email and complete password setup first. An unknown Google email is refused (`signup_disabled`) and redirected back to `/sign-in` with an error message. If Google uses the same email as an existing email/password account, Better Auth links them automatically. This demo trusts Google for that (`account.accountLinking` in `auth-server/src/auth.ts`) because local email verification is not enabled. Without that config you may see `account_not_linked`.

If Google fails with `invalid_code`, the auth-server could not call Google’s token endpoint. On networks that intercept TLS (corporate proxies), auth-server scripts run Node with `--use-system-ca` so the Windows trust store is used. Restart with `npm run restart` after pulling that change. Also confirm the OAuth client redirect URI is exactly `http://localhost:3000/api/auth/callback/google`.

## JWT trust model

Better Auth keeps its private signing key in MySQL and publishes only the public keys through the OIDC `jwks_uri`.

### App One / App Two (confidential)

After exchanging an authorization code server-side, each app:

1. Requires a signed OIDC ID token.
2. Fetches and caches the provider's public JWKS.
3. Uses `jose` to verify the signature, issuer, client-specific audience, expiry, and timing claims.
4. Creates its local Express session only from the verified JWT payload.

The ID token and access token remain server-side and are never sent to App One/Two browser JavaScript.

### SPA + Nest (public client + Nest JWT exchange)

1. The SPA completes PKCE in the browser and stores the Better Auth ID token in `sessionStorage`.
2. **Exchange → Nest JWT** calls `POST /auth/exchange`:
   - If the Bearer token is a Nest JWT (`iss=http://localhost:3004`), accept it.
   - Otherwise verify it as a Better Auth ID token (JWKS), then **mint and return** an api-server JWT (HS256, 1h by default).
3. **Verify current token** calls `POST /auth/verify`, which accepts **either** Nest JWT or Better Auth ID token and reports `source: "api-server" | "better-auth"`.
4. **Call demo profile API** hits `GET /demo/profile` (same exchange-or-accept behavior).

Nest signs its own tokens with `NEST_JWT_SECRET` (see `api-server/.env`).

## Start

From the repo root, start all servers at once (minimized PowerShell windows):

```powershell
npm run start:all
```

Stop or restart them the same way:

```powershell
npm run stop
npm run restart
```

These map to `scripts/stop-servers.ps1`, `scripts/start-servers.ps1`, and `scripts/restart-servers.ps1`.

Or open terminals manually:

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

```powershell
cd api-server
npm run dev
```

```powershell
cd app-spa
npm run dev
```

## Demonstrate SSO

1. Open `http://localhost:3001` and choose **Login with Better Auth**.
2. The browser moves to port 3000. Create an account or sign in there.
3. Better Auth returns an authorization code to App One, which exchanges it server-side and displays the OIDC claims.
4. Open App Two and choose **Login with Better Auth**.
5. The browser briefly visits port 3000 and immediately returns to App Two without asking for the password, because the central Better Auth session already exists.

Each Express relying party still has its own local session cookie. **Log out everywhere** (portal **Sign out**, SPA **Sign out**, or App One/Two **Log out everywhere**) clears the central Better Auth session, then visits App One → App Two → SPA `logout.html` to clear each local session/token store before returning to the finish URL.

The dashboards also display safe application-local session data. App One assigns the `report-viewer` role with a `blue` theme, while App Two independently assigns `operations-editor` with a `violet` theme. These values are not part of the shared ID token.

## Demonstrate SPA → Nest exchange / verify

1. Open `http://localhost:3003` and choose **Login with Better Auth**.
2. After callback, the SPA dashboard shows claims from the browser-held Better Auth ID token.
3. Click **Exchange → Nest JWT** — Nest verifies the ID token and returns an api-server JWT (`exchanged: true`).
4. Click **Verify current token** — should report `source: "api-server"`.
5. Optionally click **Call demo profile API** for the same exchange-or-accept path on `GET /demo/profile`.
6. **Sign out** runs global logout (Better Auth + App One + App Two + SPA tokens) via `http://localhost:3000/global-logout`, then returns to the SPA home page.

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
