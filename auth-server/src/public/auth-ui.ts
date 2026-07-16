import { createAuthClient } from "better-auth/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

declare global {
  interface Window {
    __GOOGLE_SIGN_IN_ENABLED__?: boolean;
  }
}

const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [oauthProviderClient()],
});

if (window.__GOOGLE_SIGN_IN_ENABLED__) {
  for (const el of document.querySelectorAll<HTMLElement>(
    "[data-google-sign-in]",
  )) {
    el.hidden = false;
  }
}

const form = document.querySelector<HTMLFormElement>("[data-auth-form]");
const message = document.querySelector<HTMLElement>("[data-message]");
const submit = document.querySelector<HTMLButtonElement>("button[type=submit]");

for (const link of document.querySelectorAll<HTMLAnchorElement>(
  "[data-preserve-query]",
)) {
  link.href = `${link.pathname}${window.location.search}`;
}

function showMessage(text: string, isError = true) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.hidden = false;
}

function currentCallbackURL() {
  const url = new URL(window.location.href);
  // Don't carry OAuth error query params into the post-login return URL.
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  const pathAndQuery = `${url.pathname}${url.search}`;
  return pathAndQuery === "/" ? "/" : pathAndQuery || "/";
}

function getMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

const oauthErrorMessages: Record<string, string> = {
  signup_disabled:
    "No account exists for this Google email. Sign up with email first, then set your password.",
  account_not_linked:
    "This Google account is not linked to an existing user. Sign up with email first.",
  access_denied: "Google sign-in was cancelled.",
  oauth_provider_not_found: "Google sign-in is not configured.",
  invalid_code:
    "Google sign-in failed while exchanging the auth code. Restart auth-server (it uses Node --use-system-ca) and confirm the Google redirect URI is http://localhost:3000/api/auth/callback/google.",
  dormant_account:
    "Complete password setup from your email before signing in with Google.",
};

const oauthError = new URLSearchParams(window.location.search).get("error");
if (oauthError) {
  showMessage(
    oauthErrorMessages[oauthError] ??
      `Sign-in failed (${oauthError.replaceAll("_", " ")}).`,
  );
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!submit) return;

  submit.disabled = true;
  showMessage("Working…", false);

  const data = new FormData(form);
  const mode = form.dataset.authForm;

  try {
    if (mode === "signup") {
      const response = await fetch("/api/auth/sign-up/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (!response.ok) {
        showMessage(body?.message ?? "Could not create account.");
        return;
      }
      showMessage(
        body?.message ??
          "Check your email for a password setup link before signing in.",
        false,
      );
      form.reset();
      return;
    }

    if (mode === "set-password") {
      const password = String(data.get("password") ?? "");
      const confirmPassword = String(data.get("confirmPassword") ?? "");
      if (password !== confirmPassword) {
        showMessage("Passwords do not match.");
        return;
      }

      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) {
        showMessage("Invalid or expired setup link.");
        return;
      }

      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        showMessage(result.error.message ?? "Could not set password.");
        return;
      }

      showMessage("Password saved. Redirecting to sign in…", false);
      window.setTimeout(() => {
        window.location.assign("/sign-in");
      }, 800);
      return;
    }

    const callbackURL =
      new URLSearchParams(window.location.search).get("callbackURL") ||
      undefined;

    const result = await authClient.signIn.email({
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      ...(callbackURL ? { callbackURL } : {}),
    });
    if (result.error) {
      showMessage(result.error.message ?? "Authentication failed.");
      return;
    }
    const destination =
      callbackURL ||
      (result.data && "url" in result.data
        ? String(result.data.url)
        : window.location.origin);
    window.location.assign(destination);
  } catch (error) {
    showMessage(getMessage(error, "Authentication failed."));
  } finally {
    submit.disabled = false;
  }
});

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-social]",
)) {
  button.addEventListener("click", async () => {
    const provider = button.dataset.social;
    if (!provider) return;

    button.disabled = true;
    showMessage("Redirecting to Google…", false);

    try {
      const result = await authClient.signIn.social({
        provider: provider as "google",
        callbackURL: currentCallbackURL(),
      });

      if (result.error) {
        showMessage(result.error.message ?? "Social sign-in failed.");
        button.disabled = false;
        return;
      }

      const destination =
        result.data && "url" in result.data && result.data.url
          ? String(result.data.url)
          : null;
      if (destination) {
        window.location.assign(destination);
        return;
      }

      showMessage("Social sign-in failed.");
      button.disabled = false;
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Social sign-in failed.",
      );
      button.disabled = false;
    }
  });
}
