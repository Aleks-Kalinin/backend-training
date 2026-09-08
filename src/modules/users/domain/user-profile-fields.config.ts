export enum UserField {
  USER_ID = 'userId',
  EMAIL = 'email',
  STATUS = 'status',
  IS_VERIFIED = 'isVerified',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export const PUBLIC_PROFILE_FIELDS = [
  UserField.USER_ID,
  UserField.EMAIL,
] as const;

export const SELF_PROFILE_FIELDS = [
  UserField.USER_ID,
  UserField.EMAIL,
  UserField.STATUS,
] as const;
