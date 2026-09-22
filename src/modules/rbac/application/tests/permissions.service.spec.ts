import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Grant } from '../../infrastructure/entities/grant.entity';
import { Permission } from '../../infrastructure/entities/permission.entity';
import { AuditLogger } from '../../infrastructure/logging/logAudit';
import { PermissionsService } from '../permissions.service';
import { PERMISSION_REPOSITORY } from '../ports/rbac-repositories.port';
import { RBAC_EVENTS } from '../ports/rbac-events.port';
import { RBAC_AUDIT } from '../ports/audit.port';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let permissionRepository: jest.Mocked<Repository<Permission>> &
    Record<string, jest.Mock>;
  let eventEmitter: jest.Mocked<EventEmitter2> & { changed: jest.Mock };
  let auditLogger: jest.Mocked<AuditLogger>;

  beforeEach(async () => {
    permissionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Permission>> &
      Record<string, jest.Mock>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2> & { changed: jest.Mock };

    auditLogger = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditLogger>;
    permissionRepository.findAll = permissionRepository.find as never;
    permissionRepository.findById = permissionRepository.findOne as never;
    permissionRepository.findByName = permissionRepository.findOne as never;
    eventEmitter.changed = eventEmitter.emit as never;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        {
          provide: PERMISSION_REPOSITORY,
          useValue: permissionRepository,
        },
        {
          provide: RBAC_EVENTS,
          useValue: eventEmitter,
        },
        {
          provide: RBAC_AUDIT,
          useValue: auditLogger,
        },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  const mockUserId = randomUUID();

  describe('findAll', () => {
    it('returns array of all permissions', async () => {
      const mockPermissions = [{ id: 'p1', name: 'users' }] as Permission[];
      permissionRepository.find.mockResolvedValue(mockPermissions);

      const result = await service.findAll();

      expect(result).toBe(mockPermissions);
      expect(permissionRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('returns permission when found', async () => {
      const mockPermission = { id: 'p1', name: 'users' } as Permission;
      permissionRepository.findOne.mockResolvedValue(mockPermission);

      const result = await service.findOne('p1', mockUserId);

      expect(result).toBe(mockPermission);
      expect(permissionRepository.findById).toHaveBeenCalledWith('p1');
    });

    it('throws NotFoundException when permission does not exist', async () => {
      permissionRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent', mockUserId)).rejects.toThrow(
        new NotFoundException('Permission with ID non-existent not found'),
      );
    });
  });

  describe('create', () => {
    it('throws ConflictException if permission with name already exists', async () => {
      permissionRepository.findOne.mockResolvedValue({
        id: 'existing-id',
        name: 'users',
      } as Permission);

      await expect(
        service.create(
          {
            name: 'users',
            actions: ['read'],
          },
          mockUserId,
        ),
      ).rejects.toThrow(
        new ConflictException('Permission with name users already exists'),
      );
    });

    it('creates and saves new permission and emits rbac.changed event', async () => {
      const dto = {
        name: 'users',
        description: 'User management',
        actions: ['read'],
      };
      const savedPermission = { id: 'p1', ...dto, grants: [] } as Permission;

      permissionRepository.findOne.mockResolvedValue(null);
      permissionRepository.save.mockResolvedValue(savedPermission);

      const result = await service.create(dto, mockUserId);

      expect(result).toBe(savedPermission);
      expect(permissionRepository.save).toHaveBeenCalledWith(dto);
      expect(eventEmitter.changed).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws ConflictException if updated name conflicts with another existing permission', async () => {
      const existingPermission = { id: 'p1', name: 'users' } as Permission;
      permissionRepository.findOne
        .mockResolvedValueOnce(existingPermission) // for findOne(id)
        .mockResolvedValueOnce({ id: 'p2', name: 'articles' } as Permission); // for name check

      await expect(
        service.update('p1', { name: 'articles' }, mockUserId),
      ).rejects.toThrow(
        new ConflictException('Permission with name articles already exists'),
      );
    });

    it('updates permission and emits rbac.changed event', async () => {
      const existingPermission = {
        id: 'p1',
        name: 'users',
      } as Permission;
      const updatedPermission = {
        ...existingPermission,
        description: 'New',
      } as Permission;

      permissionRepository.findOne.mockResolvedValue(existingPermission);
      permissionRepository.save.mockResolvedValue(updatedPermission);

      const result = await service.update(
        'p1',
        { actions: ['update'] },
        mockUserId,
      );

      expect(result).toBe(updatedPermission);
      expect(eventEmitter.changed).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException if permission to remove is missing', async () => {
      permissionRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('p1', mockUserId)).rejects.toThrow(
        new NotFoundException('Permission with ID p1 not found'),
      );
    });

    it('throws ConflictException if permission has active grants attached', async () => {
      const permissionWithGrants = {
        id: 'p1',
        name: 'users',
        grants: [{ id: 'g1' } as Grant],
      } as Permission;

      permissionRepository.findOne.mockResolvedValue(permissionWithGrants);

      await expect(service.remove('p1', mockUserId)).rejects.toThrow(
        new ConflictException(
          'Cannot delete permission that is currently granted to roles',
        ),
      );
    });

    it('removes permission and emits rbac.changed event when no active grants exist', async () => {
      const permissionWithoutGrants = {
        id: 'p1',
        name: 'users',
        grants: [],
        actions: ['read'],
      } as Permission;

      permissionRepository.findOne.mockResolvedValue(permissionWithoutGrants);

      await service.remove('p1', mockUserId);

      expect(permissionRepository.remove).toHaveBeenCalledWith(
        permissionWithoutGrants,
      );
      expect(eventEmitter.changed).toHaveBeenCalled();
    });
  });
});
