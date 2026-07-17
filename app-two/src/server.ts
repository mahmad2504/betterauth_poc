import "dotenv/config";
import { createClientApp } from "./create-client-app.js";

const required = [
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "SESSION_SECRET",
] as const;

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(
      `Missing ${name}. Run "npm run setup" in ../auth-server first.`,
    );
  }
}

const port = Number(process.env.PORT ?? 3002);
const baseUrl = process.env.APP_BASE_URL ?? `http://localhost:${port}`;
const app = createClientApp({
  name: process.env.APP_NAME ?? "Application Two",
  color: decodeURIComponent(process.env.APP_COLOR ?? "%237c3aed"),
  baseUrl,
  otherAppUrl: process.env.OTHER_APP_URL ?? "http://localhost:3001",
  issuer: process.env.OIDC_ISSUER ?? "http://localhost:3000/api/auth",
  clientId: process.env.OIDC_CLIENT_ID!,
  clientSecret: process.env.OIDC_CLIENT_SECRET!,
  sessionSecret: process.env.SESSION_SECRET!,
  sessionRole: "operations-editor",
  sessionTheme: "violet",
  globalLogoutNext: "http://localhost:3003/logout.html",
});

app.listen(port, () => {
  console.log(`${process.env.APP_NAME ?? "Application Two"}: ${baseUrl}`);
});
