# Feature: Profile Avatar Upload

## 1. Overview

- **Purpose:** Let a user upload, replace, or remove their profile avatar while preserving the existing URL-based profile update behavior.
- **Target Roles:**
  - **Self:** May manage their own avatar.
  - **Admin:** May manage an avatar for any user when authorized to update that user's profile.
- **Dependencies:** Authentication and RBAC modules, `@fastify/multipart`, Sharp image processing, Supabase Storage, and the user repository.
- **Storage Provider:** Supabase Storage. Use a dedicated `avatars` bucket. The bucket may allow public reads for display, but writes and deletes must be performed by the backend using a server-only service-role credential.

## 2. Data & Storage Contract

- Store uploaded objects under an opaque, server-generated key, scoped to the user (for example, `{userId}/{uuid}.webp`). Never use the supplied filename as a storage key.
- Add a nullable `avatarStoragePath` field to the user record for the object's bucket-relative path. Add the corresponding database migration.
- Keep the existing `photo` field and its URL-based PATCH behavior for backward compatibility. The profile response's `photo` value is the Supabase public URL when `avatarStoragePath` is set; otherwise it is the existing `photo` URL or `null`.
- A successful file upload supersedes any existing URL-based photo. A successful URL-based `PATCH` of `photo` clears `avatarStoragePath` and removes its old object after the database update succeeds. The response must not expose the storage service-role key or any private credentials.
- Do not persist image bytes or absolute local paths in the database. Do not log object contents, credentials, or signed URLs.

## 3. Technical Contract

### 3.1 Upload Avatar

- **Endpoint:** `PUT /users/{userId}/photo`
- **Content-Type:** `multipart/form-data`
- **Input:**
  - `file` (binary, required): One JPEG, PNG, or WebP image.
- **Access:** Authenticated user. The caller may target their own account; an administrator may target another account only with the existing user-update permission.
- **Validation Rules:**
  1. Require exactly one non-empty image file.
  2. Limit the uploaded file to 5 MiB and reject unsupported media types with `415 Unsupported Media Type`.
  3. Verify the file's actual image format from its contents; do not trust the client-provided MIME type or filename.
  4. Decode and re-encode with Sharp to WebP, strip metadata, and enforce a maximum output dimension of 1024 by 1024 pixels while preserving aspect ratio.
  5. Reject corrupt or invalid image data. Apply an appropriate pixel limit to protect against decompression bombs.
- **Execution Logic:**
  1. Authenticate and authorize the caller, then verify the target user exists.
  2. Validate and process the file before storage.
  3. Upload to the `avatars` bucket using the generated key and `image/webp` content type.
  4. Update `avatarStoragePath` only after the upload succeeds.
  5. If updating the user record fails, attempt to delete the newly uploaded object and propagate the original failure.
  6. After the database update succeeds, remove the previous avatar object, if any. A cleanup failure must be logged without losing the new avatar reference, and must be retryable or otherwise observable for later cleanup.
  7. Return the updated profile using the standard profile response shape, with `photo` set to the new public URL.

### 3.2 Remove Avatar

- **Endpoint:** `DELETE /users/{userId}/photo`
- **Access:** Same self/admin authorization as the upload endpoint.
- **Execution Logic:**
  1. Authenticate and authorize the caller, then verify the target user exists.
  2. Clear `avatarStoragePath` and the URL-based `photo` field.
  3. Remove the previous uploaded object, if any. If storage deletion fails, log the failure and ensure it can be retried or otherwise detected.
  4. Return the updated profile with `photo: null`.
- Removing an avatar is idempotent: deleting when no photo is set succeeds with `photo: null`.

### 3.3 Existing URL-Based Profile Update

- Preserve `PATCH /users/{userId}` and its current JSON contract, including support for setting `photo` to a URL.
- When a valid `photo` URL is supplied, store it as the URL-based photo, clear the uploaded-object reference, and clean up the replaced uploaded object after saving the user record.
- Do not fetch or proxy arbitrary user-supplied photo URLs from the backend. Validate the URL according to the existing DTO policy and allow only `http` or `https` schemes.

## 4. Configuration & Operations

- Configure the Supabase project URL, service-role key, and bucket name through server-side environment variables. Add variable names (not secrets) to `.env.example`; do not commit real credentials.
- Fail application startup clearly when Supabase configuration is required but missing or invalid. Never fall back silently to local disk or expose the service-role key to clients.
- Configure the `avatars` bucket to allow public object reads, allow only the supported image content types, and enforce the upload size limit. Do not grant public anonymous upload or delete access.
- Keep avatar upload limits separate from global multipart limits where possible, so changing this endpoint does not unintentionally change conversion upload behavior.
- Supabase free-plan quotas and inactivity behavior are provider operational constraints, not application guarantees. Document the chosen bucket/project in deployment configuration and monitor quota or storage errors.

## 5. Error Handling & HTTP Statuses

- `200 OK`: Avatar uploaded, replaced, or removed successfully.
- `400 Bad Request`: Missing file, multiple files, empty file, or invalid image data.
- `401 Unauthorized`: Missing or invalid authentication.
- `403 Forbidden`: Caller lacks permission to update the target user's profile.
- `404 Not Found`: Target user does not exist.
- `413 Payload Too Large`: Upload exceeds the avatar size limit.
- `415 Unsupported Media Type`: Unsupported or mismatched image format.
- `500 Internal Server Error`: Image processing, Supabase upload, or database operation failed. Do not return internal storage credentials or private details.

## 6. User Deletion & Lifecycle

- User account deletion must remove the avatar object from the `avatars` bucket in addition to deleting the database reference.
- Object cleanup must be observable and retryable. Do not report deletion of the stored object as successful if cleanup has not completed, unless the established deletion flow explicitly records a pending cleanup task.
- Use unique object keys for each replacement rather than overwriting a shared key, so caches cannot serve stale avatar content and failed replacements do not destroy the current avatar.

## 7. Audit & Logging

- Log avatar upload, replacement, removal, and cleanup outcomes with actor ID, target user ID, operation, status, and processed byte size.
- Never log image bytes, service-role credentials, or raw client filenames. Avoid logging full public URLs when object keys or operation IDs suffice.

## 8. Security & Performance

- Enforce the same ownership and RBAC protections used by profile updates to prevent IDOR.
- Use the service-role key only in the backend. The Supabase client must not be exposed to frontend code with privileged credentials.
- Public read access is intentional for profile photos. If the application later requires private avatars, switch the response to an authorized streaming endpoint or short-lived signed URLs without exposing object keys as authorization.
- Apply request throttling to uploads and removals.
- Avoid buffering files beyond the configured size limit; reject oversized requests while streaming where supported.

## 9. Acceptance Criteria

1. An authorized user can upload a valid image and receives a profile whose `photo` points to the newly uploaded avatar.
2. Unsupported, corrupt, mismatched, and oversized uploads are rejected with the specified HTTP status.
3. Unauthenticated callers and callers lacking self/admin authorization cannot upload or remove a user's avatar.
4. Upload replacement and URL-based PATCH preserve the new value and clean up the prior uploaded object without losing the active photo on database failure.
5. Avatar removal and account deletion clear the reference and clean up the corresponding storage object.
6. Existing JSON profile updates and URL-based photo values continue to work, and profile response field-visibility rules continue to apply.
7. Automated tests cover validation, authorization, storage/database failures, replacement cleanup, URL compatibility, and profile response output.
