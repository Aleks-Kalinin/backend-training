import { ApiProperty } from '@nestjs/swagger';

export enum UserStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

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

export interface CreateUserData {
  email: string;
  password: string;
  isVerified?: boolean;
  status?: UserStatus;
}

export interface UpdateUserData {
  isVerified?: boolean;
  status?: UserStatus;
  password?: string;
}
