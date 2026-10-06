import { ConfigService } from '@/core/config/config.service';
import { Injectable } from '@nestjs/common';
import { StorageClient } from '@supabase/storage-js';
import { AvatarStorage } from '../../application/ports/avatar-storage.port';

/** Object keys are unique per upload, so public copies can be cached for a year. */
const AVATAR_CACHE_CONTROL_SECONDS = '31536000';

export class AvatarStorageError extends Error {
  constructor(operation: 'upload' | 'remove', reason: string) {
    super(`Avatar storage ${operation} failed: ${reason}`);
    this.name = 'AvatarStorageError';
  }
}

/**
 * Supabase Storage adapter. Uses the service-role key, so it must only ever
 * run server-side; the key is never included in responses or logs.
 */
@Injectable()
export class SupabaseAvatarStorage implements AvatarStorage {
  private readonly client: StorageClient;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const url = config.get('SUPABASE_URL');
    const serviceRoleKey = config.get('SUPABASE_SERVICE_ROLE_KEY');
    const bucket = config.get('SUPABASE_AVATARS_BUCKET');

    if (!url || !serviceRoleKey || !bucket) {
      throw new Error(
        'Supabase avatar storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_AVATARS_BUCKET.',
      );
    }

    this.bucket = bucket;
    this.client = new StorageClient(`${url.replace(/\/+$/, '')}/storage/v1`, {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    });
  }

  async upload(
    storagePath: string,
    content: Buffer,
    contentType: string,
  ): Promise<void> {
    const { error } = await this.client
      .from(this.bucket)
      .upload(storagePath, content, {
        contentType,
        upsert: false,
        cacheControl: AVATAR_CACHE_CONTROL_SECONDS,
      });

    if (error) {
      throw new AvatarStorageError('upload', error.message);
    }
  }

  async remove(storagePath: string): Promise<void> {
    const { error } = await this.client.from(this.bucket).remove([storagePath]);

    if (error) {
      throw new AvatarStorageError('remove', error.message);
    }
  }

  getPublicUrl(storagePath: string): string {
    return this.client.from(this.bucket).getPublicUrl(storagePath).data
      .publicUrl;
  }
}
