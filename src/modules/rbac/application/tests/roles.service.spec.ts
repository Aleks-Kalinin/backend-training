import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grant } from '../../infrastructure/entities/grant.entity';
import { Role } from '../../infrastructure/entities/role.entity';
import { RolesService } from '../roles.service';

describe('RolesService', () => {
  let service: RolesService;
  let roleRepository: jest.Mocked<Repository<Role>>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    roleRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto as Role),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Role>>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: getRepositoryToken(Role),
          useValue: roleRepository,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

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
      expect(roleRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'r1' },
      });
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
        service.create({ name: 'admin', description: 'Administrator' }),
      ).rejects.toThrow(
        new ConflictException('Role with name admin already exists'),
      );
    });

    it('creates, saves new role, and emits rbac.changed event', async () => {
      const dto = { name: 'admin', description: 'Administrator' };
      const createdRole = { id: 'r1', ...dto } as Role;

      roleRepository.findOne.mockResolvedValue(null);
      roleRepository.save.mockResolvedValue(createdRole);

      const result = await service.create(dto);

      expect(result).toBe(createdRole);
      expect(roleRepository.create).toHaveBeenCalledWith(dto);
      expect(roleRepository.save).toHaveBeenCalledWith(dto);
      expect(eventEmitter.emit).toHaveBeenCalledWith('rbac.changed');
    });
  });

  describe('update', () => {
    it('throws ConflictException if updated name conflicts with another existing role', async () => {
      const existingRole = { id: 'r1', name: 'admin' } as Role;
      roleRepository.findOne
        .mockResolvedValueOnce(existingRole) // for findOne(id)
        .mockResolvedValueOnce({ id: 'r2', name: 'editor' } as Role); // for name check

      await expect(service.update('r1', { name: 'editor' })).rejects.toThrow(
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

      const result = await service.update('r1', { description: 'New' });

      expect(result).toBe(updatedRole);
      expect(eventEmitter.emit).toHaveBeenCalledWith('rbac.changed');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException if role to remove is missing', async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('r1')).rejects.toThrow(
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

      await expect(service.remove('r1')).rejects.toThrow(
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
      } as Role;

      roleRepository.findOne.mockResolvedValue(roleWithoutGrants);

      await service.remove('r1');

      expect(roleRepository.remove).toHaveBeenCalledWith(roleWithoutGrants);
      expect(eventEmitter.emit).toHaveBeenCalledWith('rbac.changed');
    });
  });
});
