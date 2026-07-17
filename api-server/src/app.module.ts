import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { JwtVerifyService } from "./jwt-verify.service";
import { NestJwtService } from "./nest-jwt.service";
import { TokenService } from "./token.service";

@Module({
  controllers: [AuthController],
  providers: [JwtVerifyService, NestJwtService, TokenService],
  exports: [JwtVerifyService, NestJwtService, TokenService],
})
export class AppModule {}
