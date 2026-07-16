import { auth, authBaseUrl, dbPool } from "./auth.js";

const genericSetupMessage =
  "If this email exists in our system, check your inbox for a password setup link.";

export class ProvisionError extends Error {
  constructor(
    message: string,
    public code: "USER_EXISTS" | "EMAIL_FAILED" | "CREATE_FAILED",
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

export async function sendSetupEmailForUser(email: string) {
  await auth.api.requestPasswordReset({
    body: {
      email,
      redirectTo: `${authBaseUrl}/set-password`,
    },
  });
}

async function emailAlreadyExists(email: string) {
  const [rows] = await dbPool.execute(
    "SELECT id FROM user WHERE email = ? LIMIT 1",
    [email],
  );
  return Array.isArray(rows) && rows.length > 0;
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

/** Admin create: fails if the email already exists, then sends setup email. */
export async function createPendingUserByAdmin(input: {
  name: string;
  email: string;
}) {
  const name = input.name.trim();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (await emailAlreadyExists(normalizedEmail)) {
    throw new ProvisionError(
      "An account with this email already exists.",
      "USER_EXISTS",
    );
  }

  try {
    await auth.api.createUser({
      body: {
        name,
        email: normalizedEmail,
        data: {
          accountStatus: "pending",
        },
      },
    });
  } catch (error) {
    if (await emailAlreadyExists(normalizedEmail)) {
      throw new ProvisionError(
        "An account with this email already exists.",
        "USER_EXISTS",
      );
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    throw new ProvisionError(
      `Could not create account: ${detail}`,
      "CREATE_FAILED",
    );
  }

  try {
    await sendSetupEmailForUser(normalizedEmail);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    throw new ProvisionError(
      `Account created, but setup email failed: ${detail}`,
      "EMAIL_FAILED",
    );
  }

  return {
    email: normalizedEmail,
    message: `Account created for ${normalizedEmail}. Password setup email sent.`,
  };
}
