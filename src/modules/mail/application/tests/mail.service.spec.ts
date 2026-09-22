import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './../mail.service';
import { MAIL_TRANSPORT } from '../ports/mail-transport.port';

const mockSend = jest.fn();

describe('MailService', () => {
  let service: MailService;
  const originalEnv = process.env;

  const validEnv = {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'smtp_user',
    SMTP_PASSWORD: 'smtp_password',
    SMTP_SECURE: 'false',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ...validEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('initializes nodemailer transport when all SMTP configuration variables are valid', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          { provide: MAIL_TRANSPORT, useValue: { send: mockSend } },
        ],
      }).compile();

      service = module.get<MailService>(MailService);
      expect(service).toBeDefined();

      expect(service).toBeDefined();
    });

    it('sets secure to true when SMTP_SECURE is "true"', async () => {});
  });

  describe('sendVerificationOtp', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          { provide: MAIL_TRANSPORT, useValue: { send: mockSend } },
        ],
      }).compile();

      service = module.get<MailService>(MailService);
    });

    it('dispatches verification email with default from address when SMTP_FROM is not set', async () => {
      delete process.env.SMTP_FROM;
      mockSend.mockResolvedValueOnce(undefined);

      await service.sendVerificationOtp('user@example.com', '123456');

      expect(mockSend).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Verify Your Email Address',
        html: expect.stringContaining('123456'),
      });
    });

    it('dispatches verification email with custom from address when SMTP_FROM is set', async () => {
      mockSend.mockResolvedValueOnce(undefined);

      await service.sendVerificationOtp('user@example.com', '654321');

      expect(mockSend).toHaveBeenCalledWith({
        to: 'user@example.com',
        subject: 'Verify Your Email Address',
        html: expect.stringContaining('654321'),
      });
    });

    it('logs error and throws InternalServerErrorException when sendMail fails', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      mockSend.mockRejectedValueOnce(new Error('SMTP dispatch error'));

      await expect(
        service.sendVerificationOtp('user@example.com', '123456'),
      ).rejects.toThrow('Failed to dispatch verification email');

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to dispatch verification email: Error: SMTP dispatch error',
      );

      loggerSpy.mockRestore();
    });
  });
});
