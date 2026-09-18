import { ApiProperty } from '@nestjs/swagger';

/**
 * Generic success response for authentication endpoints.
 * Tokens are NOT included in the response body — they are set
 * as HTTP-Only cookies (`access_token` and `refresh_token`).
 */
export class AuthResponseDto {
  @ApiProperty({
    example: 'Login successful',
    description: 'Human-readable status message',
  })
  message!: string;
}
