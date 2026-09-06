import { FastifyRequest } from 'fastify';

export type AuthTokenPayload = {
  sub: number;
  email: string;
  roles: string[];
};

export type AuthenticatedRequest = FastifyRequest & {
  user?: AuthTokenPayload;
};
