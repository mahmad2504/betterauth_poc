# Better Auth OAuth SSO demo

Three independent Node/Express projects demonstrate central single sign-on:

- `auth-server` — Better Auth OAuth 2.1/OIDC provider on `http://localhost:3000`
- `app-one` — Express relying party on `http://localhost:3001`
- `app-two` — Express relying party on `http://localhost:3002`

Each directory has its own `package.json` and `node_modules`. The two applications use `openid-client` with Authorization Code flow, S256 PKCE, and state validation. Passwords and accounts exist only in the Better Auth server.

## Prerequisites

- Node.js 22 or newer
- npm

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

## One-time setup

Optionally copy `auth-server/.env.example` to `auth-server/.env` and replace `BETTER_AUTH_SECRET`. The included fallback is suitable only for this local demo.

Run migrations and register both trusted OAuth clients:

```powershell
cd auth-server
npm run setup
```

This creates `auth-server/data/auth.sqlite` and writes generated client credentials to `app-one/.env` and `app-two/.env`. These files are intentionally ignored by Git. Re-running setup keeps existing generated credentials.

## JWT trust model

Better Auth keeps its private signing key in `auth-server/data/auth.sqlite` and publishes only the public keys through the OIDC `jwks_uri`. After exchanging an authorization code, each app:

1. Requires a signed OIDC ID token.
2. Fetches and caches the provider's public JWKS.
3. Uses `jose` to verify the signature, issuer, client-specific audience, expiry, and timing claims.
4. Creates its local Express session only from the verified JWT payload.

The ID token and access token remain server-side and are never sent to application browser JavaScript.

## Start

Open three terminals:

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
