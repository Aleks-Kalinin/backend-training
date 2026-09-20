import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { UsersService } from '../users/application/users.service';
import { UserStatus } from '../users/domain/user-status.enum';
import { AuthTokenPayload, AuthenticatedRequest } from './dto/auth-request.dto';
import { AUTH_COOKIES } from './presentation/constants/auth.constants';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromCookie(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: AuthTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token);
    } catch {
      this.logger.warn(
        'JWT validation failed — invalid signature or token expired',
      );
      throw new UnauthorizedException();
    }

    // Verify the user still exists and is in active/unblocked status
    const user = await this.usersService.getUser(String(payload.sub));
    if (!user || user.status !== UserStatus.ACTIVE) {
      this.logger.warn(
        `Access denied for user ${String(payload.sub)}: account not active`,
      );
      throw new UnauthorizedException();
    }

    request.user = payload;
    return true;
  }

  private extractTokenFromCookie(request: FastifyRequest): string | undefined {
    const cookies = request.cookies as Record<string, string | undefined>;
    return cookies[AUTH_COOKIES.ACCESS_TOKEN];
  }
}
