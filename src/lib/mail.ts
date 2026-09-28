import { env } from "@/config/env";

/**
 * Outgoing mail, entirely optional.
 *
 * With SMTP_URL set, password resets, invitations and supplier requests are
 * e-mailed. Without it nothing is sent and every link is shown on screen for
 * the person to pass on, which is how the product has always worked - so a
 * deployment needs no mail provider to be complete. Delivery failures are
 * logged and reported as "not sent", never thrown: a flaky SMTP server must
 * not stop someone creating an invitation.
 */

export function mailConfigured(): boolean {
  return Boolean(env.SMTP_URL && env.MAIL_FROM);
}

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. Links are written out in full so any mail client shows them. */
  text: string;
}

type Transport = { sendMail(m: Mail & { from: string }): Promise<unknown> };

let transport: Transport | null = null;
let testOutbox: (Mail & { from: string })[] | null = null;

/** Tests capture mail instead of sending it. */
export function captureMailForTests(): (Mail & { from: string })[] {
  testOutbox = [];
  return testOutbox;
}

async function getTransport(): Promise<Transport> {
  if (transport) return transport;
  const nodemailer = await import("nodemailer");
  transport = nodemailer.createTransport(env.SMTP_URL!) as unknown as Transport;
  return transport;
}

/** Sends if mail is configured. Returns whether the message was handed to the server. */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (testOutbox) {
    testOutbox.push({ ...mail, from: env.MAIL_FROM ?? "test@localhost" });
    return true;
  }
  if (!mailConfigured()) return false;
  try {
    const t = await getTransport();
    await t.sendMail({ ...mail, from: env.MAIL_FROM! });
    return true;
  } catch (error) {
    console.error("Mail delivery failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
