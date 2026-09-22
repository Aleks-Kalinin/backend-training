import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRoleRepository } from '../../application/ports/role-repository.port';
import { UserRole } from '../../domain/entities/user.entity';
import { SystemRole } from '../../../rbac/domain/system-role.enum';
import { Role } from '../../../rbac/infrastructure/entities/role.entity';

@Injectable()
export class TypeOrmUserRoleRepository implements UserRoleRepository {
  constructor(
    @InjectRepository(Role)
    private readonly repository: Repository<Role>,
  ) {}

  async findDefaultRole(): Promise<UserRole | null> {
    const role = await this.repository.findOne({
      where: { name: SystemRole.USER },
    });
    return role ? { id: role.id, name: role.name } : null;
  }
}
