import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth, authBaseUrl, dbPool, isGoogleSignInEnabled } from "./auth.js";
import { provisionPendingUser, sendSetupEmailForUser, createPendingUserByAdmin, ProvisionError } from "./provision-user.js";

const app = express();
const port = Number(process.env.AUTH_PORT ?? 3000);

function userHasAdminRole(user: { role?: string | null } | undefined) {
  if (!user?.role) return false;
  return user.role
    .split(",")
    .map((part) => part.trim())
    .includes("admin");
}

function sendAuthPage(res: express.Response, filename: string) {
  const html = readFileSync(join("public", filename), "utf8").replace(
    "</head>",
    `<script>window.__GOOGLE_SIGN_IN_ENABLED__=${isGoogleSignInEnabled}</script>\n</head>`,
  );
  res.type("html").send(html);
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Better Auth Identity Provider</title>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <main class="card">
          <span class="eyebrow">PORT ${port}</span>
          <h1>Central identity provider</h1>
          <p>This Better Auth server owns the account and shared SSO session.</p>
          <div class="actions">
            <a class="button" href="/sign-in">Sign in</a>
            <a class="button secondary" href="/admin">Admin panel</a>
          </div>
        </main>
      </body>
    </html>`);
});

app.get("/sign-in", (_req, res) => {
  sendAuthPage(res, "sign-in.html");
});

app.get("/sign-up", (_req, res) => {
  sendAuthPage(res, "sign-up.html");
});

app.get("/set-password", (_req, res) => {
  sendAuthPage(res, "set-password.html");
});

app.get("/admin", (_req, res) => {
  res.sendFile(join(process.cwd(), "public", "admin.html"));
});

app.post("/api/auth/sign-up/pending", express.json(), async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  if (!name || !email) {
    res.status(400).json({ message: "Name and email are required." });
    return;
  }
  try {
    const result = await provisionPendingUser({ name, email });
    res.status(200).json(result);
  } catch (error) {
    console.error("Failed to provision user or send setup email:", error);
    res.status(500).json({
      message:
        "Could not send setup email. Check SMTP settings in auth-server/.env and restart the server.",
    });
  }
});

app.post("/api/admin/send-setup-email", express.json(), async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session?.user || !userHasAdminRole(session.user)) {
    res.status(403).json({ message: "Admin access required." });
    return;
  }

  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email) {
    res.status(400).json({ message: "Email is required." });
    return;
  }

  await sendSetupEmailForUser(email);
  res.status(200).json({
    message:
      "If this email exists in our system, check your inbox for a password setup link.",
  });
});

app.post("/api/admin/create-user", express.json(), async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session?.user || !userHasAdminRole(session.user)) {
    res.status(403).json({ message: "Admin access required." });
    return;
  }

  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  if (!name || !email) {
    res.status(400).json({ message: "Name and email are required." });
    return;
  }

  try {
    const result = await createPendingUserByAdmin({ name, email });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof ProvisionError) {
      const status =
        error.code === "USER_EXISTS"
          ? 409
          : error.code === "EMAIL_FAILED"
            ? 502
            : 500;
      res.status(status).json({ message: error.message, code: error.code });
      return;
    }
    console.error("Admin create-user failed:", error);
    res.status(500).json({ message: "Could not create user." });
  }
});

app.get("/consent", (_req, res) => {
  res.status(400).type("html").send(`<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><title>Consent</title>
    <link rel="stylesheet" href="/styles.css"></head>
    <body><main class="card"><h1>Unexpected consent request</h1>
    <p>The two demo clients are trusted and should skip consent. Run the bootstrap command again if you see this page.</p>
    </main></body></html>`);
});

app.get("/global-logout", async (req, res, next) => {
  try {
    const finish =
      req.query.finish === "http://localhost:3002/"
        ? "http://localhost:3002/"
        : "http://localhost:3001/";
    const response = await auth.api.signOut({
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    });
    for (const cookie of response.headers.getSetCookie()) {
      res.append("Set-Cookie", cookie);
    }
    const firstAppLogout = new URL(
      "http://localhost:3001/auth/global-logout",
    );
    firstAppLogout.searchParams.set("finish", finish);
    res.redirect(303, firstAppLogout.href);
  } catch (error) {
    next(error);
  }
});

app.use(express.static("public"));

// Better Auth must receive the raw request body, so this route is mounted
// before any Express body parsing middleware.
app.all(
  "/.well-known/oauth-authorization-server/api/auth",
  toNodeHandler(auth),
);
app.all("/api/auth/*splat", toNodeHandler(auth));

app.get("/health", (_req, res) => {
  res.json({ ok: true, issuer: `${authBaseUrl}/api/auth` });
});

const server = app.listen(port, () => {
  console.log(`Better Auth provider: ${authBaseUrl}`);
  const smtpReady = Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM,
  );
  if (!smtpReady) {
    console.warn(
      "SMTP is not configured. Password setup emails will fail until SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM are set in auth-server/.env.",
    );
  }
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, closing MySQL pool…`);
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  try {
    await dbPool.end();
  } catch (error) {
    console.error("Failed to close MySQL pool:", error);
  }
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
