import fastifyMultipart from '@fastify/multipart';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { HttpException } from '@nestjs/common';
import Fastify, { FastifyInstance } from 'fastify';
import { AVATAR_MAX_FILE_SIZE } from '../domain/avatar.constants';
import { readAvatarUpload } from './avatar-upload.reader';

const BOUNDARY = '----avatar-test-boundary';

type Part =
  | { kind: 'field'; name: string; value: string }
  | {
      kind: 'file';
      name: string;
      filename: string;
      type: string;
      content: Buffer;
    };

function multipartBody(parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n`));
    if (part.kind === 'field') {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`,
        ),
      );
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.type}\r\n\r\n`,
        ),
        part.content,
        Buffer.from('\r\n'),
      );
    }
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const file = (content: Buffer, name = 'file'): Part => ({
  kind: 'file',
  name,
  filename: 'avatar.png',
  type: 'image/png',
  content,
});

describe('readAvatarUpload', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    // Global limit deliberately differs from the avatar limit.
    await app.register(fastifyMultipart, { limits: { fileSize: 1024 } });
    app.put('/photo', async (req, reply) => {
      try {
        const upload = await readAvatarUpload(req);
        return { size: upload.content.length, mimetype: upload.mimetype };
      } catch (error) {
        if (error instanceof HttpException) {
          return reply.status(error.getStatus()).send(error.getResponse());
        }
        throw error;
      }
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const send = (parts: Part[]) =>
    app.inject({
      method: 'PUT',
      url: '/photo',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody(parts),
    });

  it('returns the single uploaded file, ignoring extra fields', async () => {
    const res = await send([
      { kind: 'field', name: 'note', value: 'hello' },
      file(Buffer.alloc(4096, 1)),
    ]);

    // 4 KiB exceeds the 1 KiB global limit: the avatar limit applies instead.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ size: 4096, mimetype: 'image/png' });
  });

  it('accepts a file exactly at the 5 MiB limit', async () => {
    const res = await send([file(Buffer.alloc(AVATAR_MAX_FILE_SIZE, 1))]);
    expect(res.statusCode).toBe(200);
  });

  it('rejects a file over the 5 MiB limit with 413', async () => {
    const res = await send([file(Buffer.alloc(AVATAR_MAX_FILE_SIZE + 1, 1))]);
    expect(res.statusCode).toBe(413);
  });

  it.each([
    ['no file', [{ kind: 'field', name: 'note', value: 'x' } as Part]],
    ['two files', [file(Buffer.from('a')), file(Buffer.from('b'))]],
    ['an empty file', [file(Buffer.alloc(0))]],
    ['a file in the wrong field', [file(Buffer.from('a'), 'avatar')]],
  ])('rejects %s with 400', async (_label, parts) => {
    const res = await send(parts);
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-multipart requests with 415', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/photo',
      payload: { file: 'x' },
    });
    expect(res.statusCode).toBe(415);
  });
});
