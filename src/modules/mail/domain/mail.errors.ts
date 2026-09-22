export class MailDeliveryError extends Error {
  constructor(message = 'Failed to dispatch verification email') {
    super(message);
    this.name = 'MailDeliveryError';
  }
}
