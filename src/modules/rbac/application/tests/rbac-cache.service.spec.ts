import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grant } from '../../infrastructure/entities/grant.entity';
import { RbacCacheService } from '../rbac-cache.service';

describe('RbacCacheService', () => {
  let service: RbacCacheService;
  let grantRepository: jest.Mocked<Repository<Grant>>;

  beforeEach(async () => {
    grantRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Grant>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacCacheService,
        {
          provide: getRepositoryToken(Grant),
          useValue: grantRepository,
        },
      ],
    }).compile();

    service = module.get<RbacCacheService>(RbacCacheService);
  });

  describe('onModuleInit & reloadCache', () => {
    it('populates cache on module initialization', async () => {
      grantRepository.find.mockResolvedValue([
        {
          id: '1',
          role: { id: 'r1', name: 'admin' },
          permission: { id: 'p1', name: 'users' },
          actions: ['create', 'read'],
        },
        {
          id: '2',
          role: { id: 'r2', name: 'user' },
          permission: { id: 'p2', name: 'profile' },
          actions: null, // Wildcard *
        },
      ] as Grant[]);

      await service.onModuleInit();

      expect(grantRepository.find).toHaveBeenCalledWith({
        relations: ['role', 'permission'],
      });

      expect(service.hasPermission(['admin'], 'users', 'create')).toBe(true);
      expect(service.hasPermission(['admin'], 'users', 'delete')).toBe(false);
      expect(service.hasPermission(['user'], 'profile', 'any-action')).toBe(
        true,
      );
    });

    it('reloads cache on rbac.changed event', async () => {
      grantRepository.find.mockResolvedValue([
        {
          id: '1',
          role: { id: 'r1', name: 'admin' },
          permission: { id: 'p1', name: 'reports' },
          actions: ['read'],
        },
      ] as Grant[]);

      await service.handleRbacChanged();

      expect(grantRepository.find).toHaveBeenCalledWith({
        relations: ['role', 'permission'],
      });
      expect(service.hasPermission(['admin'], 'reports', 'read')).toBe(true);
    });

    it('skips grants with missing role or permission relation', async () => {
      grantRepository.find.mockResolvedValue([
        {
          id: '1',
          role: null,
          permission: { id: 'p1', name: 'reports' },
          actions: ['read'],
        },
        {
          id: '2',
          role: { id: 'r1', name: 'admin' },
          permission: null,
          actions: ['read'],
        },
      ] as any[]);

      await service.onModuleInit();

      expect(service.hasPermission(['admin'], 'reports', 'read')).toBe(false);
    });

    it('catches and logs errors during cache reloading silently', async () => {
      const errorSpy = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => {});
      grantRepository.find.mockRejectedValue(new Error('Database error'));

      await service.onModuleInit();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to reload RBAC cache',
        expect.any(Error),
      );
      errorSpy.mockRestore();
    });
  });

  describe('hasPermission', () => {
    beforeEach(async () => {
      grantRepository.find.mockResolvedValue([
        {
          id: '1',
          role: { id: 'r1', name: 'admin' },
          permission: { id: 'p1', name: 'users' },
          actions: '*',
        },
        {
          id: '2',
          role: { id: 'r2', name: 'editor' },
          permission: { id: 'p2', name: 'articles' },
          actions: ['read', 'update'],
        },
      ] as any[]);

      await service.onModuleInit();
    });

    it('returns false if userRoles is null, undefined, or empty array', () => {
      expect(service.hasPermission(null as any, 'users', 'read')).toBe(false);
      expect(service.hasPermission(undefined as any, 'users', 'read')).toBe(
        false,
      );
      expect(service.hasPermission([], 'users', 'read')).toBe(false);
    });

    it('returns false if user has no matching role in cache', () => {
      expect(service.hasPermission(['guest'], 'users', 'read')).toBe(false);
    });

    it('returns false if requested permission is not granted to role', () => {
      expect(service.hasPermission(['editor'], 'users', 'read')).toBe(false);
    });

    it('returns true when granted actions is wildcard (*)', () => {
      expect(service.hasPermission(['admin'], 'users', 'delete')).toBe(true);
    });

    it('returns true when action is listed in granted actions array', () => {
      expect(service.hasPermission(['editor'], 'articles', 'update')).toBe(
        true,
      );
    });

    it('returns false when action is not in granted actions array', () => {
      expect(service.hasPermission(['editor'], 'articles', 'delete')).toBe(
        false,
      );
    });

    it('checks multiple roles for permission until match is found', () => {
      expect(
        service.hasPermission(['guest', 'editor'], 'articles', 'update'),
      ).toBe(true);
    });
  });
});
