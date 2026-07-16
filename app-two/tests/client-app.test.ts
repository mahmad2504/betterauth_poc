import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  createClientApp,
  renderDashboard,
} from "../src/create-client-app.js";

const config = {
  name: "Test App",
  color: "#7c3aed",
  baseUrl: "http://localhost:3992",
  otherAppUrl: "http://localhost:3991",
  issuer: "http://localhost:3990/api/auth",
  clientId: "test-client",
  clientSecret: "test-secret",
  sessionSecret: "test-session-secret-with-enough-characters",
  sessionRole: "operations-editor",
  sessionTheme: "violet",
};
const app = createClientApp(config);

describe("client app local routes", () => {
  it("renders a login link for a signed-out visitor", async () => {
    const response = await request(app).get("/");
    expect(response.status).toBe(200);
    expect(response.text).toContain("Login with Better Auth");
  });

  it("protects the dashboard with the local session", async () => {
    const response = await request(app).get("/dashboard");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/auth/login");
  });

  it("renders application-specific session data on the dashboard", () => {
    const html = renderDashboard(
      config,
      { name: "Demo User", email: "demo@example.com", sub: "user-123" },
      {
        applicationName: "Test App",
        role: "operations-editor",
        theme: "violet",
      },
    );
    expect(html).toContain("Application session data");
    expect(html).toContain("operations-editor");
    expect(html).toContain("violet");
  });

  it("rejects a callback without saved PKCE state", async () => {
    const response = await request(app).get("/auth/callback?code=fake");
    expect(response.status).toBe(400);
    expect(response.text).toContain("Login state expired");
  });

  it("starts a global logout at the identity provider", async () => {
    const response = await request(app).post("/auth/logout");
    expect(response.status).toBe(303);
    expect(response.headers.location).toContain(
      "http://localhost:3000/global-logout",
    );
  });

  it("clears its local session during the logout chain", async () => {
    const response = await request(app).get(
      "/auth/global-logout?finish=http://localhost:3992/",
    );
    expect(response.status).toBe(303);
    expect(response.headers.location).toBe("http://localhost:3992/");
  });
});
