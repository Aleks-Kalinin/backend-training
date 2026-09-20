import { InternalServerErrorException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { MailService } from './../mail.service';

const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockImplementation(() => ({
    sendMail: mockSendMail,
  })),
}));

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
        providers: [MailService],
      }).compile();

      service = module.get<MailService>(MailService);
      expect(service).toBeDefined();

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'smtp_user',
          pass: 'smtp_password',
        },
      });
    });

    it('sets secure to true when SMTP_SECURE is "true"', async () => {
      process.env.SMTP_SECURE = 'true';

      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService],
      }).compile();

      service = module.get<MailService>(MailService);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: true,
        }),
      );
    });

    it('throws Error if SMTP_HOST is missing', () => {
      delete process.env.SMTP_HOST;
      expect(() => new MailService()).toThrow(
        'SMTP configuration is incomplete or invalid',
      );
    });

    it('throws Error if SMTP_PORT is invalid or not an integer', () => {
      process.env.SMTP_PORT = 'not-a-number';
      expect(() => new MailService()).toThrow(
        'SMTP configuration is incomplete or invalid',
      );
    });

    it('throws Error if SMTP_USER is missing', () => {
      delete process.env.SMTP_USER;
      expect(() => new MailService()).toThrow(
        'SMTP configuration is incomplete or invalid',
      );
    });

    it('throws Error if SMTP_PASSWORD is missing', () => {
      delete process.env.SMTP_PASSWORD;
      expect(() => new MailService()).toThrow(
        'SMTP configuration is incomplete or invalid',
      );
    });
  });

  describe('sendVerificationOtp', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [MailService],
      }).compile();

      service = module.get<MailService>(MailService);
    });

    it('dispatches verification email with default from address when SMTP_FROM is not set', async () => {
      delete process.env.SMTP_FROM;
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-123' });

      await service.sendVerificationOtp('user@example.com', '123456');

      expect(mockSendMail).toHaveBeenCalledWith({
        from: '"App Support" <no-reply@yourapp.com>',
        to: 'user@example.com',
        subject: 'Verify Your Email Address',
        html: expect.stringContaining('123456'),
      });
    });

    it('dispatches verification email with custom from address when SMTP_FROM is set', async () => {
      process.env.SMTP_FROM = 'custom-sender@example.com';
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-456' });

      await service.sendVerificationOtp('user@example.com', '654321');

      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'custom-sender@example.com',
        to: 'user@example.com',
        subject: 'Verify Your Email Address',
        html: expect.stringContaining('654321'),
      });
    });

    it('logs error and throws InternalServerErrorException when sendMail fails', async () => {
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      mockSendMail.mockRejectedValueOnce(new Error('SMTP dispatch error'));

      await expect(
        service.sendVerificationOtp('user@example.com', '123456'),
      ).rejects.toThrow(
        new InternalServerErrorException(
          'Failed to dispatch verification email',
        ),
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to dispatch verification email: Error: SMTP dispatch error',
      );

      loggerSpy.mockRestore();
    });
  });
});
