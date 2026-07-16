import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const requestPasswordReset = vi.fn();
const execute = vi.fn();

vi.mock("../src/auth.js", () => ({
  authBaseUrl: "http://localhost:3000",
  auth: {
    api: {
      createUser,
      requestPasswordReset,
    },
  },
  dbPool: {
    execute,
  },
}));

describe("provisionPendingUser", () => {
  beforeEach(() => {
    createUser.mockReset();
    requestPasswordReset.mockReset();
    execute.mockReset();
  });

  it("creates a pending account and sends a setup link", async () => {
    const { provisionPendingUser } = await import("../src/provision-user.js");

    const result = await provisionPendingUser({
      name: "Alice",
      email: " ALICE@Example.com ",
    });

    expect(createUser).toHaveBeenCalledWith({
      body: {
        name: "Alice",
        email: "alice@example.com",
        data: { accountStatus: "pending" },
      },
    });
    expect(requestPasswordReset).toHaveBeenCalledWith({
      body: {
        email: "alice@example.com",
        redirectTo: "http://localhost:3000/set-password",
      },
    });
    expect(result.message).toContain("check your inbox");
  });

  it("still returns generic success when user already exists", async () => {
    createUser.mockRejectedValueOnce(new Error("duplicate user"));
    const { provisionPendingUser } = await import("../src/provision-user.js");

    const result = await provisionPendingUser({
      name: "Alice",
      email: "alice@example.com",
    });

    expect(requestPasswordReset).toHaveBeenCalledOnce();
    expect(result.message).toContain("check your inbox");
  });
});

describe("createPendingUserByAdmin", () => {
  beforeEach(() => {
    createUser.mockReset();
    requestPasswordReset.mockReset();
    execute.mockReset();
    execute.mockResolvedValue([[]]);
  });

  it("creates a pending account and sends setup email", async () => {
    const { createPendingUserByAdmin } = await import(
      "../src/provision-user.js"
    );

    const result = await createPendingUserByAdmin({
      name: "Bob",
      email: " BOB@Example.com ",
    });

    expect(createUser).toHaveBeenCalledWith({
      body: {
        name: "Bob",
        email: "bob@example.com",
        data: { accountStatus: "pending" },
      },
    });
    expect(requestPasswordReset).toHaveBeenCalledWith({
      body: {
        email: "bob@example.com",
        redirectTo: "http://localhost:3000/set-password",
      },
    });
    expect(result.message).toContain("Password setup email sent");
  });

  it("errors when the email already exists", async () => {
    execute.mockResolvedValueOnce([[{ id: "existing" }]]);
    const { createPendingUserByAdmin, ProvisionError } = await import(
      "../src/provision-user.js"
    );

    await expect(
      createPendingUserByAdmin({
        name: "Bob",
        email: "bob@example.com",
      }),
    ).rejects.toMatchObject({
      code: "USER_EXISTS",
      message: "An account with this email already exists.",
    });
    expect(createUser).not.toHaveBeenCalled();
    expect(ProvisionError).toBeDefined();
  });
});
