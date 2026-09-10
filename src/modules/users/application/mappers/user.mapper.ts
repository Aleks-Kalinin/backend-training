import { pick } from '@/common/utils/pick.util';
import { AuthTokenPayload } from '@/modules/auth/dto/auth-request.dto';
import {
  PUBLIC_PROFILE_FIELDS,
  SELF_PROFILE_FIELDS,
} from '../../domain/user-profile-fields.config';
import { User } from '../../infrastructure/entity/user.entity';

export class UserMapper {
  static toProfileResponseDto(targetUser: User, requester: AuthTokenPayload) {
    const isSelf = String(targetUser.userId) === String(requester.sub);

    const allowedFields = isSelf ? SELF_PROFILE_FIELDS : PUBLIC_PROFILE_FIELDS;
    return pick(targetUser, allowedFields);
  }
}
