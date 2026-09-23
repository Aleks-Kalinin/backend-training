import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class PaginatedUsersResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  items!: UserResponseDto[];

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'Opaque cursor for the next page, or null on the last page',
  })
  nextCursor!: string | null;
}
