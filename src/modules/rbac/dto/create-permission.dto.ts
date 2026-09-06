import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'users',
    description: 'Unique name of the permission',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: ['create', 'read', 'update', 'delete'],
    description: 'List of allowed actions for this resource',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  actions!: string[];
}
