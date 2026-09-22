import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Grant } from '../../infrastructure/entities/grant.entity';
import { Role } from '../../infrastructure/entities/role.entity';
import { AuditLogger } from '../../infrastructure/logging/logAudit';
import { RolesService } from '../roles.service';
import { ROLE_REPOSITORY } from '../ports/rbac-repositories.port';
import { RBAC_EVENTS } from '../ports/rbac-events.port';
import { RBAC_AUDIT } from '../ports/audit.port';

describe('RolesService', () => {
  let service: RolesService;
  let roleRepository: jest.Mocked<Repository<Role>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let auditLogger: jest.Mocked<AuditLogger>;

  beforeEach(async () => {
    roleRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn((dto) => dto as Role),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Role>>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    auditLogger = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditLogger>;
    roleRepository.findAll = roleRepository.find as never;
    roleRepository.findById = roleRepository.findOne as never;
    roleRepository.findByName = roleRepository.findOne as never;
    eventEmitter.changed = eventEmitter.emit as never;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: ROLE_REPOSITORY,
          useValue: roleRepository,
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

    service = module.get<RolesService>(RolesService);
  });

  const mockUserId = randomUUID();

  describe('findAll', () => {
    it('returns array of all roles', async () => {
      const mockRoles = [{ id: 'r1', name: 'admin' }] as Role[];
      roleRepository.find.mockResolvedValue(mockRoles);

      const result = await service.findAll();

      expect(result).toBe(mockRoles);
      expect(roleRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('returns role when found', async () => {
      const mockRole = { id: 'r1', name: 'admin' } as Role;
      roleRepository.findOne.mockResolvedValue(mockRole);

      const result = await service.findOne('r1');

      expect(result).toBe(mockRole);
      expect(roleRepository.findById).toHaveBeenCalledWith('r1');
    });

    it('throws NotFoundException when role does not exist', async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        new NotFoundException('Role with ID non-existent not found'),
      );
    });
  });

  describe('create', () => {
    it('throws ConflictException if role with name already exists', async () => {
      roleRepository.findOne.mockResolvedValue({
        id: 'existing-id',
        name: 'admin',
      } as Role);

      await expect(
        service.create(
          { name: 'admin', description: 'Administrator' },
          mockUserId,
        ),
      ).rejects.toThrow(
        new ConflictException('Role with name admin already exists'),
      );
    });

    it('creates, saves new role, and emits rbac.changed event', async () => {
      const dto = { name: 'admin', description: 'Administrator' };
      const createdRole = { id: 'r1', ...dto } as Role;

      roleRepository.findOne.mockResolvedValue(null);
      roleRepository.save.mockResolvedValue(createdRole);

      const result = await service.create(dto, mockUserId);

      expect(result).toBe(createdRole);
      expect(roleRepository.create).toHaveBeenCalledWith(dto);
      expect(roleRepository.save).toHaveBeenCalledWith(dto);
      expect(eventEmitter.changed).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws ConflictException if updated name conflicts with another existing role', async () => {
      const existingRole = { id: 'r1', name: 'admin' } as Role;
      roleRepository.findOne
        .mockResolvedValueOnce(existingRole) // for findOne(id)
        .mockResolvedValueOnce({ id: 'r2', name: 'editor' } as Role); // for name check

      await expect(
        service.update('r1', { name: 'editor' }, mockUserId),
      ).rejects.toThrow(
        new ConflictException('Role with name editor already exists'),
      );
    });

    it('updates role and emits rbac.changed event', async () => {
      const existingRole = {
        id: 'r1',
        name: 'admin',
        description: 'Old',
      } as Role;
      const updatedRole = { ...existingRole, description: 'New' } as Role;

      roleRepository.findOne.mockResolvedValue(existingRole);
      roleRepository.save.mockResolvedValue(updatedRole);

      const result = await service.update(
        'r1',
        { description: 'New' },
        mockUserId,
      );

      expect(result).toBe(updatedRole);
      expect(eventEmitter.changed).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException if role to remove is missing', async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('r1', mockUserId)).rejects.toThrow(
        new NotFoundException('Role with ID r1 not found'),
      );
    });

    it('throws ConflictException if role has active grants attached', async () => {
      const roleWithGrants = {
        id: 'r1',
        name: 'admin',
        grants: [{ id: 'g1' } as Grant],
      } as Role;

      roleRepository.findOne.mockResolvedValue(roleWithGrants);

      await expect(service.remove('r1', mockUserId)).rejects.toThrow(
        new ConflictException(
          'Cannot delete role with active grants. Remove grants first.',
        ),
      );
    });

    it('removes role and emits rbac.changed event when no active grants exist', async () => {
      const roleWithoutGrants = {
        id: 'r1',
        name: 'admin',
        grants: [],
        description: 'Admin',
      } as Role;

      roleRepository.findOne.mockResolvedValue(roleWithoutGrants);

      await service.remove('r1', mockUserId);

      expect(roleRepository.remove).toHaveBeenCalledWith(roleWithoutGrants);
      expect(eventEmitter.changed).toHaveBeenCalled();
    });
  });
});
