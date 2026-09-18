import { ConfigService } from '@/core/config/config.service';
import { forwardRef, Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { VerificationModule } from '../verification/verification.module';
import { AuthService } from './application/auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './presentation/auth.controller';
import { TOKEN_TTL } from './presentation/constants/auth.constants';

@Global()
@Module({
  imports: [
    UsersModule,
    forwardRef(() => SettingsModule),
    VerificationModule,
    MailModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: TOKEN_TTL.ACCESS_TOKEN_SECONDS },
      }),
    }),
  ],
  providers: [AuthService, AuthGuard],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard, UsersModule],
})
export class AuthModule {}
