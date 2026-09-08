import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './application/users.service';
import { User } from './infrastructure/entity/user.entity';
import { UsersContoller } from './presentation/users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersContoller],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
