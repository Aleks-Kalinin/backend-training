import sharp from 'sharp';
import request from 'supertest';
import { API_BASE_PATH } from '../../src/core/api-routing';
import { AvatarCleanupTaskEntity } from '../../src/modules/users/infrastructure/entity/avatar-cleanup-task.entity';
import { User } from '../../src/modules/users/infrastructure/entity/user.entity';
import {
  createE2eTestContext,
  FAKE_AVATAR_PUBLIC_BASE_URL,
} from './e2e-test-context';

const image = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 10, g: 120, b: 200 },
    },
  });

describe('Avatar upload HTTP e2e', () => {
  const context = createE2eTestContext();
  let png: Buffer;
  let jpeg: Buffer;
  let gif: Buffer;

  beforeAll(async () => {
    png = await image(2000, 1000).png().toBuffer();
    jpeg = await image(300, 300).jpeg().toBuffer();
    gif = await image(20, 20).gif().toBuffer();
  });

  const userPhotoPath = () => `/users/${context.testUsers.user.userId}/photo`;
  const findUser = (userId: string) =>
    context.dataSource.getRepository(User).findOneByOrFail({ userId });

  it('uploads an avatar, re-encodes it, and exposes its public URL in profiles', async () => {
    const userId = context.testUsers.user.userId;

    const response = await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'me.png', contentType: 'image/png' })
      .expect(200);

    const stored = await findUser(userId);
    expect(stored.photo).toMatch(
      new RegExp(`^${userId}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(response.body).toEqual({
      userId,
      email: context.testUsers.user.email,
      status: context.testUsers.user.status,
      photo: `${FAKE_AVATAR_PUBLIC_BASE_URL}${stored.photo}`,
    });

    const object = context.avatarStorage.objects.get(stored.photo!);
    expect(object?.contentType).toBe('image/webp');
    const metadata = await sharp(object!.content).metadata();
    expect(metadata).toMatchObject({
      format: 'webp',
      width: 1024,
      height: 512,
    });

    const profile = await context
      .asAdmin('get', `/users/${userId}`)
      .expect(200);
    expect(profile.body.photo).toBe(response.body.photo);
  });

  it('replaces an avatar under a new key and removes the previous object', async () => {
    const userId = context.testUsers.user.userId;

    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    const firstPath = (await findUser(userId)).photo!;

    const second = await context
      .asUser('put', userPhotoPath())
      .attach('file', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(200);
    const secondPath = (await findUser(userId)).photo!;

    expect(secondPath).not.toBe(firstPath);
    expect(second.body.photo).toBe(
      `${FAKE_AVATAR_PUBLIC_BASE_URL}${secondPath}`,
    );
    expect([...context.avatarStorage.objects.keys()]).toEqual([secondPath]);
  });

  it('enforces self/admin authorization', async () => {
    const adminPhotoPath = `/users/${context.testUsers.admin.userId}/photo`;

    await request(context.app.getHttpServer())
      .put(`${API_BASE_PATH}${userPhotoPath()}`)
      .attach('file', png, { filename: 'me.png', contentType: 'image/png' })
      .expect(401);
    await request(context.app.getHttpServer())
      .delete(`${API_BASE_PATH}${userPhotoPath()}`)
      .expect(401);

    await context
      .asUser('put', adminPhotoPath)
      .attach('file', png, { filename: 'me.png', contentType: 'image/png' })
      .expect(403);
    await context.asUser('delete', adminPhotoPath).expect(403);
    expect(context.avatarStorage.objects.size).toBe(0);

    const byAdmin = await context
      .asAdmin('put', userPhotoPath())
      .attach('file', png, { filename: 'me.png', contentType: 'image/png' })
      .expect(200);
    // Admin sees the public profile shape, which includes the photo.
    expect(byAdmin.body).toEqual({
      userId: context.testUsers.user.userId,
      email: context.testUsers.user.email,
      photo: expect.stringMatching(/\.webp$/),
    });
  });

  it('returns 404 for an unknown user', async () => {
    await context
      .asAdmin('put', '/users/00000000-0000-4000-8000-000000000000/photo')
      .attach('file', png, { filename: 'me.png', contentType: 'image/png' })
      .expect(404);
  });

  it('rejects missing, multiple, and empty files with 400', async () => {
    await context
      .asUser('put', userPhotoPath())
      .field('note', 'no file here')
      .expect(400);

    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('file', png, { filename: 'b.png', contentType: 'image/png' })
      .expect(400);

    await context
      .asUser('put', userPhotoPath())
      .attach('file', Buffer.alloc(0), {
        filename: 'empty.png',
        contentType: 'image/png',
      })
      .expect(400);

    expect(context.avatarStorage.objects.size).toBe(0);
  });

  it('rejects unsupported, mismatched, corrupt, and non-multipart uploads', async () => {
    await context
      .asUser('put', userPhotoPath())
      .attach('file', gif, { filename: 'a.gif', contentType: 'image/gif' })
      .expect(415);

    await context
      .asUser('put', userPhotoPath())
      .attach('file', jpeg, { filename: 'fake.png', contentType: 'image/png' })
      .expect(415);

    await context
      .asUser('put', userPhotoPath())
      .attach('file', Buffer.concat([png.subarray(0, 64), Buffer.alloc(64)]), {
        filename: 'broken.png',
        contentType: 'image/png',
      })
      .expect(400);

    await context
      .asUser('put', userPhotoPath())
      .send({ file: 'not-a-file' })
      .expect(415);

    expect(context.avatarStorage.objects.size).toBe(0);
    expect((await findUser(context.testUsers.user.userId)).photo).toBeNull();
  });

  it('rejects files over 5 MiB with 413', async () => {
    const oversized = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);

    await context
      .asUser('put', userPhotoPath())
      .attach('file', oversized, {
        filename: 'big.png',
        contentType: 'image/png',
      })
      .expect(413);

    expect(context.avatarStorage.objects.size).toBe(0);
  });

  it('returns 500 and keeps the current avatar when storage upload fails', async () => {
    const userId = context.testUsers.user.userId;
    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    const currentPath = (await findUser(userId)).photo;

    context.avatarStorage.failUploads = true;
    const failed = await context
      .asUser('put', userPhotoPath())
      .attach('file', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(500);

    expect(JSON.stringify(failed.body)).not.toContain('injected');
    expect((await findUser(userId)).photo).toBe(currentPath);
  });

  it('keeps the new avatar and records a retryable task when old-object cleanup fails', async () => {
    const userId = context.testUsers.user.userId;
    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    const oldPath = (await findUser(userId)).photo;

    context.avatarStorage.failRemovals = true;
    await context
      .asUser('put', userPhotoPath())
      .attach('file', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(200);

    const newPath = (await findUser(userId)).photo;
    expect(newPath).not.toBe(oldPath);
    const tasks = await context.dataSource
      .getRepository(AvatarCleanupTaskEntity)
      .find();
    expect(tasks).toEqual([
      expect.objectContaining({
        storagePath: oldPath,
        userId,
        reason: 'replace',
        attempts: 0,
      }),
    ]);
  });

  it('removes an avatar idempotently', async () => {
    const userId = context.testUsers.user.userId;
    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);

    const removed = await context.asUser('delete', userPhotoPath()).expect(200);
    expect(removed.body.photo).toBeNull();
    expect(context.avatarStorage.objects.size).toBe(0);
    expect((await findUser(userId)).photo).toBeNull();

    const again = await context.asUser('delete', userPhotoPath()).expect(200);
    expect(again.body.photo).toBeNull();
  });

  it('ignores photo URLs on PATCH and preserves the uploaded avatar', async () => {
    const userId = context.testUsers.user.userId;
    const uploaded = await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    const storagePath = (await findUser(userId)).photo;

    for (const photo of [
      'https://cdn.example.test/me.png',
      'javascript:alert(1)',
      null,
    ]) {
      const patched = await context
        .asUser('patch', `/users/${userId}`)
        .send({ status: context.testUsers.user.status, photo })
        .expect(200);
      expect(patched.body.photo).toBe(uploaded.body.photo);
    }

    expect((await findUser(userId)).photo).toBe(storagePath);
    expect(context.avatarStorage.objects.has(storagePath!)).toBe(true);
    expect(
      await context.dataSource.getRepository(AvatarCleanupTaskEntity).count(),
    ).toBe(0);
  });

  it('does not let user creation set a photo URL', async () => {
    const created = await context
      .asAdmin('post', '/users')
      .send({
        email: 'with-photo@example.test',
        password: 'Password123',
        isVerified: true,
        photo: 'https://cdn.example.test/me.png',
      })
      .expect(201);

    expect(created.body.photo).toBeNull();
    const stored = await context.dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'with-photo@example.test' });
    expect(stored.photo).toBeNull();
  });

  it('exposes the public photo URL, not the stored path, in the admin list', async () => {
    const uploaded = await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);

    const list = await context
      .asAdmin('get', '/admin/users?limit=10')
      .expect(200);
    const items = list.body.items as Record<string, unknown>[];

    expect(items).toEqual(
      expect.arrayContaining([
        {
          userId: context.testUsers.user.userId,
          email: context.testUsers.user.email,
          photo: uploaded.body.photo,
        },
        expect.objectContaining({
          userId: context.testUsers.admin.userId,
          photo: null,
        }),
      ]),
    );
    expect(uploaded.body.photo).toBe(
      `${FAKE_AVATAR_PUBLIC_BASE_URL}${(await findUser(context.testUsers.user.userId)).photo}`,
    );
    for (const item of items) {
      expect(item).not.toHaveProperty('password');
    }
  });

  it('stores the avatar path in users.photo and has no avatarStoragePath column', async () => {
    const columns: { column_name: string }[] = await context.dataSource.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
    );
    const names = columns.map((column) => column.column_name);

    expect(names).toContain('photo');
    expect(names).not.toContain('avatarStoragePath');
  });

  it('deletes the avatar object when the account is deleted', async () => {
    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    expect(context.avatarStorage.objects.size).toBe(1);

    await context
      .asAdmin('delete', `/users/${context.testUsers.user.userId}`)
      .send({ reason: 'avatar cleanup scenario' })
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('done'));

    expect(context.avatarStorage.objects.size).toBe(0);
  });
});
