import { createAuthClient } from "better-auth/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [oauthProviderClient()],
});

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
  return `${window.location.pathname}${window.location.search}` || "/";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!submit) return;

  submit.disabled = true;
  showMessage("Working…", false);

  const data = new FormData(form);
  const email = String(data.get("email") ?? "");
  const password = String(data.get("password") ?? "");
  const mode = form.dataset.authForm;

  try {
    const result =
      mode === "signup"
        ? await authClient.signUp.email({
            name: String(data.get("name") ?? ""),
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      showMessage(result.error.message ?? "Authentication failed.");
      return;
    }

    const destination =
      result.data && "url" in result.data
        ? String(result.data.url)
        : window.location.origin;
    window.location.assign(destination);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Authentication failed.");
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
      }
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Social sign-in failed.",
      );
      button.disabled = false;
    }
  });
}
