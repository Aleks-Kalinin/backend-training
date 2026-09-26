import { createE2eTestContext } from './e2e/e2e-test-context';

describe('Settings HTTP e2e', () => {
  const context = createE2eTestContext();

  it('reads and updates verification settings for administrators', async () => {
    await context.asUser('get', '/admin/settings/verification').expect(403);

    const settings = await context
      .asAdmin('get', '/admin/settings/verification')
      .expect(200);
    expect(settings.body).toEqual({
      registrationVerificationEnabled: false,
      passwordResetVerificationEnabled: false,
      loginVerificationEnabled: false,
    });

    const updated = await context
      .asAdmin('patch', '/admin/settings/verification')
      .send({
        registrationVerificationEnabled: true,
        loginVerificationEnabled: true,
      })
      .expect(200);
    expect(updated.body).toEqual({
      registrationVerificationEnabled: true,
      passwordResetVerificationEnabled: false,
      loginVerificationEnabled: true,
    });

    await context
      .asAdmin('patch', '/admin/settings/verification')
      .send({ loginVerificationEnabled: 'yes' })
      .expect(400);
  });
});
