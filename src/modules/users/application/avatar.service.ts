import { AuthTokenPayload } from '@/modules/auth/dto/auth-request.dto';
import { SystemRole } from '@/modules/rbac/domain/system-role.enum';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AvatarCleanupReason } from '../domain/avatar-cleanup';
import {
  AVATAR_OUTPUT_CONTENT_TYPE,
  AVATAR_OUTPUT_EXTENSION,
} from '../domain/avatar.constants';
import { User } from '../domain/entities/user.entity';
import { AvatarCleanupService } from './avatar-cleanup.service';
import type { AvatarImageProcessor } from './ports/avatar-image-processor.port';
import { AVATAR_IMAGE_PROCESSOR } from './ports/avatar-image-processor.port';
import type { AvatarStorage } from './ports/avatar-storage.port';
import { AVATAR_STORAGE } from './ports/avatar-storage.port';
import type { UserRepository } from './ports/user-repository.port';
import { USER_REPOSITORY } from './ports/user-repository.port';

export interface AvatarUploadFile {
  content: Buffer;
  mimetype: string;
}

type AvatarOperation = 'upload' | 'replace' | 'remove';

interface AvatarAuditParams {
  actorUserId: string;
  targetUserId: string;
  operation: AvatarOperation;
  status: number;
  bytes?: number;
}

interface UploadAvatarParams {
  userId: string;
  requestingUser: AuthTokenPayload;
  /**
   * Reads the uploaded file. Invoked only after the caller is authorized and
   * the target user exists, so unauthorized requests are never buffered.
   */
  readFile: () => Promise<AvatarUploadFile>;
}

interface RemoveAvatarParams {
  userId: string;
  requestingUser: AuthTokenPayload;
}

function statusOf(error: unknown): number {
  return error instanceof HttpException
    ? error.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly usersRepository: UserRepository,
    @Inject(AVATAR_STORAGE)
    private readonly avatarStorage: AvatarStorage,
    @Inject(AVATAR_IMAGE_PROCESSOR)
    private readonly imageProcessor: AvatarImageProcessor,
    private readonly avatarCleanupService: AvatarCleanupService,
  ) {}

  /**
   * Returns a copy of the user whose `photo` is the public avatar URL when an
   * uploaded avatar exists, otherwise the URL-based photo or `null`.
   */
  withResolvedPhoto(user: User): User {
    return {
      ...user,
      photo: user.avatarStoragePath
        ? this.avatarStorage.getPublicUrl(user.avatarStoragePath)
        : (user.photo ?? null),
    };
  }

  async uploadAvatar({
    userId,
    requestingUser,
    readFile,
  }: UploadAvatarParams): Promise<User> {
    const actorUserId = String(requestingUser.sub);
    let operation: AvatarOperation = 'upload';
    let bytes: number | undefined;

    try {
      const existing = await this.findAuthorizedUser(userId, requestingUser);
      if (existing.avatarStoragePath) {
        operation = 'replace';
      }

      const file = await readFile();
      const processed = await this.imageProcessor.process(
        file.content,
        file.mimetype,
      );
      bytes = processed.content.length;

      const storagePath = `${userId}/${randomUUID()}.${AVATAR_OUTPUT_EXTENSION}`;

      try {
        await this.avatarStorage.upload(
          storagePath,
          processed.content,
          AVATAR_OUTPUT_CONTENT_TYPE,
        );
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            event: 'AVATAR_STORAGE_UPLOAD',
            actorUserId,
            targetUserId: userId,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        );
        throw new InternalServerErrorException('Failed to store avatar');
      }

      let result: Awaited<ReturnType<UserRepository['updateAvatar']>>;
      try {
        result = await this.usersRepository.updateAvatar(userId, {
          avatarStoragePath: storagePath,
          photo: null,
        });
      } catch (error) {
        await this.avatarCleanupService.removeObject({
          storagePath,
          actorUserId,
          targetUserId: userId,
          reason: AvatarCleanupReason.ROLLBACK,
        });
        throw error;
      }

      if (!result) {
        // The account was deleted while the upload was in flight.
        await this.avatarCleanupService.removeObject({
          storagePath,
          actorUserId,
          targetUserId: userId,
          reason: AvatarCleanupReason.ROLLBACK,
        });
        throw new NotFoundException('User not found');
      }

      if (
        result.previousStoragePath &&
        result.previousStoragePath !== storagePath
      ) {
        operation = 'replace';
        await this.avatarCleanupService.removeObject({
          storagePath: result.previousStoragePath,
          actorUserId,
          targetUserId: userId,
          reason: AvatarCleanupReason.REPLACE,
        });
      }

      this.logAvatarAudit({
        actorUserId,
        targetUserId: userId,
        operation,
        status: HttpStatus.OK,
        bytes,
      });

      return this.withResolvedPhoto(result.user);
    } catch (error) {
      this.logAvatarAudit({
        actorUserId,
        targetUserId: userId,
        operation,
        status: statusOf(error),
        bytes,
      });
      throw error;
    }
  }

  async removeAvatar({
    userId,
    requestingUser,
  }: RemoveAvatarParams): Promise<User> {
    const actorUserId = String(requestingUser.sub);

    try {
      await this.findAuthorizedUser(userId, requestingUser);

      const result = await this.usersRepository.updateAvatar(userId, {
        avatarStoragePath: null,
        photo: null,
      });

      if (!result) {
        throw new NotFoundException('User not found');
      }

      if (result.previousStoragePath) {
        await this.avatarCleanupService.removeObject({
          storagePath: result.previousStoragePath,
          actorUserId,
          targetUserId: userId,
          reason: AvatarCleanupReason.REMOVE,
        });
      }

      this.logAvatarAudit({
        actorUserId,
        targetUserId: userId,
        operation: 'remove',
        status: HttpStatus.OK,
      });

      return this.withResolvedPhoto(result.user);
    } catch (error) {
      this.logAvatarAudit({
        actorUserId,
        targetUserId: userId,
        operation: 'remove',
        status: statusOf(error),
      });
      throw error;
    }
  }

  private async findAuthorizedUser(
    userId: string,
    requestingUser: AuthTokenPayload,
  ): Promise<User> {
    const isSelf = userId === String(requestingUser.sub);
    const isAdmin = requestingUser.roles.includes(SystemRole.ADMIN);

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private logAvatarAudit({
    actorUserId,
    targetUserId,
    operation,
    status,
    bytes,
  }: AvatarAuditParams) {
    this.logger.log(
      JSON.stringify({
        event: 'AVATAR',
        actorUserId,
        targetUserId,
        operation,
        status,
        bytes: bytes ?? null,
      }),
    );
  }
}
