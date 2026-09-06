import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateGrantDto {
  @ApiProperty({ example: 'f8c3230a-9dbe-4061-9c88-123456789abc' })
  @IsUUID()
  roleId!: string;

  @ApiProperty({ example: 'f8c3230a-9dbe-4061-9c88-123456789abc' })
  @IsUUID()
  permissionId!: string;

  @ApiPropertyOptional({
    example: ['create', 'read'],
    description:
      'List of allowed actions for this grant. If not provided, all actions from the permission will be granted.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];
}
