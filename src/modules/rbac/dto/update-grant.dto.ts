import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateGrantDto {
  @ApiPropertyOptional({
    example: ['read', 'update'],
    description:
      'Updated subset of actions. Pass empty array or null to grant all actions.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];
}
