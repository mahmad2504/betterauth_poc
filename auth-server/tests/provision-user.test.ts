import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const requestPasswordReset = vi.fn();

vi.mock("../src/auth.js", () => ({
  authBaseUrl: "http://localhost:3000",
  auth: {
    api: {
      createUser,
      requestPasswordReset,
    },
  },
}));

describe("provisionPendingUser", () => {
  beforeEach(() => {
    createUser.mockReset();
    requestPasswordReset.mockReset();
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
