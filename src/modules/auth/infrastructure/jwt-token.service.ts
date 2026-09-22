import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@/core/config/config.service';
import type { AuthTokenService } from '../application/ports/token-service.port';
import type { AuthTokenPayload, TokenPair } from '../domain/auth.types';
import { TOKEN_TTL } from '../presentation/constants/auth.constants';

@Injectable()
export class JwtTokenService implements AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async generateTokenPair(payload: AuthTokenPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: TOKEN_TTL.ACCESS_TOKEN_SECONDS,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: TOKEN_TTL.REFRESH_TOKEN_SECONDS,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  verifyRefreshToken(token: string): Promise<AuthTokenPayload> {
    return this.jwtService.verifyAsync<AuthTokenPayload>(token, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
    });
  }
}
