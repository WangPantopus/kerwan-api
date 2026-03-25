import type { Plan } from "@prisma/client";

// Resend is loaded lazily to avoid crashing in environments where
// RESEND_API_KEY is not set (e.g. tests that stub this service).
async function getResend() {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  const { Resend } = await import("resend");
  return new Resend(apiKey);
}

const FROM_ADDRESS = process.env["EMAIL_FROM"] ?? "Kerwan <noreply@kerwan.app>";
const APP_URL = process.env["APP_URL"] ?? "https://kerwan.app";

export const emailService = {
  async sendLicenseKey(params: {
    to: string;
    licenseKey: string;
    plan: Plan;
  }): Promise<void> {
    const { to, licenseKey, plan } = params;
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

    const resend = await getResend();

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Your Kerwan ${planLabel} License Key`,
      html: buildLicenseEmail({ licenseKey, plan: planLabel, email: to }),
      text: buildLicenseEmailText({ licenseKey, plan: planLabel }),
    });
  },

  async sendPaymentFailedNotice(params: {
    to: string;
    plan: Plan;
    retryDate: Date | null;
  }): Promise<void> {
    const { to, plan, retryDate } = params;
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    const retryStr = retryDate
      ? retryDate.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "soon";

    const resend = await getResend();

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Action required: Kerwan ${planLabel} payment failed`,
      html: buildPaymentFailedEmail({ plan: planLabel, retryDate: retryStr }),
      text: `Your Kerwan ${planLabel} payment failed. We will retry on ${retryStr}. Update your payment method at ${APP_URL}/billing`,
    });
  },

  async sendCancellationNotice(params: {
    to: string;
    plan: Plan;
    accessUntil: Date;
  }): Promise<void> {
    const { to, plan, accessUntil } = params;
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    const untilStr = accessUntil.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const resend = await getResend();

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Your Kerwan ${planLabel} subscription has been canceled`,
      html: buildCancellationEmail({ plan: planLabel, accessUntil: untilStr }),
      text: `Your Kerwan ${planLabel} subscription has been canceled. You retain access until ${untilStr}.`,
    });
  },
};

// ─── Email templates (minimal HTML) ──────────────────────────────────────────

function buildLicenseEmail(p: {
  licenseKey: string;
  plan: string;
  email: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
  <h1 style="font-size: 24px; margin-bottom: 8px;">Welcome to Kerwan ${p.plan}</h1>
  <p style="color: #555; margin-bottom: 32px;">Here is your license key. Keep it somewhere safe — you'll need it to activate the app.</p>

  <div style="background: #f4f4f5; border-radius: 8px; padding: 20px 24px; margin-bottom: 32px;">
    <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin: 0 0 8px;">License Key</p>
    <code style="font-size: 18px; font-family: 'SF Mono', 'Fira Code', monospace; letter-spacing: 0.04em; color: #1a1a1a;">${p.licenseKey}</code>
  </div>

  <h2 style="font-size: 16px; margin-bottom: 8px;">How to activate</h2>
  <ol style="color: #555; padding-left: 20px; line-height: 1.8;">
    <li>Open Kerwan on your Mac</li>
    <li>Go to Settings → License</li>
    <li>Paste your license key and click Activate</li>
  </ol>

  <p style="margin-top: 32px; font-size: 13px; color: #888;">
    Questions? Reply to this email or visit <a href="${APP_URL}/support" style="color: #1a1a1a;">${APP_URL}/support</a>
  </p>
</body>
</html>`;
}

function buildLicenseEmailText(p: {
  licenseKey: string;
  plan: string;
}): string {
  return `Welcome to Kerwan ${p.plan}

Your license key: ${p.licenseKey}

How to activate:
1. Open Kerwan on your Mac
2. Go to Settings > License
3. Paste your license key and click Activate

Questions? Visit ${APP_URL}/support`;
}

function buildPaymentFailedEmail(p: {
  plan: string;
  retryDate: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
  <h1 style="font-size: 24px; margin-bottom: 8px;">Payment failed</h1>
  <p style="color: #555;">We were unable to process your Kerwan ${p.plan} subscription payment. We will automatically retry on <strong>${p.retryDate}</strong>.</p>
  <p style="color: #555;">To avoid interruption to your service, please update your payment method.</p>
  <a href="${APP_URL}/billing" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">Update payment method</a>
</body>
</html>`;
}

function buildCancellationEmail(p: {
  plan: string;
  accessUntil: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
  <h1 style="font-size: 24px; margin-bottom: 8px;">Subscription canceled</h1>
  <p style="color: #555;">Your Kerwan ${p.plan} subscription has been canceled. You retain full access until <strong>${p.accessUntil}</strong>, after which your account will revert to the free plan.</p>
  <p style="color: #555; margin-top: 16px;">Changed your mind?</p>
  <a href="${APP_URL}/billing" style="display: inline-block; margin-top: 8px; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">Reactivate subscription</a>
</body>
</html>`;
}
