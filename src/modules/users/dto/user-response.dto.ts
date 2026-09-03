import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: '0c6300a2-46c4-4264-af41-7c493d242253',
  })
  userId!: string;

  @ApiProperty({
    example: 'newuser@gmail.com',
  })
  email!: string;
}
