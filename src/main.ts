import './tracing';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';
  // P0/P1: refuse to boot in production with default secrets
  if (isProd) {
    const required = ['JWT_SECRET', 'BANKING_WEBHOOK_SECRET', 'PAYMENT_WEBHOOK_SECRET'];
    for (const key of required) {
      const v = process.env[key];
      if (!v || v.length < 32) {
        throw new Error(`${key} must be at least 32 characters in production`);
      }
    }
  }


  // Explicit CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || (isProd ? false : true),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  // Swagger only outside production
  if (!isProd) {
    const config = new DocumentBuilder()
      .setTitle('Business OS – Administration Center')
      .setDescription('Enterprise multi-tenant Administration Center API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Administration Center')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger UI enabled (non-production)');
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Business OS Multi-Tenant API running on :${port}`);
}

bootstrap();
