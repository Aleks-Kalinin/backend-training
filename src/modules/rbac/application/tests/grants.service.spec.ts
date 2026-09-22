import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Grant } from '../../infrastructure/entities/grant.entity';
import { Permission } from '../../infrastructure/entities/permission.entity';
import { Role } from '../../infrastructure/entities/role.entity';
import { AuditLogger } from '../../infrastructure/logging/logAudit';
import { GrantsService } from '../grants.service';
import {
  GRANT_REPOSITORY,
  PERMISSION_REPOSITORY,
  ROLE_REPOSITORY,
} from '../ports/rbac-repositories.port';
import { RBAC_EVENTS } from '../ports/rbac-events.port';
import { RBAC_AUDIT } from '../ports/audit.port';

describe('GrantsService', () => {
  let service: GrantsService;
  let grantRepository: jest.Mocked<Repository<Grant>> &
    Record<string, jest.Mock>;
  let roleRepository: jest.Mocked<Repository<Role>> & Record<string, jest.Mock>;
  let permissionRepository: jest.Mocked<Repository<Permission>> &
    Record<string, jest.Mock>;
  let eventEmitter: jest.Mocked<EventEmitter2> & { changed: jest.Mock };
  let auditLogger: jest.Mocked<AuditLogger>;

  beforeEach(async () => {
    grantRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByRoleAndPermission: jest.fn(),
      findForCache: jest.fn(),
      create: jest.fn((dto) => dto as Grant),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Grant>> & Record<string, jest.Mock>;

    roleRepository = {
      findOne: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<Repository<Role>> & Record<string, jest.Mock>;

    permissionRepository = {
      findOne: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<Repository<Permission>> &
      Record<string, jest.Mock>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2> & { changed: jest.Mock };

    auditLogger = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditLogger>;
    grantRepository.findAll = grantRepository.find as never;
    grantRepository.findById = grantRepository.findOne as never;
    grantRepository.findByRoleAndPermission = grantRepository.findOne as never;
    roleRepository.findById = roleRepository.findOne as never;
    permissionRepository.findById = permissionRepository.findOne as never;
    eventEmitter.changed = eventEmitter.emit as never;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrantsService,
        {
          provide: GRANT_REPOSITORY,
          useValue: grantRepository,
        },
        {
          provide: ROLE_REPOSITORY,
          useValue: roleRepository,
        },
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

    service = module.get<GrantsService>(GrantsService);
  });

  const mockUserId = randomUUID();

  describe('findAll', () => {
    it('returns all grants with role and permission relations', async () => {
      const mockGrants = [{ id: 'grant-1' }] as Grant[];
      grantRepository.find.mockResolvedValue(mockGrants);

      const result = await service.findAll();

      expect(result).toBe(mockGrants);
      expect(grantRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns grant when found', async () => {
      const mockGrant = { id: 'grant-1' } as Grant;
      grantRepository.findOne.mockResolvedValue(mockGrant);

      const result = await service.findOne('grant-1', mockUserId);

      expect(result).toBe(mockGrant);
      expect(grantRepository.findById).toHaveBeenCalledWith('grant-1');
    });

    it('throws NotFoundException when grant does not exist', async () => {
      grantRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent', mockUserId)).rejects.toThrow(
        new NotFoundException('grant with id not found'),
      );
    });
  });

  describe('create', () => {
    const roleId = 'role-1';
    const permissionId = 'perm-1';

    it('throws NotFoundException if role does not exist', async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create({ roleId, permissionId, actions: ['read'] }, mockUserId),
      ).rejects.toThrow(
        new NotFoundException(`Role with ID ${roleId} not found`),
      );
    });

    it('throws NotFoundException if permission does not exist', async () => {
      roleRepository.findOne.mockResolvedValue({ id: roleId } as Role);
      permissionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create({ roleId, permissionId, actions: ['read'] }, mockUserId),
      ).rejects.toThrow(
        new NotFoundException(`Permission with ID ${permissionId} not found`),
      );
    });

    it('throws ConflictException if grant for role and permission already exists', async () => {
      roleRepository.findOne.mockResolvedValue({ id: roleId } as Role);
      permissionRepository.findOne.mockResolvedValue({
        id: permissionId,
        actions: ['read', 'write'],
      } as Permission);
      grantRepository.findOne.mockResolvedValue({
        id: 'existing-grant',
      } as Grant);

      await expect(
        service.create({ roleId, permissionId, actions: ['read'] }, mockUserId),
      ).rejects.toThrow(
        new ConflictException(
          'A grant for this Role and Permission already exists',
        ),
      );
    });

    it('throws BadRequestException if requested actions are invalid for permission', async () => {
      roleRepository.findOne.mockResolvedValue({ id: roleId } as Role);
      permissionRepository.findOne.mockResolvedValue({
        id: permissionId,
        name: 'users',
        actions: ['read', 'write'],
      } as Permission);
      grantRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          { roleId, permissionId, actions: ['read', 'delete'] },
          mockUserId,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          "Actions [delete] are not valid for permission 'users'",
        ),
      );
    });

    it('successfully creates grant with specified actions and emits rbac.changed event', async () => {
      const role = { id: roleId } as Role;
      const permission = {
        id: permissionId,
        name: 'users',
        actions: ['read', 'write'],
      } as Permission;
      const createdGrant = {
        id: 'new-grant',
        role,
        permission,
        actions: ['read'],
      } as Grant;

      roleRepository.findOne.mockResolvedValue(role);
      permissionRepository.findOne.mockResolvedValue(permission);
      grantRepository.findOne.mockResolvedValue(null);
      grantRepository.save.mockResolvedValue(createdGrant);

      const result = await service.create(
        {
          roleId,
          permissionId,
          actions: ['read'],
        },
        mockUserId,
      );

      expect(result).toBe(createdGrant);
      expect(grantRepository.create).toHaveBeenCalledWith({
        role,
        permission,
        actions: ['read'],
      });
      expect(eventEmitter.changed).toHaveBeenCalled();
    });

    it('sets actions to null when empty actions array is provided', async () => {
      const role = { id: roleId } as Role;
      const permission = {
        id: permissionId,
        name: 'users',
        actions: ['read', 'write'],
      } as Permission;

      roleRepository.findOne.mockResolvedValue(role);
      permissionRepository.findOne.mockResolvedValue(permission);
      grantRepository.findOne.mockResolvedValue(null);
      grantRepository.save.mockResolvedValue({ id: 'new-grant' } as Grant);

      await service.create(
        {
          roleId,
          permissionId,
          actions: [],
        },
        mockUserId,
      );

      expect(grantRepository.create).toHaveBeenCalledWith({
        role,
        permission,
        actions: null,
      });
    });
  });

  describe('update', () => {
    it('throws BadRequestException if updated actions are invalid for permission', async () => {
      const existingGrant = {
        id: 'grant-1',
        permission: {
          name: 'users',
          actions: ['read', 'write'],
        },
      } as Grant;
      grantRepository.findOne.mockResolvedValue(existingGrant);

      await expect(
        service.update('grant-1', { actions: ['invalid-action'] }, mockUserId),
      ).rejects.toThrow(
        new BadRequestException(
          "Actions [invalid-action] are not valid for permission 'users'",
        ),
      );
    });

    it('updates actions and emits rbac.changed event', async () => {
      const existingGrant = {
        id: 'grant-1',
        permission: {
          name: 'users',
          actions: ['read', 'write', 'delete'],
        },
        actions: ['read'],
      } as Grant;
      const updatedGrant = {
        ...existingGrant,
        actions: ['read', 'write'],
      } as Grant;

      grantRepository.findOne.mockResolvedValue(existingGrant);
      grantRepository.save.mockResolvedValue(updatedGrant);

      const result = await service.update(
        'grant-1',
        {
          actions: ['read', 'write'],
        },
        mockUserId,
      );

      expect(result).toBe(updatedGrant);
      expect(eventEmitter.changed).toHaveBeenCalled();
    });

    it('sets actions to null when empty actions array or empty update is passed', async () => {
      const existingGrant = {
        id: 'grant-1',
        permission: {
          name: 'users',
          actions: ['read', 'write'],
        },
        actions: ['read'],
      } as Grant;

      grantRepository.findOne.mockResolvedValue(existingGrant);
      grantRepository.save.mockImplementation(async (g) => g as Grant);

      await service.update('grant-1', { actions: [] }, mockUserId);

      expect(existingGrant.actions).toBeNull();
      expect(eventEmitter.changed).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes grant and emits rbac.changed event', async () => {
      const existingGrant = { id: 'grant-1' } as Grant;
      grantRepository.findOne.mockResolvedValue(existingGrant);

      await service.remove('grant-1', mockUserId);

      expect(grantRepository.remove).toHaveBeenCalledWith(existingGrant);
      expect(eventEmitter.changed).toHaveBeenCalled();
    });
  });
});
