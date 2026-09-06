import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../infrastructure/entity/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findOne(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.trim().toLowerCase() },
      relations: ['roles'],
    });
  }

  async createUser({
    email,
    password,
    status,
    isVerified,
  }: CreateUserDto): Promise<User> {
    const newUser = this.usersRepository.create({
      email: email.trim().toLowerCase(),
      password,
      status,
      isVerified,
    });
    return this.usersRepository.save(newUser);
  }

  async updateUser(userId: string, updateData: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { userId } });
    if (!user) {
      throw new Error('User not found');
    }

    Object.assign(user, updateData);
    return this.usersRepository.save(user);
  }
}
