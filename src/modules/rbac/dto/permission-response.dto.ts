import { ApiProperty } from '@nestjs/swagger';
import { Permission } from '../infrastructure/entities/permission.entity';

export class PermissionResponseDto {
  @ApiProperty({ example: 'f8c3230a-9dbe-4061-9c88-123456789abc' })
  id!: string;

  @ApiProperty({ example: 'users' })
  name!: string;

  @ApiProperty({
    example: ['create', 'read', 'update', 'delete'],
    type: [String],
  })
  actions!: string[];

  static fromEntity(entity: Permission): PermissionResponseDto {
    const dto = new PermissionResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.actions = entity.actions;
    return dto;
  }
}
