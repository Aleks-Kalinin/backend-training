import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../infrastructure/entities/role.entity';

export class RoleResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef' })
  id!: string;

  @ApiProperty({ example: 'Admin' })
  name!: string;

  @ApiPropertyOptional({ example: 'Administrator with full access' })
  description?: string;

  // Static mapper to easily convert the raw DB Entity to our clean DTO
  static fromEntity(entity: Role): RoleResponseDto {
    const dto = new RoleResponseDto();
    dto.id = entity.id;
    dto.name = entity.name;
    dto.description = entity.description;
    return dto;
  }
}
