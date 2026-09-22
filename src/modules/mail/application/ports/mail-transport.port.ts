export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export interface MailMessage {
  from?: string;
  to: string;
  subject: string;
  html: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}
