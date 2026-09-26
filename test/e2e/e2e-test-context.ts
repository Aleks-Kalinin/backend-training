import compression from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  initializeTransactionalContext,
  StorageDriver,
} from 'typeorm-transactional';
import { ConfigService } from '../../src/core/config/config.service';
import { AppModule } from '../../src/core/app/app.module';
import { CONVERSION_ENGINE } from '../../src/modules/conversion/application/ports/conversion-engine.port';
import { Grant } from '../../src/modules/rbac/infrastructure/entities/grant.entity';
import { Permission } from '../../src/modules/rbac/infrastructure/entities/permission.entity';
import { Role } from '../../src/modules/rbac/infrastructure/entities/role.entity';
import { SystemRole } from '../../src/modules/rbac/domain/system-role.enum';
import { SystemSetting } from '../../src/modules/settings/infrastructure/entity/system-setting.entity';
import { SETTING_KEYS } from '../../src/modules/settings/domain/settings.constants';
import { User } from '../../src/modules/users/infrastructure/entity/user.entity';
import { UserStatus } from '../../src/modules/users/domain/user-status.enum';
import { MailService } from '../../src/modules/mail/application/mail.service';

export interface TestUsers {
  admin: User;
  user: User;
}

export interface E2eTestContext {
  readonly app: NestFastifyApplication;
  readonly dataSource: DataSource;
  readonly jwtService: JwtService;
  readonly testUsers: TestUsers;
  readonly sentOtps: Array<{ email: string; otp: string }>;
  asAdmin(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
  ): request.Test;
  asUser(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
  ): request.Test;
  cookieText(response: request.Response): string;
}

const PERMISSION_ACTIONS: Record<string, string[]> = {
  roles: ['create', 'read', 'update', 'delete'],
  permissions: ['create', 'read', 'update', 'delete'],
  grants: ['create', 'read', 'update', 'delete'],
  users: ['create', 'read', 'update', 'delete'],
  settings: ['read', 'update'],
  files: ['create', 'read'],
  history: ['read'],
};

export function createE2eTestContext(): E2eTestContext {
  let app: NestFastifyApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let testUsers: TestUsers;
  const sentOtps: Array<{ email: string; otp: string }> = [];
  const sendVerificationOtp = jest.fn(
    async (email: string, otp: string): Promise<void> => {
      sentOtps.push({ email, otp });
    },
  );

  async function clearDatabase(): Promise<void> {
    const tables: Array<{ tablename: string }> = await dataSource.query(
      `SELECT tablename
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename <> $1`,
      ['migrations'],
    );

    if (tables.length === 0) {
      return;
    }

    const tableNames = tables
      .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
      .join(', ');

    await dataSource.query(
      `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`,
    );
  }

  async function seedDatabase(): Promise<void> {
    await clearDatabase();

    const roles = dataSource.getRepository(Role);
    const adminRole = await roles.save(
      roles.create({
        name: SystemRole.ADMIN,
        description: 'E2E administrator',
      }),
    );
    const userRole = await roles.save(
      roles.create({
        name: SystemRole.USER,
        description: 'E2E user',
      }),
    );

    const permissions = dataSource.getRepository(Permission);
    const savedPermissions = await permissions.save(
      Object.entries(PERMISSION_ACTIONS).map(([name, actions]) =>
        permissions.create({ name, actions }),
      ),
    );

    const grants = dataSource.getRepository(Grant);
    await grants.save(
      savedPermissions.map((permission) =>
        grants.create({
          roleId: adminRole.id,
          permissionId: permission.id,
          role: adminRole,
          permission,
          actions: PERMISSION_ACTIONS[permission.name],
        }),
      ),
    );

    await dataSource.getRepository(SystemSetting).save([
      { key: SETTING_KEYS.REGISTRATION_VERIFICATION, value: false },
      { key: SETTING_KEYS.PASSWORD_RESET_VERIFICATION, value: false },
      { key: SETTING_KEYS.LOGIN_VERIFICATION, value: false },
    ]);

    const users = dataSource.getRepository(User);
    const [admin, user] = await users.save([
      users.create({
        email: 'admin@example.test',
        password: 'unused-test-password',
        status: UserStatus.ACTIVE,
        isVerified: true,
        photo: null,
        roles: [adminRole],
      }),
      users.create({
        email: 'user@example.test',
        password: 'unused-test-password',
        status: UserStatus.ACTIVE,
        isVerified: true,
        photo: null,
        roles: [userRole],
      }),
    ]);

    testUsers = { admin, user };
    await app.get(EventEmitter2).emitAsync('rbac.changed');
  }

  function makeToken(user: User): string {
    return jwtService.sign({
      sub: user.userId,
      email: user.email,
      roles: user.roles.map((role) => role.name),
    });
  }

  function asAdmin(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
  ): request.Test {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', `access_token=${makeToken(testUsers.admin)}`);
  }

  function asUser(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
  ): request.Test {
    return request(app.getHttpServer())
      [method](path)
      .set('Cookie', `access_token=${makeToken(testUsers.user)}`);
  }

  beforeAll(async () => {
    initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CONVERSION_ENGINE)
      .useValue({
        convertText: async (
          buffer: Buffer,
          sourceFormat: string,
          targetFormat: string,
        ) => {
          if (sourceFormat !== 'csv' || targetFormat !== 'json') {
            throw new Error('Unsupported test conversion');
          }

          const records = parseCsv(buffer, {
            columns: true,
            skip_empty_lines: true,
          });
          return JSON.stringify(records, null, 2);
        },
        convertImage: async () => Buffer.from('converted-image'),
        close: async () => undefined,
      })
      .overrideProvider(MailService)
      .useValue({ sendVerificationOtp })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);

    const config = app.get(ConfigService);
    await app.register(fastifyHelmet, { contentSecurityPolicy: false });
    await app.register(fastifyCookie, {
      secret: config.get('COOKIE_SECRET'),
    });
    await app.register(fastifyMultipart);
    await app.register(compression);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(async () => {
    sendVerificationOtp.mockClear();
    sentOtps.length = 0;
    await seedDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    try {
      if (dataSource?.isInitialized) {
        await clearDatabase();
      }
    } finally {
      await app?.close();
    }
  });

  return {
    get app() {
      return app;
    },
    get dataSource() {
      return dataSource;
    },
    get jwtService() {
      return jwtService;
    },
    get testUsers() {
      return testUsers;
    },
    sentOtps,
    asAdmin,
    asUser,
    cookieText(response) {
      const cookies = response.headers['set-cookie'];
      return Array.isArray(cookies) ? cookies.join(';') : (cookies ?? '');
    },
  };
}
