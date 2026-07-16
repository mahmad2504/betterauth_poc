import { createAuthClient } from "better-auth/client";
import { adminClient } from "better-auth/client/plugins";

const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [adminClient()],
});

const statusEl = document.querySelector<HTMLElement>("[data-admin-status]");
const gateEl = document.querySelector<HTMLElement>("[data-admin-gate]");
const panelEl = document.querySelector<HTMLElement>("[data-admin-panel]");
const whoEl = document.querySelector<HTMLElement>("[data-admin-who]");
const form = document.querySelector<HTMLFormElement>("[data-admin-create]");
const message = document.querySelector<HTMLElement>("[data-message]");
const submit = form?.querySelector<HTMLButtonElement>("button[type=submit]");
const signOutBtn = document.querySelector<HTMLButtonElement>("[data-admin-sign-out]");

function showMessage(text: string, isError = true) {
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.hidden = false;
}

async function requireAdmin() {
  const { data: session } = await authClient.getSession();
  const user = session?.user as
    | { name?: string; email?: string; role?: string | null }
    | undefined;

  const roles = (user?.role ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const isAdmin = roles.includes("admin");

  if (!user) {
    if (statusEl) statusEl.hidden = true;
    if (gateEl) gateEl.hidden = false;
    return null;
  }

  if (!isAdmin) {
    if (statusEl) {
      statusEl.textContent =
        "Signed in, but this account is not an admin. Sign out, then sign in as oauth-bootstrap@local.test (or re-run npm run bootstrap).";
      statusEl.classList.add("message", "error");
    }
    if (gateEl) gateEl.hidden = false;
    return null;
  }

  if (statusEl) statusEl.hidden = true;
  if (panelEl) panelEl.hidden = false;
  if (whoEl) {
    whoEl.textContent = `Signed in as ${user.name ?? user.email} (admin)`;
  }
  return user;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!submit || !form) return;

  submit.disabled = true;
  showMessage("Creating account…", false);

  const data = new FormData(form);
  try {
    const response = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      code?: string;
    } | null;

    if (!response.ok) {
      showMessage(body?.message ?? "Could not create account.");
      return;
    }

    showMessage(body?.message ?? "Account created and setup email sent.", false);
    form.reset();
  } catch {
    showMessage("Could not create account.");
  } finally {
    submit.disabled = false;
  }
});

signOutBtn?.addEventListener("click", async () => {
  await authClient.signOut();
  window.location.assign("/sign-in?callbackURL=/admin");
});

void requireAdmin();
