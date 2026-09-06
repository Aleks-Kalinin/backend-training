import { AuthenticatedRequest } from '@/modules/auth/dto/auth-request.dto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacCacheService } from './application/rbac-cache.service';
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
    const requirement = this.reflector.getAllAndOverride<RbacRequirement>(
      RBAC_REQUIREMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User authentication context missing');
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
