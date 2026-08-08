/**
 * Payment Gateway Adapter — T4.2 (Integrasi, K-03).
 * 
 * Adapter pattern untuk integrasi payment gateway (Midtrans, Xendit, dll).
 * Implementasi mock dulu; real provider bisa di-swap nanti tanpa ubah core logic.
 */

export interface PaymentGatewayConfig {
  /** Environment: 'sandbox' | 'production' */
  environment: 'sandbox' | 'production';
  /** Merchant identifier */
  merchantId: string;
  /** API credentials */
  apiKey: string;
  serverKey?: string; // Midtrans
  callbackToken?: string; // Xendit
}

export interface CreatePaymentRequest {
  /** ID unik transaksi di sistem kita (payment_id) */
  orderId: string;
  /** Jumlah nominal (rupiah, integer) */
  grossAmount: number;
  /** Detail mahasiswa */
  customerDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  /** Item pembayaran */
  itemDetails?: Array<{
    id: string;
    price: number;
    quantity: number;
    name: string;
    brand?: string;
    category?: string;
  }>;
  /** URL callback */
  callbacks?: {
    finish?: string;
    error?: string;
    pending?: string;
  };
}

export interface CreatePaymentResponse {
  /** Token/URL untuk redirect ke halaman pembayaran */
  redirectUrl: string;
  /** Token transaksi (untuk verify webhook) */
  token: string;
  /** Status awal */
  status: 'pending' | 'settlement' | 'capture' | 'deny' | 'cancel' | 'expire' | 'failure';
  /** Raw response dari provider (untuk debug) */
  rawResponse?: unknown;
}

export interface PaymentStatus {
  orderId: string;
  transactionId: string;
  status: 'pending' | 'settlement' | 'capture' | 'deny' | 'cancel' | 'expire' | 'failure';
  grossAmount: number;
  paymentType: string;
  transactionTime: string;
  fraudStatus?: 'accept' | 'deny' | 'challenge';
  rawResponse?: unknown;
}

export interface WebhookPayload {
  /** Order ID dari sistem kita */
  orderId: string;
  /** Transaction ID dari provider */
  transactionId: string;
  /** Status pembayaran */
  status: PaymentStatus['status'];
  /** Gross amount */
  grossAmount: number;
  /** Payment type (credit_card, va, qris, etc) */
  paymentType: string;
  /** Timestamp transaksi */
  transactionTime: string;
  /** Signature/key untuk verifikasi */
  signatureKey: string;
  /** Raw payload */
  raw: Record<string, unknown>;
}

export interface WebhookVerificationResult {
  valid: boolean;
  paymentStatus?: PaymentStatus;
  error?: string;
}

/**
 * Interface yang harus diimplementasi setiap payment gateway provider.
 */
export interface PaymentGatewayAdapter {
  /** Nama provider (untuk logging/debug) */
  readonly providerName: string;
  
  /** Inisialisasi adapter dengan config */
  initialize(config: PaymentGatewayConfig): Promise<void>;
  
  /** Buat pembayaran baru, return redirect URL + token */
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse>;
  
  /** Cek status pembayaran (polling) */
  getPaymentStatus(orderId: string): Promise<PaymentStatus>;
  
  /** Verifikasi webhook signature & parse payload */
  verifyWebhook(payload: WebhookPayload): WebhookVerificationResult;
  
  /** Handle refund (opsional) */
  refund?(orderId: string, amount: number, reason: string): Promise<{ success: boolean; refundId: string }>;
}

/**
 * Factory untuk membuat adapter berdasarkan provider name.
 * Memudahkan swap provider tanpa ubah kode pemanggil.
 */
export function createPaymentGatewayAdapter(
  provider: 'midtrans' | 'xendit' | 'mock',
  config: PaymentGatewayConfig
): PaymentGatewayAdapter {
  switch (provider) {
    case 'mock':
      return new MockPaymentGateway();
    case 'midtrans':
      // return new MidtransPaymentGateway(config);
      throw new Error('Midtrans adapter belum diimplementasi — gunakan mock dulu');
    case 'xendit':
      // return new XenditPaymentGateway(config);
      throw new Error('Xendit adapter belum diimplementasi — gunakan mock dulu');
    default:
      throw new Error(`Unknown payment gateway provider: ${provider}`);
  }
}

/**
 * Mock Payment Gateway Adapter — untuk development & testing.
 * Simulasi flow pembayaran tanpa provider eksternal.
 */
export class MockPaymentGateway implements PaymentGatewayAdapter {
  readonly providerName = 'mock';
  
  private payments = new Map<string, CreatePaymentResponse & { status: PaymentStatus['status'] }>();
  private webhookSecret = 'mock-secret-key-for-testing';
  
  async initialize(config: PaymentGatewayConfig): Promise<void> {
    // No-op for mock
    this.webhookSecret = config.apiKey || this.webhookSecret;
  }
  
  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const token = `mock_token_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const redirectUrl = `${request.callbacks?.finish || 'http://localhost:5173/finance/success'}?order_id=${request.orderId}&token=${token}&status=pending`;
    
    const response: CreatePaymentResponse = {
      redirectUrl,
      token,
      status: 'pending',
      rawResponse: { mock: true, orderId: request.orderId },
    };
    
    this.payments.set(request.orderId, { ...response, status: 'pending' });
    return response;
  }
  
  async getPaymentStatus(orderId: string): Promise<PaymentStatus> {
    const payment = this.payments.get(orderId);
    if (!payment) {
      throw new Error(`Payment not found: ${orderId}`);
    }
    
    return {
      orderId,
      transactionId: `mock_txn_${orderId}`,
      status: payment.status,
      grossAmount: 0, // Will be filled by caller
      paymentType: 'mock',
      transactionTime: new Date().toISOString(),
      rawResponse: { mock: true },
    };
  }
  
  verifyWebhook(payload: WebhookPayload): WebhookVerificationResult {
    // Mock verification: check signature key
    const expectedSignature = this.generateMockSignature(payload);
    if (payload.signatureKey !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    // Update internal status
    const payment = this.payments.get(payload.orderId);
    if (payment) {
      payment.status = payload.status;
    }
    
    return {
      valid: true,
      paymentStatus: {
        orderId: payload.orderId,
        transactionId: payload.transactionId,
        status: payload.status,
        grossAmount: payload.grossAmount,
        paymentType: payload.paymentType,
        transactionTime: payload.transactionTime,
        rawResponse: payload.raw,
      },
    };
  }
  
  /** Simulasi update status (untuk testing) */
  simulatePaymentSuccess(orderId: string): void {
    const payment = this.payments.get(orderId);
    if (payment) {
      payment.status = 'settlement';
    }
  }
  
  simulatePaymentFailure(orderId: string): void {
    const payment = this.payments.get(orderId);
    if (payment) {
      payment.status = 'failure';
    }
  }
  
  private generateMockSignature(payload: WebhookPayload): string {
    // Simple mock signature: SHA256(orderId + grossAmount + secret)
    const crypto = require('crypto');
    const data = `${payload.orderId}${payload.grossAmount}${this.webhookSecret}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}