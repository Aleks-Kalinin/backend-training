import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Grant } from '../../infrastructure/entities/grant.entity';
import { Permission } from '../../infrastructure/entities/permission.entity';
import { Role } from '../../infrastructure/entities/role.entity';
import { AuditLogger } from '../../infrastructure/logging/logAudit';
import { GrantsService } from '../grants.service';

describe('GrantsService', () => {
  let service: GrantsService;
  let grantRepository: jest.Mocked<Repository<Grant>>;
  let roleRepository: jest.Mocked<Repository<Role>>;
  let permissionRepository: jest.Mocked<Repository<Permission>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let auditLogger: jest.Mocked<AuditLogger>;

  beforeEach(async () => {
    grantRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto as Grant),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Grant>>;

    roleRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Role>>;

    permissionRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Permission>>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    auditLogger = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditLogger>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrantsService,
        {
          provide: getRepositoryToken(Grant),
          useValue: grantRepository,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: roleRepository,
        },
        {
          provide: getRepositoryToken(Permission),
          useValue: permissionRepository,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: AuditLogger,
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
      expect(grantRepository.find).toHaveBeenCalledWith({
        relations: ['role', 'permission'],
      });
    });
  });

  describe('findOne', () => {
    it('returns grant when found', async () => {
      const mockGrant = { id: 'grant-1' } as Grant;
      grantRepository.findOne.mockResolvedValue(mockGrant);

      const result = await service.findOne('grant-1', mockUserId);

      expect(result).toBe(mockGrant);
      expect(grantRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'grant-1' },
        relations: ['role', 'permission'],
      });
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('rbac.changed');
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('rbac.changed');
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
      expect(eventEmitter.emit).toHaveBeenCalledWith('rbac.changed');
    });
  });

  describe('remove', () => {
    it('removes grant and emits rbac.changed event', async () => {
      const existingGrant = { id: 'grant-1' } as Grant;
      grantRepository.findOne.mockResolvedValue(existingGrant);

      await service.remove('grant-1', mockUserId);

      expect(grantRepository.remove).toHaveBeenCalledWith(existingGrant);
      expect(eventEmitter.emit).toHaveBeenCalledWith('rbac.changed');
    });
  });
});
