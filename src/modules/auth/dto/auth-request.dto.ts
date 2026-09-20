import { FastifyRequest } from 'fastify';
import { UUID } from 'node:crypto';

export type AuthTokenPayload = {
  sub: UUID;
  email: string;
  roles: string[];
};

export type AuthenticatedRequest = FastifyRequest & {
  user: AuthTokenPayload;
};
