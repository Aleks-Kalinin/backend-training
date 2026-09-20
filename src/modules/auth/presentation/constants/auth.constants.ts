/**
 * Cookie names used for storing JWT tokens.
 */
export const AUTH_COOKIES = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
} as const;

/**
 * Token TTLs in seconds.
 */
export const TOKEN_TTL = {
  ACCESS_TOKEN_SECONDS: 15 * 60, // 15 minutes
  REFRESH_TOKEN_SECONDS: 30 * 24 * 60 * 60, // 30 days
} as const;
