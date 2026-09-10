import { AuthenticatedRequest } from '@/modules/auth/dto/auth-request.dto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacCacheService } from './application/rbac-cache.service';
import { ALLOW_SELF_KEY } from './presentation/decorators/allow-self.decorator';
import {
  RBAC_REQUIREMENT_KEY,
  RbacRequirement,
} from './presentation/decorators/require-permission.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacCacheService: RbacCacheService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User authentication context missing');
    }

    const allowSelfParam = this.reflector.getAllAndOverride<string>(
      ALLOW_SELF_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowSelfParam) {
      const params = request.params as Record<string, unknown>;
      const body = request.body as Record<string, unknown>;
      const targetUserId = params?.[allowSelfParam] ?? body?.[allowSelfParam];

      const isValidId =
        typeof targetUserId === 'string' ||
        typeof targetUserId === 'number' ||
        typeof targetUserId === 'bigint';

      if (isValidId && String(user.sub) === String(targetUserId)) {
        return true;
      }
    }

    const requirement = this.reflector.getAllAndOverride<RbacRequirement>(
      RBAC_REQUIREMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) {
      return true;
    }

    const userRoles: string[] = user.roles || [];

    const isAllowed = this.rbacCacheService.hasPermission(
      userRoles,
      requirement.permission,
      requirement.action,
    );

    if (!isAllowed) {
      throw new ForbiddenException('Insufficent permissions');
    }

    return true;
  }
}
