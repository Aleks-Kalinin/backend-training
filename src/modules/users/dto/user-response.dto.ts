import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '0c6300a2-46c4-4264-af41-7c493d242253' })
  userId!: string;

  @ApiProperty({ example: 'newuser@gmail.com' })
  email!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Public URL of the uploaded avatar, computed from its storage location, or null when no avatar is set. Set it only through PUT /users/{id}/photo.',
    example:
      'https://example.supabase.co/storage/v1/object/public/avatars/0c6300a2-46c4-4264-af41-7c493d242253/5f0c.webp',
  })
  photo!: string | null;
}
