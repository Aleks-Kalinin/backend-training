import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';

export type AuthTokenPayload = {
  sub: number;
  email: string;
  roles: string[];
};

export type AuthenticatedRequest = FastifyRequest & {
  user?: AuthTokenPayload;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload =
        await this.jwtService.verifyAsync<AuthTokenPayload>(token);

      request.user = payload;
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const authorization: unknown = request.headers.authorization;

    if (typeof authorization !== 'string') {
      return undefined;
    }

    const [type, token] = authorization.split(' ');

    return type === 'Bearer' && token ? token : undefined;
  }
}
