import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';

export class VerifyRegistrationDto {
  @ApiProperty({
    example: '0c6300a2-46c4-4264-af41-7c493d242253',
  })
  @IsUUID()
  attemptId!: string;

  @ApiProperty({
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}
