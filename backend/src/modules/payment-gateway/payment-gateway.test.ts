/**
 * T4.2 — Payment Gateway Adapter Tests.
 * Test mock adapter behavior, webhook verification, idempotency.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockPaymentGateway, createPaymentGatewayAdapter } from './index';

describe('Payment Gateway Adapter (T4.2)', () => {
  let adapter: MockPaymentGateway;

  beforeEach(() => {
    adapter = new MockPaymentGateway();
  });

  describe('MockPaymentGateway', () => {
    it('initialize tidak error', async () => {
      await expect(
        adapter.initialize({
          environment: 'sandbox',
          merchantId: 'test-merchant',
          apiKey: 'test-key',
        }),
      ).resolves.toBeUndefined();
    });

    it('createPayment mengembalikan redirectUrl dan token', async () => {
      const result = await adapter.createPayment({
        orderId: 'PAY-123',
        grossAmount: 100000,
        customerDetails: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        callbacks: {
          finish: 'http://localhost:5173/finance/success',
        },
      });

      expect(result.redirectUrl).toContain('PAY-123');
      expect(result.redirectUrl).toContain('status=pending');
      expect(result.token).toMatch(/^mock_token_/);
      expect(result.status).toBe('pending');
    });

    it('getPaymentStatus mengembalikan status pending awal', async () => {
      await adapter.createPayment({
        orderId: 'PAY-456',
        grossAmount: 200000,
        customerDetails: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
      });

      const status = await adapter.getPaymentStatus('PAY-456');
      expect(status.orderId).toBe('PAY-456');
      expect(status.status).toBe('pending');
      expect(status.paymentType).toBe('mock');
    });

    it('getPaymentStatus throw jika orderId tidak ditemukan', async () => {
      await expect(adapter.getPaymentStatus('NONEXISTENT')).rejects.toThrow('Payment not found');
    });

    it('verifyWebhook valid untuk signature yang benar', async () => {
      await adapter.createPayment({
        orderId: 'PAY-789',
        grossAmount: 300000,
        customerDetails: {
          firstName: 'Bob',
          lastName: 'Wilson',
          email: 'bob@example.com',
        },
      });

      // Simulasi payment success
      adapter.simulatePaymentSuccess('PAY-789');

      // Generate webhook payload dengan signature yang benar
      const crypto = require('crypto');
      const secret = 'mock-secret-key-for-testing';
      const data = `PAY-789300000${secret}`;
      const signatureKey = crypto.createHash('sha256').update(data).digest('hex');

      const payload = {
        orderId: 'PAY-789',
        transactionId: 'mock_txn_PAY-789',
        status: 'settlement' as const,
        grossAmount: 300000,
        paymentType: 'mock',
        transactionTime: new Date().toISOString(),
        signatureKey,
        raw: {},
      };

      const result = adapter.verifyWebhook(payload);
      expect(result.valid).toBe(true);
      expect(result.paymentStatus?.status).toBe('settlement');
      expect(result.paymentStatus?.orderId).toBe('PAY-789');
    });

    it('verifyWebhook invalid untuk signature yang salah', async () => {
      const payload = {
        orderId: 'PAY-789',
        transactionId: 'mock_txn_PAY-789',
        status: 'settlement' as const,
        grossAmount: 300000,
        paymentType: 'mock',
        transactionTime: new Date().toISOString(),
        signatureKey: 'invalid-signature',
        raw: {},
      };

      const result = adapter.verifyWebhook(payload);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('simulatePaymentSuccess mengubah status internal', async () => {
      await adapter.createPayment({
        orderId: 'PAY-999',
        grossAmount: 50000,
        customerDetails: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
        },
      });

      let status = await adapter.getPaymentStatus('PAY-999');
      expect(status.status).toBe('pending');

      adapter.simulatePaymentSuccess('PAY-999');

      status = await adapter.getPaymentStatus('PAY-999');
      expect(status.status).toBe('settlement');
    });

    it('simulatePaymentFailure mengubah status internal', async () => {
      await adapter.createPayment({
        orderId: 'PAY-888',
        grossAmount: 50000,
        customerDetails: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
        },
      });

      adapter.simulatePaymentFailure('PAY-888');

      const status = await adapter.getPaymentStatus('PAY-888');
      expect(status.status).toBe('failure');
    });
  });

  describe('Factory createPaymentGatewayAdapter', () => {
    it('membuat MockPaymentGateway untuk provider "mock"', () => {
      const adapter = createPaymentGatewayAdapter('mock', {
        environment: 'sandbox',
        merchantId: 'test',
        apiKey: 'test',
      });
      expect(adapter.providerName).toBe('mock');
    });

    it('throw untuk provider belum diimplementasi (midtrans)', () => {
      expect(() =>
        createPaymentGatewayAdapter('midtrans', {
          environment: 'sandbox',
          merchantId: 'test',
          apiKey: 'test',
        }),
      ).toThrow('Midtrans adapter belum diimplementasi');
    });

    it('throw untuk provider belum diimplementasi (xendit)', () => {
      expect(() =>
        createPaymentGatewayAdapter('xendit', {
          environment: 'sandbox',
          merchantId: 'test',
          apiKey: 'test',
        }),
      ).toThrow('Xendit adapter belum diimplementasi');
    });

    it('throw untuk provider unknown', () => {
      expect(() =>
        createPaymentGatewayAdapter('unknown' as 'midtrans' | 'xendit' | 'mock', {
          environment: 'sandbox',
          merchantId: 'test',
          apiKey: 'test',
        }),
      ).toThrow('Unknown payment gateway provider');
    });
  });

  describe('Webhook idempotency', () => {
    it('memanggil verifyWebhook dua kali dengan payload sama tidak error', async () => {
      await adapter.createPayment({
        orderId: 'PAY-IDEMPOTENT',
        grossAmount: 100000,
        customerDetails: {
          firstName: 'Idem',
          lastName: 'Potent',
          email: 'idem@example.com',
        },
      });

      adapter.simulatePaymentSuccess('PAY-IDEMPOTENT');

      const crypto = require('crypto');
      const secret = 'mock-secret-key-for-testing';
      const data = `PAY-IDEMPOTENT100000${secret}`;
      const signatureKey = crypto.createHash('sha256').update(data).digest('hex');

      const payload = {
        orderId: 'PAY-IDEMPOTENT',
        transactionId: 'mock_txn_PAY-IDEMPOTENT',
        status: 'settlement' as const,
        grossAmount: 100000,
        paymentType: 'mock',
        transactionTime: new Date().toISOString(),
        signatureKey,
        raw: {},
      };

      // First call
      const result1 = adapter.verifyWebhook(payload);
      expect(result1.valid).toBe(true);
      expect(result1.paymentStatus?.status).toBe('settlement');

      // Second call (duplicate webhook)
      const result2 = adapter.verifyWebhook(payload);
      expect(result2.valid).toBe(true);
      expect(result2.paymentStatus?.status).toBe('settlement');
    });
  });
});
