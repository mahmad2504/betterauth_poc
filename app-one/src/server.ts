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

const port = Number(process.env.PORT ?? 3001);
const baseUrl = process.env.APP_BASE_URL ?? `http://localhost:${port}`;
const app = createClientApp({
  name: process.env.APP_NAME ?? "Application One",
  color: decodeURIComponent(process.env.APP_COLOR ?? "%232563eb"),
  baseUrl,
  otherAppUrl: process.env.OTHER_APP_URL ?? "http://localhost:3002",
  issuer: process.env.OIDC_ISSUER ?? "http://localhost:3000/api/auth",
  clientId: process.env.OIDC_CLIENT_ID!,
  clientSecret: process.env.OIDC_CLIENT_SECRET!,
  sessionSecret: process.env.SESSION_SECRET!,
  sessionRole: "report-viewer",
  sessionTheme: "blue",
  globalLogoutNext: "http://localhost:3002/auth/global-logout",
});

app.listen(port, () => {
  console.log(`${process.env.APP_NAME ?? "Application One"}: ${baseUrl}`);
});
