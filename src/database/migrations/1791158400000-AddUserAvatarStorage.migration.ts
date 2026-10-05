import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds uploaded-avatar support:
 * - `users.avatarStoragePath`: bucket-relative key of the uploaded avatar.
 * - `avatar_cleanup_tasks`: storage objects whose deletion must be retried.
 *
 * Statements are idempotent because existing environments may already have
 * the schema from `POSTGRES_SYNCHRONIZE`.
 */
export class AddUserAvatarStorage1791158400000 implements MigrationInterface {
  name = 'AddUserAvatarStorage1791158400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarStoragePath" character varying(512)`,
    );

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "avatar_cleanup_tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "storagePath" character varying(512) NOT NULL,
        "userId" uuid,
        "reason" character varying(32) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "lastError" character varying(500),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_avatar_cleanup_tasks_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_avatar_cleanup_tasks_userId" ON "avatar_cleanup_tasks" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_avatar_cleanup_tasks_userId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "avatar_cleanup_tasks"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "avatarStoragePath"`,
    );
  }
}
