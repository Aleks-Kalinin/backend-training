import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationService } from './application/verification.service';
import { VERIFICATION_PASSWORD_HASHER } from './application/ports/password-hasher.port';
import { VERIFICATION_REPOSITORY } from './application/ports/verification-repository.port';
import { VERIFICATION_RUNTIME_ENVIRONMENT } from './application/ports/runtime-environment.port';
import { VerificationToken } from './infrastructure/entity/verification-token.entity';
import { BcryptVerificationPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { TypeOrmVerificationRepository } from './infrastructure/repositories/typeorm-verification.repository';
import { NodeVerificationRuntimeEnvironment } from './infrastructure/node-runtime-environment';

@Module({
  imports: [TypeOrmModule.forFeature([VerificationToken])],
  providers: [
    VerificationService,
    TypeOrmVerificationRepository,
    BcryptVerificationPasswordHasher,
    NodeVerificationRuntimeEnvironment,
    {
      provide: VERIFICATION_REPOSITORY,
      useExisting: TypeOrmVerificationRepository,
    },
    {
      provide: VERIFICATION_PASSWORD_HASHER,
      useExisting: BcryptVerificationPasswordHasher,
    },
    {
      provide: VERIFICATION_RUNTIME_ENVIRONMENT,
      useExisting: NodeVerificationRuntimeEnvironment,
    },
  ],
  exports: [VerificationService],
})
export class VerificationModule {}
