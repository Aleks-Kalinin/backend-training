export const VERIFICATION_RUNTIME_ENVIRONMENT = Symbol(
  'VERIFICATION_RUNTIME_ENVIRONMENT',
);

export interface VerificationRuntimeEnvironment {
  isProduction(): boolean;
}
