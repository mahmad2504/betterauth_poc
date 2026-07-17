import { Injectable, OnModuleInit } from "@nestjs/common";
import type { JWTPayload } from "jose";

export type NestAccessClaims = {
  sub: string;
  email?: string;
  name?: string;
};

@Injectable()
export class NestJwtService implements OnModuleInit {
  private secret!: Uint8Array;
  private issuer = "";
  private audience = "";
  private expiresIn = "1h";
  private SignJWT!: typeof import("jose").SignJWT;
  private jwtVerify!: typeof import("jose").jwtVerify;
  private decodeJwt!: typeof import("jose").decodeJwt;

  async onModuleInit() {
    const jose = await import("jose");
    const secret =
      process.env.NEST_JWT_SECRET ??
      "local-api-server-jwt-secret-change-me-32+";
    this.secret = new TextEncoder().encode(secret);
    this.issuer =
      process.env.NEST_JWT_ISSUER ?? "http://localhost:3004";
    this.audience = process.env.NEST_JWT_AUDIENCE ?? "api-server";
    this.expiresIn = process.env.NEST_JWT_EXPIRES_IN ?? "1h";
    this.SignJWT = jose.SignJWT;
    this.jwtVerify = jose.jwtVerify;
    this.decodeJwt = jose.decodeJwt;
  }

  getIssuer() {
    return this.issuer;
  }

  peekIssuer(token: string): string | undefined {
    try {
      const payload = this.decodeJwt(token);
      return typeof payload.iss === "string" ? payload.iss : undefined;
    } catch {
      return undefined;
    }
  }

  isNestToken(token: string): boolean {
    return this.peekIssuer(token) === this.issuer;
  }

  async signAccessToken(claims: NestAccessClaims): Promise<{
    accessToken: string;
    expiresInSeconds: number;
  }> {
    const accessToken = await new this.SignJWT({
      email: claims.email,
      name: claims.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.secret);

    const payload = this.decodeJwt(accessToken);
    const now = Math.floor(Date.now() / 1000);
    const expiresInSeconds =
      typeof payload.exp === "number" ? Math.max(payload.exp - now, 0) : 3600;

    return { accessToken, expiresInSeconds };
  }

  async verifyAccessToken(token: string): Promise<JWTPayload> {
    const { payload } = await this.jwtVerify(token, this.secret, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ["HS256"],
    });
    return payload;
  }
}
