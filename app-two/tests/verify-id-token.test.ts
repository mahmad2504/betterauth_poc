import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createIdTokenVerifier } from "../src/verify-id-token.js";

const issuer = "http://localhost:3000/api/auth";
const audience = "application-two-client";
let privateKey: CryptoKey;
let verify: ReturnType<typeof createIdTokenVerifier>;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  const publicJwk = await exportJWK(keys.publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";
  verify = createIdTokenVerifier(
    createLocalJWKSet({ keys: [publicJwk] }),
    { issuer, audience, algorithms: ["RS256"] },
  );
});

async function signToken(options?: {
  tokenIssuer?: string;
  tokenAudience?: string;
  expiresAt?: number;
}) {
  return new SignJWT({ name: "Demo User", email: "demo@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject("user-123")
    .setIssuer(options?.tokenIssuer ?? issuer)
    .setAudience(options?.tokenAudience ?? audience)
    .setIssuedAt()
    .setExpirationTime(
      options?.expiresAt ?? Math.floor(Date.now() / 1000) + 300,
    )
    .sign(privateKey);
}

describe("explicit ID token verification", () => {
  it("accepts a correctly signed token and returns verified claims", async () => {
    const payload = await verify(await signToken());
    expect(payload.sub).toBe("user-123");
    expect(payload.email).toBe("demo@example.com");
  });

  it("rejects a token issued for another OAuth client", async () => {
    await expect(
      verify(await signToken({ tokenAudience: "different-client" })),
    ).rejects.toThrow();
  });

  it("rejects an expired ID token", async () => {
    await expect(
      verify(
        await signToken({
          expiresAt: Math.floor(Date.now() / 1000) - 10,
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a missing ID token", async () => {
    await expect(verify("")).rejects.toThrow("no ID token");
  });
});
