export type AuthTokenPayload = {
  sub: string;
  email: string;
  roles: string[];
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type SignedTokenPayload = AuthTokenPayload;
