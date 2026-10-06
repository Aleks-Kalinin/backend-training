import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AvatarUploadFile } from '../application/avatar.service';
import {
  AVATAR_MAX_FILE_SIZE,
  AVATAR_MULTIPART_FIELD,
} from '../domain/avatar.constants';

/** Upper bound on non-file form fields, which are ignored. */
const MAX_IGNORED_FIELDS = 10;

function multipartErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Reads exactly one avatar file from a multipart request. The avatar size
 * limit is applied per request, so global multipart limits used by other
 * endpoints are unaffected, and oversized files are rejected while
 * streaming instead of being buffered in full.
 */
export async function readAvatarUpload(
  req: FastifyRequest,
): Promise<AvatarUploadFile> {
  if (!req.isMultipart()) {
    throw new UnsupportedMediaTypeException(
      'Request must be multipart/form-data',
    );
  }

  let upload: AvatarUploadFile | undefined;

  try {
    const parts = req.parts({
      limits: {
        fileSize: AVATAR_MAX_FILE_SIZE,
        files: 1,
        fields: MAX_IGNORED_FIELDS,
        parts: MAX_IGNORED_FIELDS + 1,
      },
    });

    for await (const part of parts) {
      if (part.type !== 'file') {
        continue;
      }

      if (part.fieldname !== AVATAR_MULTIPART_FIELD) {
        part.file.resume();
        throw new BadRequestException(
          `File must be sent in the "${AVATAR_MULTIPART_FIELD}" field`,
        );
      }

      upload = { content: await part.toBuffer(), mimetype: part.mimetype };
    }
  } catch (error) {
    switch (multipartErrorCode(error)) {
      case 'FST_REQ_FILE_TOO_LARGE':
        throw new PayloadTooLargeException(
          'Avatar exceeds the 5 MiB size limit',
        );
      case 'FST_FILES_LIMIT':
        throw new BadRequestException('Exactly one file must be uploaded');
      case 'FST_PARTS_LIMIT':
      case 'FST_FIELDS_LIMIT':
        throw new BadRequestException('Too many form fields');
      default:
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException('Malformed multipart request');
    }
  }

  if (!upload) {
    throw new BadRequestException('An image file is required');
  }

  if (upload.content.length === 0) {
    throw new BadRequestException('Uploaded file is empty');
  }

  return upload;
}
