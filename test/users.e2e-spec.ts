import request from 'supertest';
import { createE2eTestContext } from './e2e/e2e-test-context';
import { User } from '../src/modules/users/infrastructure/entity/user.entity';
import { UserStatus } from '../src/modules/users/domain/user-status.enum';
import { UserDeletionJob } from '../src/modules/users/infrastructure/entity/user-deletion-job.entity';

describe('Users HTTP e2e', () => {
  const context = createE2eTestContext();

  it('requires authentication and returns a user profile to its owner', async () => {
    await request(context.app.getHttpServer())
      .get(`/users/${context.testUsers.user.userId}`)
      .expect(401);

    const profile = await context
      .asUser('get', `/users/${context.testUsers.user.userId}`)
      .expect(200);
    expect(profile.body).toMatchObject({
      userId: context.testUsers.user.userId,
      email: context.testUsers.user.email,
    });
    expect(profile.body.password).toBeUndefined();
  });

  it('lists and creates users with admin permissions, and rejects invalid input', async () => {
    const list = await context
      .asAdmin('get', '/admin/users?limit=10')
      .expect(200);
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'admin@example.test' }),
        expect.objectContaining({ email: 'user@example.test' }),
      ]),
    );
    expect(list.body.nextCursor).toBeNull();

    await context
      .asUser('post', '/users')
      .send({
        email: 'blocked@example.test',
        password: 'Password123',
        isVerified: true,
      })
      .expect(403);

    await context
      .asAdmin('post', '/users')
      .send({ email: 'bad-email', password: 'short', isVerified: true })
      .expect(400);

    const created = await context
      .asAdmin('post', '/users')
      .send({
        email: 'created@example.test',
        password: 'Password123',
        isVerified: true,
        status: UserStatus.ACTIVE,
      })
      .expect(201);
    expect(created.body.email).toBe('created@example.test');
    expect(
      await context.dataSource
        .getRepository(User)
        .exist({ where: { email: 'created@example.test' } }),
    ).toBe(true);
  });

  it('updates a user profile and prevents direct self-service email changes', async () => {
    await context
      .asUser('patch', `/users/${context.testUsers.user.userId}`)
      .send({ photo: 'https://example.test/avatar.png' })
      .expect(200);
    const updatedUser = await context.dataSource
      .getRepository(User)
      .findOneByOrFail({ userId: context.testUsers.user.userId });
    expect(updatedUser.photo).toBe('https://example.test/avatar.png');

    await context
      .asUser('patch', `/users/${context.testUsers.user.userId}`)
      .send({ email: 'changed@example.test' })
      .expect(403);
  });

  it('changes a user email only after the emailed OTP is confirmed', async () => {
    const initiated = await context
      .asUser('post', `/users/${context.testUsers.user.userId}/email-change`)
      .send({ newEmail: 'updated@example.test' })
      .expect(200);

    expect(initiated.body).toMatchObject({
      requiresConfirmation: true,
      challengeId: expect.any(String),
    });
    expect(context.sentOtps).toHaveLength(1);
    expect(context.sentOtps[0].email).toBe('updated@example.test');

    await context
      .asUser(
        'post',
        `/users/${context.testUsers.user.userId}/email-change/confirm`,
      )
      .send({
        challengeId: initiated.body.challengeId,
        code: context.sentOtps[0].otp,
      })
      .expect(200)
      .expect({ message: 'Email address successfully updated.' });

    const updatedUser = await context.dataSource
      .getRepository(User)
      .findOneByOrFail({ userId: context.testUsers.user.userId });
    expect(updatedUser.email).toBe('updated@example.test');
  });

  it('deletes a user through the admin endpoint and returns deletion status', async () => {
    const deletion = await context
      .asAdmin('delete', `/users/${context.testUsers.user.userId}`)
      .send({ reason: 'e2e cleanup scenario' })
      .expect(200);

    expect(deletion.body).toMatchObject({
      status: 'done',
      mode: 'sync',
    });
    expect(
      await context.dataSource
        .getRepository(User)
        .exist({ where: { userId: context.testUsers.user.userId } }),
    ).toBe(false);

    const job = await context
      .asAdmin('get', `/users/${context.testUsers.user.userId}/deletion-status`)
      .expect(200);
    expect(job.body).toMatchObject({
      jobId: deletion.body.jobId,
      status: 'done',
    });
    expect(
      await context.dataSource.getRepository(UserDeletionJob).count(),
    ).toBe(1);
  });

  it('requires an OTP before a user can delete their own account', async () => {
    const initiated = await context
      .asUser('delete', `/users/${context.testUsers.user.userId}`)
      .send({})
      .expect(200);

    expect(initiated.body).toMatchObject({
      requiresConfirmation: true,
      challengeId: expect.any(String),
    });
    expect(context.sentOtps).toHaveLength(1);

    const deletion = await context
      .asUser('delete', `/users/${context.testUsers.user.userId}`)
      .send({
        challengeId: initiated.body.challengeId,
        code: context.sentOtps[0].otp,
      })
      .expect(200);

    expect(deletion.body.status).toBe('done');
    expect(
      await context.dataSource
        .getRepository(User)
        .exist({ where: { userId: context.testUsers.user.userId } }),
    ).toBe(false);
  });
});
