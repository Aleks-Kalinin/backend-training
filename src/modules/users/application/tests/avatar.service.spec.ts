import { AuthTokenPayload } from '@/modules/auth/dto/auth-request.dto';
import { SystemRole } from '@/modules/rbac/domain/system-role.enum';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type UUID } from 'node:crypto';
import { AvatarCleanupReason } from '../../domain/avatar-cleanup';
import type { User } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/user-status.enum';
import { AvatarCleanupService } from '../avatar-cleanup.service';
import { AvatarService, AvatarUploadFile } from '../avatar.service';
import {
  AVATAR_IMAGE_PROCESSOR,
  AvatarImageProcessor,
} from '../ports/avatar-image-processor.port';
import { AVATAR_STORAGE, AvatarStorage } from '../ports/avatar-storage.port';
import { USER_REPOSITORY, UserRepository } from '../ports/user-repository.port';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const PUBLIC_BASE = 'https://cdn.example.test/avatars/';
const STORAGE_PATH_PATTERN = new RegExp(`^${USER_ID}/[0-9a-f-]{36}\\.webp$`);

describe('AvatarService', () => {
  let service: AvatarService;
  let usersRepository: jest.Mocked<UserRepository>;
  let avatarStorage: jest.Mocked<AvatarStorage>;
  let imageProcessor: jest.Mocked<AvatarImageProcessor>;
  let avatarCleanupService: jest.Mocked<AvatarCleanupService>;

  const baseUser: User = {
    userId: USER_ID,
    email: 'user@example.com',
    password: 'hash',
    status: UserStatus.ACTIVE,
    isVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    photo: null,
    avatarStoragePath: null,
    roles: [],
  };

  const self: AuthTokenPayload = {
    sub: USER_ID as UUID,
    email: 'user@example.com',
    roles: [SystemRole.USER],
  };
  const admin: AuthTokenPayload = {
    sub: '99999999-9999-9999-9999-999999999999' as UUID,
    email: 'admin@example.com',
    roles: [SystemRole.ADMIN],
  };
  const stranger: AuthTokenPayload = {
    sub: '22222222-2222-2222-2222-222222222222' as UUID,
    email: 'other@example.com',
    roles: [SystemRole.USER],
  };

  const upload: AvatarUploadFile = {
    content: Buffer.from('raw-image'),
    mimetype: 'image/png',
  };
  const processed = Buffer.from('webp-bytes');

  const readFile = jest.fn<() => Promise<AvatarUploadFile>>();

  beforeEach(async () => {
    readFile.mockReset();
    readFile.mockResolvedValue(upload);

    usersRepository = {
      findById: jest.fn(),
      updateAvatar: jest.fn(),
    } as unknown as jest.Mocked<UserRepository>;

    avatarStorage = {
      upload: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      getPublicUrl: jest.fn((path: string) => `${PUBLIC_BASE}${path}`),
    } as unknown as jest.Mocked<AvatarStorage>;

    imageProcessor = {
      process: jest.fn(() =>
        Promise.resolve({ content: processed, width: 512, height: 256 }),
      ),
    } as unknown as jest.Mocked<AvatarImageProcessor>;

    avatarCleanupService = {
      removeObject: jest.fn(() => Promise.resolve('removed')),
    } as unknown as jest.Mocked<AvatarCleanupService>;

    usersRepository.updateAvatar.mockImplementation((userId, change) =>
      Promise.resolve({
        user: { ...baseUser, userId, ...change },
        previousStoragePath: null,
      }),
    );

    const module = await Test.createTestingModule({
      providers: [
        AvatarService,
        { provide: USER_REPOSITORY, useValue: usersRepository },
        { provide: AVATAR_STORAGE, useValue: avatarStorage },
        { provide: AVATAR_IMAGE_PROCESSOR, useValue: imageProcessor },
        { provide: AvatarCleanupService, useValue: avatarCleanupService },
      ],
    }).compile();

    service = module.get(AvatarService);
  });

  describe('withResolvedPhoto', () => {
    it('prefers the uploaded avatar public URL over the URL-based photo', () => {
      const user = service.withResolvedPhoto({
        ...baseUser,
        photo: 'https://legacy.example/me.png',
        avatarStoragePath: `${USER_ID}/a.webp`,
      });
      expect(user.photo).toBe(`${PUBLIC_BASE}${USER_ID}/a.webp`);
    });

    it('falls back to the URL-based photo, then null', () => {
      expect(
        service.withResolvedPhoto({
          ...baseUser,
          photo: 'https://legacy.example/me.png',
        }).photo,
      ).toBe('https://legacy.example/me.png');
      expect(service.withResolvedPhoto(baseUser).photo).toBeNull();
      expect(avatarStorage.getPublicUrl).not.toHaveBeenCalled();
    });
  });

  describe('uploadAvatar', () => {
    it('processes, stores under an opaque per-user key, and returns the public URL', async () => {
      usersRepository.findById.mockResolvedValue({
        ...baseUser,
        photo: 'https://legacy.example/me.png',
      });

      const result = await service.uploadAvatar({
        userId: USER_ID,
        requestingUser: self,
        readFile,
      });

      expect(imageProcessor.process).toHaveBeenCalledWith(
        upload.content,
        'image/png',
      );
      const [storagePath, content, contentType] =
        avatarStorage.upload.mock.calls[0];
      expect(storagePath).toMatch(STORAGE_PATH_PATTERN);
      expect(content).toBe(processed);
      expect(contentType).toBe('image/webp');
      expect(usersRepository.updateAvatar).toHaveBeenCalledWith(USER_ID, {
        avatarStoragePath: storagePath,
        photo: null,
      });
      expect(result.photo).toBe(`${PUBLIC_BASE}${storagePath}`);
      expect(avatarCleanupService.removeObject).not.toHaveBeenCalled();
    });

    it('allows an admin to upload for another user', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);

      await service.uploadAvatar({
        userId: USER_ID,
        requestingUser: admin,
        readFile,
      });

      expect(avatarStorage.upload).toHaveBeenCalled();
    });

    it('rejects a non-owner non-admin before reading the file', async () => {
      await expect(
        service.uploadAvatar({
          userId: USER_ID,
          requestingUser: stranger,
          readFile,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(readFile).not.toHaveBeenCalled();
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing user before reading the file', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.uploadAvatar({
          userId: USER_ID,
          requestingUser: admin,
          readFile,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(readFile).not.toHaveBeenCalled();
    });

    it.each([
      new BadRequestException('Invalid image data'),
      new UnsupportedMediaTypeException('Unsupported'),
    ])(
      'propagates validation errors without touching storage: %s',
      async (error) => {
        usersRepository.findById.mockResolvedValue(baseUser);
        imageProcessor.process.mockRejectedValue(error);

        await expect(
          service.uploadAvatar({
            userId: USER_ID,
            requestingUser: self,
            readFile,
          }),
        ).rejects.toBe(error);
        expect(avatarStorage.upload).not.toHaveBeenCalled();
        expect(usersRepository.updateAvatar).not.toHaveBeenCalled();
      },
    );

    it('returns 500 and leaves the user unchanged when storage upload fails', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);
      avatarStorage.upload.mockRejectedValue(
        new Error('Avatar storage upload failed: quota exceeded'),
      );

      await expect(
        service.uploadAvatar({
          userId: USER_ID,
          requestingUser: self,
          readFile,
        }),
      ).rejects.toThrow(InternalServerErrorException);
      expect(usersRepository.updateAvatar).not.toHaveBeenCalled();
    });

    it('deletes the new object and propagates the original error when the DB update fails', async () => {
      usersRepository.findById.mockResolvedValue({
        ...baseUser,
        avatarStoragePath: `${USER_ID}/current.webp`,
      });
      const dbError = new Error('connection reset');
      usersRepository.updateAvatar.mockRejectedValue(dbError);

      await expect(
        service.uploadAvatar({
          userId: USER_ID,
          requestingUser: self,
          readFile,
        }),
      ).rejects.toBe(dbError);

      const newPath = avatarStorage.upload.mock.calls[0][0];
      expect(avatarCleanupService.removeObject).toHaveBeenCalledTimes(1);
      expect(avatarCleanupService.removeObject).toHaveBeenCalledWith(
        expect.objectContaining({
          storagePath: newPath,
          reason: AvatarCleanupReason.ROLLBACK,
        }),
      );
      // The active avatar is never touched.
      expect(avatarCleanupService.removeObject).not.toHaveBeenCalledWith(
        expect.objectContaining({ storagePath: `${USER_ID}/current.webp` }),
      );
    });

    it('cleans up the new object when the user disappears mid-upload', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);
      usersRepository.updateAvatar.mockResolvedValue(null);

      await expect(
        service.uploadAvatar({
          userId: USER_ID,
          requestingUser: self,
          readFile,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(avatarCleanupService.removeObject).toHaveBeenCalledWith(
        expect.objectContaining({ reason: AvatarCleanupReason.ROLLBACK }),
      );
    });

    it('removes the previous object only after the DB update succeeds', async () => {
      usersRepository.findById.mockResolvedValue({
        ...baseUser,
        avatarStoragePath: `${USER_ID}/old.webp`,
      });
      usersRepository.updateAvatar.mockImplementation((userId, change) =>
        Promise.resolve({
          user: { ...baseUser, ...change },
          previousStoragePath: `${USER_ID}/old.webp`,
        }),
      );

      const result = await service.uploadAvatar({
        userId: USER_ID,
        requestingUser: self,
        readFile,
      });

      expect(avatarCleanupService.removeObject).toHaveBeenCalledWith({
        storagePath: `${USER_ID}/old.webp`,
        actorUserId: USER_ID,
        targetUserId: USER_ID,
        reason: AvatarCleanupReason.REPLACE,
      });
      expect(
        usersRepository.updateAvatar.mock.invocationCallOrder[0],
      ).toBeLessThan(
        avatarCleanupService.removeObject.mock.invocationCallOrder[0],
      );
      expect(result.photo).toMatch(/\.webp$/);
      expect(result.photo).not.toContain('old.webp');
    });

    it('keeps the new avatar when cleaning up the previous object fails', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);
      usersRepository.updateAvatar.mockImplementation((userId, change) =>
        Promise.resolve({
          user: { ...baseUser, ...change },
          previousStoragePath: `${USER_ID}/old.webp`,
        }),
      );
      avatarCleanupService.removeObject.mockResolvedValue('pending');

      const result = await service.uploadAvatar({
        userId: USER_ID,
        requestingUser: self,
        readFile,
      });

      expect(result.avatarStoragePath).toMatch(STORAGE_PATH_PATTERN);
      expect(result.photo).toBe(`${PUBLIC_BASE}${result.avatarStoragePath}`);
    });
  });

  describe('removeAvatar', () => {
    it('clears both photo fields and removes the uploaded object', async () => {
      usersRepository.findById.mockResolvedValue({
        ...baseUser,
        avatarStoragePath: `${USER_ID}/old.webp`,
      });
      usersRepository.updateAvatar.mockImplementation((userId, change) =>
        Promise.resolve({
          user: { ...baseUser, ...change },
          previousStoragePath: `${USER_ID}/old.webp`,
        }),
      );

      const result = await service.removeAvatar({
        userId: USER_ID,
        requestingUser: self,
      });

      expect(usersRepository.updateAvatar).toHaveBeenCalledWith(USER_ID, {
        avatarStoragePath: null,
        photo: null,
      });
      expect(avatarCleanupService.removeObject).toHaveBeenCalledWith(
        expect.objectContaining({
          storagePath: `${USER_ID}/old.webp`,
          reason: AvatarCleanupReason.REMOVE,
        }),
      );
      expect(result.photo).toBeNull();
    });

    it('is idempotent when no photo is set', async () => {
      usersRepository.findById.mockResolvedValue(baseUser);

      const result = await service.removeAvatar({
        userId: USER_ID,
        requestingUser: admin,
      });

      expect(result.photo).toBeNull();
      expect(avatarCleanupService.removeObject).not.toHaveBeenCalled();
    });

    it('rejects a non-owner non-admin', async () => {
      await expect(
        service.removeAvatar({ userId: USER_ID, requestingUser: stranger }),
      ).rejects.toThrow(ForbiddenException);
      expect(usersRepository.updateAvatar).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing user', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.removeAvatar({ userId: USER_ID, requestingUser: admin }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
