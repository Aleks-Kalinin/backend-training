import { INestApplication, VersioningType } from '@nestjs/common';

export const API_PREFIX = 'api';
export const API_VERSION = '1';
export const API_BASE_PATH = `/${API_PREFIX}/v${API_VERSION}`;

export function configureApiRouting(app: INestApplication) {
  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });
}
