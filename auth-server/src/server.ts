import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth, authBaseUrl, dbPool, isGoogleSignInEnabled } from "./auth.js";

const app = express();
const port = Number(process.env.AUTH_PORT ?? 3000);

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
