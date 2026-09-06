import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Grant } from '../infrastructure/entities/grant.entity';

export class GrantResponseDto {
  @ApiProperty({ example: 'b52a1234-cde6-7890-1234-567890fedcba' })
  id!: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef' })
  roleId!: string;

  @ApiProperty({ example: 'Admin' })
  roleName!: string;

  @ApiProperty({ example: 'f8c3230a-9dbe-4061-9c88-123456789abc' })
  permissionId!: string;

  @ApiProperty({ example: 'users' })
  permissionName!: string;

  @ApiPropertyOptional({ example: ['create', 'read'], type: [String] })
  actions?: string[];

  static fromEntity(entity: Grant): GrantResponseDto {
    const dto = new GrantResponseDto();
    dto.id = entity.id;
    dto.roleId = entity.role.id;
    dto.roleName = entity.role.name;
    dto.permissionId = entity.permission.id;
    dto.permissionName = entity.permission.name;
    dto.actions = entity.actions || [];
    return dto;
  }
}
