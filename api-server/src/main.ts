import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origins = (process.env.CORS_ORIGINS ??
    "http://localhost:3001,http://localhost:3002,http://localhost:3003")
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
  });

  const port = Number(process.env.PORT ?? 3004);
  await app.listen(port);
  console.log(`api-server listening on http://localhost:${port}`);
}

bootstrap();
