import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes `users.photo` the only avatar column: it now stores the
 * bucket-relative storage path of the uploaded avatar (`{userId}/{uuid}.webp`)
 * or `null`.
 *
 * - Copies `users.avatarStoragePath` into `photo`, then drops it.
 * - Clears any remaining legacy external photo URLs. They are intentionally
 *   discarded, not fetched or imported, and cannot be restored by `down`.
 *
 * Statements are idempotent because existing environments may already have
 * the schema from `POSTGRES_SYNCHRONIZE`.
 */
export class MoveAvatarPathToPhoto1791244800000 implements MigrationInterface {
  name = 'MoveAvatarPathToPhoto1791244800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo" character varying(255)`,
    );

    if (await queryRunner.hasColumn('users', 'avatarStoragePath')) {
      await queryRunner.query(
        `UPDATE "users" SET "photo" = "avatarStoragePath"`,
      );
      await queryRunner.query(
        `ALTER TABLE "users" DROP COLUMN "avatarStoragePath"`,
      );
    }

    // Anything that is not an uploaded-avatar path owned by the user is a
    // legacy URL-based photo.
    await queryRunner.query(
      `UPDATE "users" SET "photo" = NULL
       WHERE "photo" IS NOT NULL
         AND "photo" !~ ('^' || "userId"::text || '/[0-9a-f-]{36}\\.webp$')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarStoragePath" character varying(512)`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "avatarStoragePath" = "photo", "photo" = NULL`,
    );
  }
}
