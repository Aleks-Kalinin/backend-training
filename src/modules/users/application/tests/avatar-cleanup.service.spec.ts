import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  AVATAR_CLEANUP_MAX_ATTEMPTS,
  AvatarCleanupReason,
  AvatarCleanupTask,
} from '../../domain/avatar-cleanup';
import { AvatarCleanupService } from '../avatar-cleanup.service';
import {
  AVATAR_CLEANUP_TASK_REPOSITORY,
  AvatarCleanupTaskRepository,
} from '../ports/avatar-cleanup-task-repository.port';
import { AVATAR_STORAGE, AvatarStorage } from '../ports/avatar-storage.port';

describe('AvatarCleanupService', () => {
  let service: AvatarCleanupService;
  let avatarStorage: jest.Mocked<AvatarStorage>;
  let taskRepository: jest.Mocked<AvatarCleanupTaskRepository>;

  const params = {
    storagePath: 'user-1/old.webp',
    actorUserId: 'actor-1',
    targetUserId: 'user-1',
    reason: AvatarCleanupReason.REPLACE,
  };

  const makeTask = (overrides: Partial<AvatarCleanupTask> = {}) =>
    ({
      id: 'task-1',
      storagePath: 'user-1/old.webp',
      userId: 'user-1',
      reason: AvatarCleanupReason.REPLACE,
      attempts: 0,
      lastError: 'timeout',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as AvatarCleanupTask;

  beforeEach(async () => {
    avatarStorage = {
      upload: jest.fn(),
      remove: jest.fn(() => Promise.resolve()),
      getPublicUrl: jest.fn(),
    } as unknown as jest.Mocked<AvatarStorage>;

    taskRepository = {
      create: jest.fn((task: Partial<AvatarCleanupTask>) =>
        Promise.resolve(makeTask({ ...task, attempts: 0 })),
      ),
      findRetryable: jest.fn(() => Promise.resolve([])),
      save: jest.fn((task: AvatarCleanupTask) => Promise.resolve(task)),
      delete: jest.fn(() => Promise.resolve()),
    } as unknown as jest.Mocked<AvatarCleanupTaskRepository>;

    const module = await Test.createTestingModule({
      providers: [
        AvatarCleanupService,
        { provide: AVATAR_STORAGE, useValue: avatarStorage },
        { provide: AVATAR_CLEANUP_TASK_REPOSITORY, useValue: taskRepository },
      ],
    }).compile();

    service = module.get(AvatarCleanupService);
  });

  describe('removeObject', () => {
    it('removes the object without recording a task', async () => {
      await expect(service.removeObject(params)).resolves.toBe('removed');
      expect(avatarStorage.remove).toHaveBeenCalledWith('user-1/old.webp');
      expect(taskRepository.create).not.toHaveBeenCalled();
    });

    it('records a retryable task when storage deletion fails', async () => {
      avatarStorage.remove.mockRejectedValue(new Error('storage timeout'));

      await expect(service.removeObject(params)).resolves.toBe('pending');
      expect(taskRepository.create).toHaveBeenCalledWith({
        storagePath: 'user-1/old.webp',
        userId: 'user-1',
        reason: AvatarCleanupReason.REPLACE,
        lastError: 'storage timeout',
      });
    });

    it('reports failure without throwing when the task cannot be recorded', async () => {
      avatarStorage.remove.mockRejectedValue(new Error('storage timeout'));
      taskRepository.create.mockRejectedValue(new Error('db down'));

      await expect(service.removeObject(params)).resolves.toBe('failed');
    });
  });

  describe('removeUserAvatar', () => {
    const deletion = { actorUserId: 'admin-1', targetUserId: 'user-1' };

    it('does nothing when the user has no uploaded avatar', async () => {
      await service.removeUserAvatar({ ...deletion, storagePath: null });
      expect(avatarStorage.remove).not.toHaveBeenCalled();
    });

    it('succeeds when the deletion is recorded as pending', async () => {
      avatarStorage.remove.mockRejectedValue(new Error('storage timeout'));

      await expect(
        service.removeUserAvatar({
          ...deletion,
          storagePath: 'user-1/a.webp',
        }),
      ).resolves.toBeUndefined();
      expect(taskRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: AvatarCleanupReason.USER_DELETION,
        }),
      );
    });

    it('throws when cleanup is neither completed nor recorded', async () => {
      avatarStorage.remove.mockRejectedValue(new Error('storage timeout'));
      taskRepository.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.removeUserAvatar({
          ...deletion,
          storagePath: 'user-1/a.webp',
        }),
      ).rejects.toThrow('Avatar cleanup could not be completed or recorded');
    });
  });

  describe('retryPendingCleanups', () => {
    it('deletes tasks whose object removal now succeeds', async () => {
      taskRepository.findRetryable.mockResolvedValue([makeTask()]);

      await service.retryPendingCleanups();

      expect(taskRepository.findRetryable).toHaveBeenCalledWith(
        AVATAR_CLEANUP_MAX_ATTEMPTS,
        expect.any(Number),
      );
      expect(avatarStorage.remove).toHaveBeenCalledWith('user-1/old.webp');
      expect(taskRepository.delete).toHaveBeenCalledWith('task-1');
    });

    it('increments attempts and keeps the task when removal fails again', async () => {
      const task = makeTask({ attempts: 2 });
      taskRepository.findRetryable.mockResolvedValue([task]);
      avatarStorage.remove.mockRejectedValue(new Error('still down'));

      await service.retryPendingCleanups();

      expect(taskRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 3, lastError: 'still down' }),
      );
      expect(taskRepository.delete).not.toHaveBeenCalled();
    });

    it('continues with remaining tasks after a failure', async () => {
      taskRepository.findRetryable.mockResolvedValue([
        makeTask({ id: 'task-1', storagePath: 'a.webp' }),
        makeTask({ id: 'task-2', storagePath: 'b.webp' }),
      ]);
      avatarStorage.remove
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce(undefined);

      await service.retryPendingCleanups();

      expect(taskRepository.delete).toHaveBeenCalledTimes(1);
      expect(taskRepository.delete).toHaveBeenCalledWith('task-2');
    });

    it('does not throw when loading tasks fails', async () => {
      taskRepository.findRetryable.mockRejectedValue(new Error('db down'));

      await expect(service.retryPendingCleanups()).resolves.toBeUndefined();
    });
  });
});
