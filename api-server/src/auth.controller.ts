import {
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { TokenService } from "./token.service";

@Controller()
export class AuthController {
  constructor(@Inject(TokenService) private readonly tokens: TokenService) {}

  @Get("health")
  health() {
    return { ok: true, app: "api-server" };
  }

  /**
   * Dual verify: Nest-issued JWT or Better Auth OIDC ID token.
   */
  @Post("auth/verify")
  async verify(@Headers("authorization") authorization?: string) {
    const token = this.bearer(authorization);
    try {
      return await this.tokens.verifyAny(token);
    } catch (error) {
      throw this.asUnauthorized(error);
    }
  }

  /**
   * Test/exchange API:
   * - Nest JWT → accept
   * - Better Auth ID token → verify then replace with Nest JWT
   */
  @Post("auth/exchange")
  async exchange(@Headers("authorization") authorization?: string) {
    const token = this.bearer(authorization);
    try {
      return await this.tokens.exchangeOrAccept(token);
    } catch (error) {
      throw this.asUnauthorized(error);
    }
  }

  /**
   * Demo protected resource that runs the same exchange-or-accept logic.
   */
  @Get("demo/profile")
  async profile(@Headers("authorization") authorization?: string) {
    const token = this.bearer(authorization);
    try {
      const result = await this.tokens.exchangeOrAccept(token);
      return {
        ...result,
        message: result.exchanged
          ? "Better Auth token accepted and replaced with api-server JWT"
          : "api-server JWT accepted",
      };
    } catch (error) {
      throw this.asUnauthorized(error);
    }
  }

  private bearer(authorization?: string) {
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    if (!token) {
      throw new UnauthorizedException(
        "Expected Authorization: Bearer <jwt>",
      );
    }
    return token;
  }

  private asUnauthorized(error: unknown) {
    const message =
      error instanceof Error ? error.message : "Token verification failed";
    return new UnauthorizedException(message);
  }
}
