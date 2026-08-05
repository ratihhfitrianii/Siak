import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../../lib/logger';

/**
 * T2.5 — NotificationProvider (plugin kanal pengiriman; docs/02 §modul notifikasi).
 *
 * Interface kanal: implementasi email (SMTP via nodemailer) + fallback log-only saat
 * SMTP belum dikonfigurasi (graceful degradation — konsisten dengan Redis down → bypass).
 * WA/Telegram adalah plugin masa depan (Open Question #7); cukup tambah implementasi baru.
 */

export interface OutboundNotification {
  title: string;
  message: string;
}

export interface Recipient {
  email: string;
  fullName: string;
}

export interface NotificationProvider {
  readonly name: string;
  /** Kirim satu notifikasi; throw bila gagal (delivery job menangani retry/status). */
  send(recipient: Recipient, notification: OutboundNotification): Promise<void>;
}

/** Provider email via SMTP (nodemailer). Butuh SMTP_HOST; selain itu fallback log. */
class EmailProvider implements NotificationProvider {
  readonly name = 'email';
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.SMTP_FROM ?? 'no-reply@siak.local';
    if (!host) {
      logger.warn(
        'SMTP_HOST tidak dikonfigurasi — provider email dalam mode log-only (T2.5 fallback)',
      );
      this.transporter = null;
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }

  async send(recipient: Recipient, notification: OutboundNotification): Promise<void> {
    if (!this.transporter) {
      // Fallback: catat di log — tidak throw agar antrean tidak menumpuk di FAILED
      // saat SMTP sengaja belum dikonfigurasi (staging/dev).
      logger.info(
        {
          to: recipient.email,
          title: notification.title,
          provider: 'email:log',
        },
        'notifikasi email (log-only — SMTP belum dikonfigurasi)',
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to: recipient.email,
      subject: `[Siak] ${notification.title}`,
      text: notification.message,
    });
  }
}

let emailProviderInstance: NotificationProvider | null = null;

/**
 * Provider default sesuai NOTIFICATION_PROVIDER env ('email' | 'inapp' | 'email,inapp').
 * 'email' → return EmailProvider; 'inapp' → null (tanpa kanal eksternal).
 */
export function createEmailProvider(): NotificationProvider {
  if (!emailProviderInstance) {
    emailProviderInstance = new EmailProvider();
  }
  return emailProviderInstance;
}
