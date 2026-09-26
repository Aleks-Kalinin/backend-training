import { ConfigService } from '../src/core/config/config.service';
import { SETTING_KEYS } from '../src/modules/settings/domain/settings.constants';
import { SystemSetting } from '../src/modules/settings/infrastructure/entity/system-setting.entity';
import { User } from '../src/modules/users/infrastructure/entity/user.entity';
import { UserStatus } from '../src/modules/users/domain/user-status.enum';
import { SystemRole } from '../src/modules/rbac/domain/system-role.enum';
import request from 'supertest';
import { createE2eTestContext } from './e2e/e2e-test-context';

describe('Authentication HTTP e2e', () => {
  const context = createE2eTestContext();

  it('signs up and logs in with secure authentication cookies', async () => {
    const signup = await request(context.app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'NewUser@Example.test', password: 'Password123' })
      .expect(201);

    expect(signup.body).toEqual({
      message: 'Registration successful',
      user: {
        id: expect.any(String),
        email: 'newuser@example.test',
      },
    });
    expect(context.cookieText(signup)).toContain('access_token=');
    expect(context.cookieText(signup)).toContain('refresh_token=');
    expect(context.cookieText(signup)).toContain('HttpOnly');
    expect(context.cookieText(signup)).toContain('Secure');

    await request(context.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'NEWUSER@example.test', password: 'Password123' })
      .expect(200)
      .expect((response) => {
        expect(context.cookieText(response)).toContain('access_token=');
      });
  });

  it('validates signup data and rejects duplicate accounts and bad credentials', async () => {
    await request(context.app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);

    await request(context.app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'admin@example.test', password: 'Password123' })
      .expect(409);

    await request(context.app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.test', password: 'wrong-password' })
      .expect(401);
  });

  it('requires and verifies an OTP when registration verification is enabled', async () => {
    await context.dataSource.getRepository(SystemSetting).save({
      key: SETTING_KEYS.REGISTRATION_VERIFICATION,
      value: true,
    });

    const signup = await request(context.app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'pending@example.test', password: 'Password123' })
      .expect(202);

    expect(signup.body).toMatchObject({
      verificationRequired: true,
      attemptId: expect.any(String),
    });
    expect(context.sentOtps).toHaveLength(1);

    const verified = await request(context.app.getHttpServer())
      .post('/auth/signup/verify')
      .send({ attemptId: signup.body.attemptId, otp: context.sentOtps[0].otp })
      .expect(200);

    expect(context.cookieText(verified)).toContain('access_token=');
    const createdUser = await context.dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'pending@example.test' });
    expect(createdUser.status).toBe(UserStatus.ACTIVE);
    expect(createdUser.isVerified).toBe(true);
  });

  it('refreshes valid tokens and clears authentication cookies on logout', async () => {
    const refreshToken = await context.jwtService.signAsync(
      {
        sub: context.testUsers.admin.userId,
        email: context.testUsers.admin.email,
        roles: [SystemRole.ADMIN],
      },
      {
        secret: context.app.get(ConfigService).get('JWT_REFRESH_SECRET'),
        expiresIn: '1h',
      },
    );

    const refreshed = await request(context.app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', `refresh_token=${refreshToken}`)
      .expect(200);
    expect(context.cookieText(refreshed)).toContain('access_token=');

    await request(context.app.getHttpServer())
      .post('/auth/refresh')
      .expect(401);

    const loggedOut = await request(context.app.getHttpServer())
      .post('/auth/logout')
      .expect(200);
    expect(loggedOut.body.message).toBe('Logged out successfully');
    expect(context.cookieText(loggedOut)).toContain('access_token=;');
  });
});
