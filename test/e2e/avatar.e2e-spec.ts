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
    expect(stored.avatarStoragePath).toMatch(
      new RegExp(`^${userId}/[0-9a-f-]{36}\\.webp$`),
    );
    expect(stored.photo).toBeNull();
    expect(response.body).toEqual({
      userId,
      email: context.testUsers.user.email,
      status: context.testUsers.user.status,
      photo: `${FAKE_AVATAR_PUBLIC_BASE_URL}${stored.avatarStoragePath}`,
    });

    const object = context.avatarStorage.objects.get(stored.avatarStoragePath!);
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
    expect(profile.body.avatarStoragePath).toBeUndefined();
  });

  it('replaces an avatar under a new key and removes the previous object', async () => {
    const userId = context.testUsers.user.userId;

    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    const firstPath = (await findUser(userId)).avatarStoragePath!;

    const second = await context
      .asUser('put', userPhotoPath())
      .attach('file', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(200);
    const secondPath = (await findUser(userId)).avatarStoragePath!;

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
    expect(
      (await findUser(context.testUsers.user.userId)).avatarStoragePath,
    ).toBeNull();
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
    const currentPath = (await findUser(userId)).avatarStoragePath;

    context.avatarStorage.failUploads = true;
    const failed = await context
      .asUser('put', userPhotoPath())
      .attach('file', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(500);

    expect(JSON.stringify(failed.body)).not.toContain('injected');
    expect((await findUser(userId)).avatarStoragePath).toBe(currentPath);
  });

  it('keeps the new avatar and records a retryable task when old-object cleanup fails', async () => {
    const userId = context.testUsers.user.userId;
    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    const oldPath = (await findUser(userId)).avatarStoragePath;

    context.avatarStorage.failRemovals = true;
    await context
      .asUser('put', userPhotoPath())
      .attach('file', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
      .expect(200);

    const newPath = (await findUser(userId)).avatarStoragePath;
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
    expect(await findUser(userId)).toMatchObject({
      photo: null,
      avatarStoragePath: null,
    });

    const again = await context.asUser('delete', userPhotoPath()).expect(200);
    expect(again.body.photo).toBeNull();
  });

  it('removing an avatar also clears a URL-based photo', async () => {
    await context
      .asUser('patch', `/users/${context.testUsers.user.userId}`)
      .send({ photo: 'https://cdn.example.test/me.png' })
      .expect(200);

    const removed = await context.asUser('delete', userPhotoPath()).expect(200);
    expect(removed.body.photo).toBeNull();
  });

  it('lets a URL-based PATCH supersede an uploaded avatar and cleans up the object', async () => {
    const userId = context.testUsers.user.userId;
    await context
      .asUser('put', userPhotoPath())
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(200);

    const patched = await context
      .asUser('patch', `/users/${userId}`)
      .send({ photo: 'https://cdn.example.test/me.png' })
      .expect(200);

    expect(patched.body.photo).toBe('https://cdn.example.test/me.png');
    expect(await findUser(userId)).toMatchObject({
      photo: 'https://cdn.example.test/me.png',
      avatarStoragePath: null,
    });
    expect(context.avatarStorage.objects.size).toBe(0);
  });

  it('rejects non-http(s) photo URLs on PATCH', async () => {
    const userId = context.testUsers.user.userId;

    await context
      .asUser('patch', `/users/${userId}`)
      .send({ photo: 'javascript:alert(1)' })
      .expect(400);
    await context
      .asUser('patch', `/users/${userId}`)
      .send({ photo: 'ftp://files.example.test/me.png' })
      .expect(400);
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
