import { ConfigService } from '@/core/config/config.service';
import compression from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { AppModule } from './core/app/app.module';
import { GLOBAL_MAX_FILE_SIZE } from './modules/conversion/application/constants/file-size-limit';

async function bootstrap() {
  initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:5174',
      'http://localhost:4200',
      'http://localhost:8080',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  const configService = app.get(ConfigService);

  await app.register(fastifyCookie, {
    secret: configService.get('COOKIE_SECRET'),
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: GLOBAL_MAX_FILE_SIZE ?? 1024 * 1024,
    },
  });

  await app.register(compression);

  const config = new DocumentBuilder()
    .setTitle('Backend Training API')
    .setDescription(
      'REST API documentation for Backend Training project including Authentication, RBAC, Users Management, Settings, Health, and File Conversion services.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'bearer',
    )
    .addCookieAuth('access_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
      description: 'JWT access token (HttpOnly cookie)',
    })
    .addCookieAuth('refresh_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refresh_token',
      description: 'JWT refresh token (HttpOnly cookie)',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('api', app, document);

  const port = configService.get('PORT');

  await app.listen(port);
}

void bootstrap().catch((error: unknown) => {
  console.error('Application failed to start', error);
  process.exitCode = 1;
});
