import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserData, UpdateUserData } from '../dto/users.dto';
import { User } from '../infrastructure/entity/users.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findOne(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async createUser({
    email,
    password,
    status,
    isVerified,
  }: CreateUserData): Promise<User> {
    const newUser = this.usersRepository.create({
      email: email.trim().toLowerCase(),
      password,
      status,
      isVerified,
    });
    return this.usersRepository.save(newUser);
  }

  async updateUser(userId: string, updateData: UpdateUserData): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { userId } });
    if (!user) {
      throw new Error('User not found');
    }

    Object.assign(user, updateData);
    return this.usersRepository.save(user);
  }
}
