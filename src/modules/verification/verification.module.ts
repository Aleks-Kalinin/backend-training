import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationService } from './application/verification.service';
import { VerificationToken } from './infrastructure/entity/verification-token.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VerificationToken])],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
