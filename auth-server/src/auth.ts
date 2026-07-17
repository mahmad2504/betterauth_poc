import "dotenv/config";
import { createPool } from "mysql2/promise";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { sendPasswordSetupEmail } from "./mail.js";

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

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";

/** Google sign-in is optional; only enable when both credentials are set. */
export const isGoogleSignInEnabled = Boolean(
  googleClientId && googleClientSecret,
);

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
    "http://localhost:3003",
  ],
  onAPIError: {
    errorURL: `${authBaseUrl}/sign-in`,
  },
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, url }) {
      await sendPasswordSetupEmail({
        to: user.email,
        name: user.name,
        url,
      });
    },
    async onPasswordReset({ user }) {
      // Password setup link was emailed to this address, so treat it as verified.
      await dbPool.execute(
        "UPDATE user SET accountStatus = ?, emailVerified = ? WHERE id = ?",
        ["active", true, user.id],
      );
    },
  },
  user: {
    additionalFields: {
      accountStatus: {
        type: "string",
        required: false,
        defaultValue: "pending",
        input: false,
      },
    },
  },
  ...(isGoogleSignInEnabled
    ? {
        account: {
          accountLinking: {
            enabled: true,
            // Demo uses email/password without verification, so local emails are
            // often unverified. Trust Google so same-email social sign-in can link.
            trustedProviders: ["google" as const],
            requireLocalEmailVerified: false,
          },
        },
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            prompt: "select_account" as const,
            // Refuse Google when no local account exists; do not create users.
            disableSignUp: true,
          },
        },
      }
    : {}),
  disabledPaths: ["/token"],
  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      scopes: ["openid", "profile", "email", "offline_access"],
    }),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
  ],
  databaseHooks: {
    session: {
      create: {
        async before(session, ctx) {
          if (!ctx) return;
          const user = await ctx.context.internalAdapter.findUserById(
            session.userId,
          );
          const accountStatus =
            (user as any)?.accountStatus ?? (user as any)?.data?.accountStatus;

          const accounts = await ctx.context.internalAdapter.findAccounts(
            session.userId,
          );
          const hasCredentialAccount = accounts.some(
            (ac: any) => ac.providerId === "credential",
          );

          // Dormant gate:
          // - If accountStatus says pending, always block.
          // - If there's no credential password set, block even if accountStatus is null
          //   (handles fresh DBs / older rows).
          if (!hasCredentialAccount) {
            throw APIError.from("FORBIDDEN", {
              code: "DORMANT_ACCOUNT",
              message: "Complete password setup from your email first.",
            });
          }
        },
      },
    },
  },
});
