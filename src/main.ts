import { ConfigService } from '@/core/config/config.service';
import compression from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import {
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { AppModule } from './core/app/app.module';
import { configureApiRouting } from './core/api-routing';
import { configureSwagger } from './core/swagger';
import { GLOBAL_MAX_FILE_SIZE } from './modules/conversion/application/constants/file-size-limit';

async function bootstrap() {
  initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  configureApiRouting(app);

  await app.register(fastifyHelmet, {
    // Nest Swagger UI uses an inline bootstrap script.
    contentSecurityPolicy: false,
  });

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

  configureSwagger(app);

  const port = configService.get('PORT');

  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error('Application failed to start', error);
  process.exitCode = 1;
});
