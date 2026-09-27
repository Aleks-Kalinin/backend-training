import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
} from 'typeorm-transactional';

import { ConfigModule } from '@/core/config/config.module';
import { ConfigService } from '@/core/config/config.service';
import { assertTestDatabaseTarget } from './test-database-guard';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get('POSTGRES_HOST');
        const database = config.get('POSTGRES_DB');

        assertTestDatabaseTarget({
          nodeEnv: config.get('NODE_ENV'),
          host,
          database,
        });

        return {
          type: 'postgres',

          host,
          port: Number(config.get('POSTGRES_PORT')),
          username: config.get('POSTGRES_USER'),
          password: config.get('POSTGRES_PASSWORD'),
          database,

          entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
          autoLoadEntities: true,

          migrationsTableName: 'migrations',
          migrations: [
            __dirname + '/../../database/migrations/*.migration{.ts,.js}',
          ],
          migrationsRun:
            String(config.get('POSTGRES_MIGRATIONS_RUN')) === 'true',

          synchronize: String(config.get('POSTGRES_SYNCHRONIZE')) === 'true',
          logging: String(config.get('POSTGRES_LOGGING')) === 'true',
        };
      },
      dataSourceFactory(options) {
        if (!options) {
          throw new Error('Invalid options passed');
        }

        deleteDataSourceByName('default');

        return Promise.resolve(
          addTransactionalDataSource(new DataSource(options)),
        );
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
