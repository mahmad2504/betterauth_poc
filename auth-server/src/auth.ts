import "dotenv/config";
import { createPool } from "mysql2/promise";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

export const authBaseUrl =
  process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const dbPool = createPool({
  host: process.env.MYSQL_HOST ?? "localhost",
  port: Number(process.env.MYSQL_PORT ?? "3306"),
  user: process.env.MYSQL_USER ?? "root",
  password: process.env.MYSQL_PASSWORD ?? "root",
  database: process.env.MYSQL_DATABASE ?? "better_auth",
  timezone: "Z",
});

export const auth = betterAuth({
  appName: "Better Auth SSO Demo",
  baseURL: authBaseUrl,
  basePath: "/api/auth",
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "local-demo-only-secret-change-before-real-deployment",
  database: dbPool,
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
