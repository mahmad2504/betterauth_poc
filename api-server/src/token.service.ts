import { Injectable, Inject } from "@nestjs/common";
import type { JWTPayload } from "jose";
import { JwtVerifyService } from "./jwt-verify.service";
import { NestJwtService } from "./nest-jwt.service";

export type VerifiedTokenResult = {
  ok: true;
  source: "api-server" | "better-auth";
  sub?: string;
  email?: unknown;
  name?: unknown;
  aud?: unknown;
  iss?: unknown;
  exp?: unknown;
};

export type ExchangeTokenResult = {
  ok: true;
  exchanged: boolean;
  source: "api-server" | "better-auth";
  accessToken?: string;
  tokenType?: "Bearer";
  expiresIn?: number;
  user: {
    sub?: string;
    email?: unknown;
    name?: unknown;
  };
};

@Injectable()
export class TokenService {
  constructor(
    @Inject(JwtVerifyService) private readonly oidc: JwtVerifyService,
    @Inject(NestJwtService) private readonly nestJwt: NestJwtService,
  ) {}

  private pickUser(claims: JWTPayload) {
    return {
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
      aud: claims.aud,
      iss: claims.iss,
      exp: claims.exp,
    };
  }

  async verifyAny(token: string): Promise<VerifiedTokenResult> {
    if (this.nestJwt.isNestToken(token)) {
      const claims = await this.nestJwt.verifyAccessToken(token);
      return { ok: true, source: "api-server", ...this.pickUser(claims) };
    }

    const claims = await this.oidc.verifyIdToken(token);
    return { ok: true, source: "better-auth", ...this.pickUser(claims) };
  }

  async exchangeOrAccept(token: string): Promise<ExchangeTokenResult> {
    if (this.nestJwt.isNestToken(token)) {
      const claims = await this.nestJwt.verifyAccessToken(token);
      return {
        ok: true,
        exchanged: false,
        source: "api-server",
        user: {
          sub: claims.sub,
          email: claims.email,
          name: claims.name,
        },
      };
    }

    const ba = await this.oidc.verifyIdToken(token);
    if (!ba.sub) {
      throw new Error("Better Auth ID token is missing sub");
    }

    const minted = await this.nestJwt.signAccessToken({
      sub: ba.sub,
      email: typeof ba.email === "string" ? ba.email : undefined,
      name: typeof ba.name === "string" ? ba.name : undefined,
    });

    return {
      ok: true,
      exchanged: true,
      source: "better-auth",
      accessToken: minted.accessToken,
      tokenType: "Bearer",
      expiresIn: minted.expiresInSeconds,
      user: {
        sub: ba.sub,
        email: ba.email,
        name: ba.name,
      },
    };
  }
}
