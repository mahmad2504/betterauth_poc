import { Injectable, OnModuleInit } from "@nestjs/common";
import type { JWTPayload, JWTVerifyGetKey } from "jose";

@Injectable()
export class JwtVerifyService implements OnModuleInit {
  private jwks!: JWTVerifyGetKey;
  private jwtVerify!: typeof import("jose").jwtVerify;
  private issuer = "";
  private audiences: string[] = [];

  async onModuleInit() {
    const jose = await import("jose");
    const jwksUrl =
      process.env.JWKS_URL ?? "http://localhost:3000/api/auth/jwks";
    this.issuer =
      process.env.BETTER_AUTH_ISSUER ?? "http://localhost:3000/api/auth";
    this.audiences = [
      process.env.APP_ONE_OIDC_CLIENT_ID,
      process.env.APP_TWO_OIDC_CLIENT_ID,
      process.env.APP_SPA_OIDC_CLIENT_ID,
    ].filter((value): value is string => Boolean(value?.trim()));

    this.jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
    this.jwtVerify = jose.jwtVerify;
  }

  async verifyIdToken(token: string): Promise<JWTPayload> {
    if (this.audiences.length === 0) {
      throw new Error(
        "No OIDC audiences configured. Run auth-server bootstrap first.",
      );
    }

    const { payload } = await this.jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audiences,
      algorithms: ["EdDSA"],
    });
    return payload;
  }
}
