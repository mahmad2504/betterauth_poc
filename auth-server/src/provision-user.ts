import { auth, authBaseUrl } from "./auth.js";

const genericSetupMessage =
  "If this email exists in our system, check your inbox for a password setup link.";

export async function sendSetupEmailForUser(email: string) {
  await auth.api.requestPasswordReset({
    body: {
      email,
      redirectTo: `${authBaseUrl}/set-password`,
    },
  });
}

export async function provisionPendingUser(input: {
  name: string;
  email: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();

  try {
    await auth.api.createUser({
      body: {
        name: input.name.trim(),
        email: normalizedEmail,
        data: {
          accountStatus: "pending",
        },
      },
    });
  } catch {
    // Return a generic response for existing users to avoid account enumeration.
  }

  await sendSetupEmailForUser(normalizedEmail);
  return { message: genericSetupMessage };
}
