import './tracing';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { multipartLimitMiddleware } from './common/uploads/multipart-limit.middleware';

/**
 * Fail-fast production checks – runs BEFORE the Nest app connects to the DB,
 * so a misconfigured deployment never half-boots.
 */
function assertProductionSafety(isProd: boolean, logger: Logger): void {
  if (!isProd) return;

  const required = ['BANKING_WEBHOOK_SECRET', 'PAYMENT_WEBHOOK_SECRET'];
  for (const key of required) {
    const value = process.env[key];
    if (!value || value.length < 32) {
      throw new Error(`${key} must be at least 32 characters in production`);
    }
  }

  // JWT: RS256 key pairs are the production default. HS256 stays blocked unless
  // the deployment explicitly opts in (short, auditable key-rotation window).
  const jwtAlgorithm = (process.env.JWT_ALGORITHM || '').toUpperCase();
  const hasRs256Keys = Boolean(
    process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY,
  );
  const usesRs256 =
    jwtAlgorithm === 'RS256' || (!jwtAlgorithm && hasRs256Keys);

  if (usesRs256) {
    if (!hasRs256Keys) {
      throw new Error(
        'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required when JWT_ALGORITHM=RS256',
      );
    }
  } else {
    if (process.env.JWT_ALLOW_HS256_IN_PRODUCTION !== 'true') {
      throw new Error(
        'HS256 is disabled in production – configure JWT_PRIVATE_KEY/JWT_PUBLIC_KEY (RS256) ' +
          'or set JWT_ALLOW_HS256_IN_PRODUCTION=true explicitly',
      );
    }
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'dev-secret-change-me' || secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    logger.warn(
      'HS256 explicitly allowed in production (JWT_ALLOW_HS256_IN_PRODUCTION=true) – plan RS256 migration',
    );
  }

  // Danger switches must never be enabled in production.
  const forbidden: Array<[string, string]> = [
    ['SKIP_STEP_UP', 'step-up verification must stay enabled'],
    ['ALLOW_MOCK_PAYMENTS', 'mock payment gateway must be disabled'],
  ];
  for (const [key, reason] of forbidden) {
    if (process.env[key] === 'true') {
      throw new Error(`${key} is not allowed in production: ${reason}`);
    }
  }

  if (!process.env.CORS_ORIGIN) {
    logger.warn('CORS_ORIGIN is not set – CORS is disabled in production');
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  assertProductionSafety(isProd, logger);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Graceful shutdown (SIGTERM/SIGINT) for containers/orchestrators.
  app.enableShutdownHooks();

  // Request body limits (default 1mb) – configurable per deployment.
  const bodyLimit = process.env.BODY_LIMIT || '1mb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });
  app.use(multipartLimitMiddleware());


  // Security headers (helmet). CSP is disabled outside production so the
  // Swagger UI at /api/docs keeps working; API responses still get the rest
  // of the helmet defaults (nosniff, frame-deny, HSTS, referrer policy…).
  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
    }),
  );

  // Only trust X-Forwarded-* when explicitly configured (proxy / load balancer).
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    const httpServer = app.getHttpAdapter().getInstance();
    httpServer.set('trust proxy', Number.isFinite(hops) && hops > 0 ? hops : 1);
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

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready'],
  });

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
