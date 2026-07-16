import express from "express";
import session from "express-session";
import * as oidc from "openid-client";
import {
  createRemoteIdTokenVerifier,
  type IdTokenVerifier,
} from "./verify-id-token.js";

declare module "express-session" {
  interface SessionData {
    pkce?: { codeVerifier: string; state: string };
    user?: Record<string, unknown>;
    application?: ApplicationSessionData;
    tokens?: {
      accessToken: string;
      idToken?: string;
      refreshToken?: string;
    };
  }
}

export type ClientAppConfig = {
  name: string;
  color: string;
  baseUrl: string;
  otherAppUrl: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  sessionRole: string;
  sessionTheme: string;
  globalLogoutNext?: string;
};

export type ApplicationSessionData = {
  applicationName: string;
  role: string;
  theme: string;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function page(config: ClientAppConfig, content: string) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${escapeHtml(config.name)}</title>
      <style>
        :root { font-family: Inter,system-ui,sans-serif; color:#172033; background:#f8fafc; }
        * { box-sizing:border-box; }
        body { min-height:100vh; margin:0; display:grid; place-items:center; padding:24px;
          background:linear-gradient(135deg, ${config.color}18, transparent 55%), #f8fafc; }
        main { width:min(100%,620px); padding:38px; border:1px solid #dbe3ef; border-radius:20px;
          background:white; box-shadow:0 22px 65px #1720331f; }
        .eyebrow { color:${config.color}; font-size:.75rem; font-weight:800; letter-spacing:.12em; }
        h1 { margin:12px 0 8px; font-size:2.2rem; }
        p { color:#566176; line-height:1.55; }
        .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:24px; }
        a,button { display:inline-block; padding:12px 17px; border:0; border-radius:10px;
          background:${config.color}; color:white; font:inherit; font-weight:800; text-decoration:none; cursor:pointer; }
        a.secondary,button.secondary { background:#e2e8f0; color:#24314d; }
        dl { display:grid; grid-template-columns:110px 1fr; gap:10px; padding:18px;
          border-radius:12px; background:#f1f5f9; }
        dt { font-weight:800; } dd { margin:0; overflow-wrap:anywhere; }
        form { display:inline; }
      </style>
    </head>
    <body><main><span class="eyebrow">${escapeHtml(config.name).toUpperCase()}</span>${content}</main></body>
  </html>`;
}

export function buildApplicationSessionData(
  config: ClientAppConfig,
): ApplicationSessionData {
  return {
    applicationName: config.name,
    role: config.sessionRole,
    theme: config.sessionTheme,
  };
}

export function renderDashboard(
  config: ClientAppConfig,
  user: Record<string, unknown>,
  application: ApplicationSessionData,
) {
  return page(
    config,
    `<h1>Signed in</h1>
     <p>This app has its own local session, backed by the central identity.</p>
     <h2>Verified identity</h2>
     <dl><dt>Name</dt><dd>${escapeHtml(user.name)}</dd>
     <dt>Email</dt><dd>${escapeHtml(user.email)}</dd>
     <dt>Subject</dt><dd>${escapeHtml(user.sub)}</dd></dl>
     <h2>Application session data</h2>
     <dl><dt>Application</dt><dd>${escapeHtml(application.applicationName)}</dd>
     <dt>Role</dt><dd>${escapeHtml(application.role)}</dd>
     <dt>Theme</dt><dd>${escapeHtml(application.theme)}</dd></dl>
     <div class="actions"><a href="${escapeHtml(config.otherAppUrl)}/dashboard">Open the other app</a>
     <form method="post" action="/auth/logout"><button class="secondary" type="submit">Log out everywhere</button></form></div>`,
  );
}

export function createClientApp(config: ClientAppConfig) {
  const app = express();
  let discovered: Promise<oidc.Configuration> | undefined;
  let verifyIdToken: IdTokenVerifier | undefined;

  const getOidcConfig = () => {
    discovered ??= oidc.discovery(
      new URL(config.issuer),
      config.clientId,
      { client_secret: config.clientSecret },
      oidc.ClientSecretBasic(config.clientSecret),
      { execute: [oidc.allowInsecureRequests] },
    );
    return discovered;
  };

  const getIdTokenVerifier = async () => {
    if (verifyIdToken) return verifyIdToken;

    const oidcConfig = await getOidcConfig();
    const metadata = oidcConfig.serverMetadata();
    if (!metadata.jwks_uri) {
      throw new Error("The provider discovery metadata has no jwks_uri");
    }

    verifyIdToken = createRemoteIdTokenVerifier(metadata.jwks_uri, {
      issuer: metadata.issuer,
      audience: config.clientId,
      algorithms: metadata.id_token_signing_alg_values_supported
        ? [...metadata.id_token_signing_alg_values_supported]
        : undefined,
    });
    return verifyIdToken;
  };

  app.use(
    session({
      name: `${config.name.toLowerCase().replaceAll(" ", "-")}.sid`,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 60 * 60 * 1000,
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  app.get("/", (req, res) => {
    if (req.session.user) {
      res.redirect("/dashboard");
      return;
    }
    res.type("html").send(
      page(
        config,
        `<h1>${escapeHtml(config.name)}</h1>
         <p>This Express server has no password database. It delegates login to the central Better Auth provider.</p>
         <div class="actions"><a href="/auth/login">Login with Better Auth</a>
         <a class="secondary" href="${escapeHtml(config.otherAppUrl)}/dashboard">Visit the other app</a></div>`,
      ),
    );
  });

  app.get("/auth/login", async (req, res, next) => {
    try {
      const oidcConfig = await getOidcConfig();
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const codeChallenge =
        await oidc.calculatePKCECodeChallenge(codeVerifier);
      const state = oidc.randomState();
      req.session.pkce = { codeVerifier, state };

      const authorizationUrl = oidc.buildAuthorizationUrl(oidcConfig, {
        redirect_uri: `${config.baseUrl}/auth/callback`,
        scope: "openid profile email",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
      });

      req.session.save((error) => {
        if (error) return next(error);
        res.redirect(authorizationUrl.href);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/auth/callback", async (req, res, next) => {
    try {
      const pkce = req.session.pkce;
      if (!pkce) {
        res.status(400).send("Login state expired. Start the login again.");
        return;
      }

      const oidcConfig = await getOidcConfig();
      const currentUrl = new URL(req.originalUrl, config.baseUrl);
      const tokens = await oidc.authorizationCodeGrant(
        oidcConfig,
        currentUrl,
        {
          pkceCodeVerifier: pkce.codeVerifier,
          expectedState: pkce.state,
        },
      );
      if (!tokens.id_token) {
        throw new Error("The provider returned no ID token");
      }
      const verify = await getIdTokenVerifier();
      const claims = await verify(tokens.id_token);

      req.session.user = { ...claims };
      req.session.application = buildApplicationSessionData(config);
      req.session.tokens = {
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
      };
      delete req.session.pkce;
      req.session.save((error) => {
        if (error) return next(error);
        res.redirect("/dashboard");
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
      res.redirect("/auth/login");
      return;
    }
    const user = req.session.user;
    const application =
      req.session.application ?? buildApplicationSessionData(config);
    req.session.application = application;
    res.type("html").send(renderDashboard(config, user, application));
  });

  app.post("/auth/logout", (_req, res) => {
    const logoutUrl = new URL("http://localhost:3000/global-logout");
    logoutUrl.searchParams.set("finish", `${config.baseUrl}/`);
    res.redirect(303, logoutUrl.href);
  });

  app.get("/auth/global-logout", (req, res, next) => {
    const allowedFinishes = [`${config.baseUrl}/`, `${config.otherAppUrl}/`];
    const finish = allowedFinishes.includes(String(req.query.finish))
      ? String(req.query.finish)
      : `${config.baseUrl}/`;
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie(
        `${config.name.toLowerCase().replaceAll(" ", "-")}.sid`,
      );
      if (config.globalLogoutNext) {
        const nextLogout = new URL(config.globalLogoutNext);
        nextLogout.searchParams.set("finish", finish);
        res.redirect(303, nextLogout.href);
        return;
      }
      res.redirect(303, finish);
    });
  });

  app.get("/health", (_req, res) => res.json({ ok: true, app: config.name }));

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Unexpected authentication error";
      res.status(500).type("html").send(
        page(
          config,
          `<h1>Authentication failed</h1><p>${escapeHtml(message)}</p>
           <div class="actions"><a href="/">Try again</a></div>`,
        ),
      );
    },
  );

  return app;
}
