import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

const databasePath = resolve(process.env.DATABASE_PATH ?? "./data/auth.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

export const authBaseUrl =
  process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  appName: "Better Auth SSO Demo",
  baseURL: authBaseUrl,
  basePath: "/api/auth",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "local-demo-only-secret-change-before-real-deployment",
  database: new Database(databasePath),
  trustedOrigins: [
    authBaseUrl,
    "http://localhost:3001",
    "http://localhost:3002",
  ],
  emailAndPassword: {
    enabled: true,
  },
  disabledPaths: ["/token"],
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      scopes: ["openid", "profile", "email", "offline_access"],
    }),
  ],
});
