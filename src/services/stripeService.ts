import Stripe from "stripe";
import type { Plan } from "@prisma/client";
import { db } from "../db/client.js";
import { config } from "../config.js";
import { licenseService } from "./licenseService.js";
import { emailService } from "./emailService.js";

const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
  typescript: true,
});

// ─── Price → Plan mapping ─────────────────────────────────────────────────────

const PRICE_TO_PLAN: Record<string, Plan> = {
  [config.STRIPE_PRICE_SOLO_MONTHLY]: "solo",
  [config.STRIPE_PRICE_SOLO_YEARLY]: "solo",
  [config.STRIPE_PRICE_PRO_MONTHLY]: "pro",
  [config.STRIPE_PRICE_PRO_YEARLY]: "pro",
};

const LIFETIME_PRICE_IDS = new Set([
  config.STRIPE_PRICE_SOLO_LIFETIME,
  config.STRIPE_PRICE_PRO_LIFETIME,
]);

const LIFETIME_PRICE_TO_PLAN: Record<string, Plan> = {
  [config.STRIPE_PRICE_SOLO_LIFETIME]: "solo",
  [config.STRIPE_PRICE_PRO_LIFETIME]: "pro",
};

// ─── Checkout ─────────────────────────────────────────────────────────────────

export type PriceId =
  | "solo_monthly"
  | "solo_yearly"
  | "solo_lifetime"
  | "pro_monthly"
  | "pro_yearly"
  | "pro_lifetime";

const PRICE_ID_MAP: Record<PriceId, string> = {
  solo_monthly: config.STRIPE_PRICE_SOLO_MONTHLY,
  solo_yearly: config.STRIPE_PRICE_SOLO_YEARLY,
  solo_lifetime: config.STRIPE_PRICE_SOLO_LIFETIME,
  pro_monthly: config.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly: config.STRIPE_PRICE_PRO_YEARLY,
  pro_lifetime: config.STRIPE_PRICE_PRO_LIFETIME,
};

export const stripeService = {
  /**
   * Creates a Stripe Checkout Session and returns the redirect URL.
   */
  async createCheckoutSession(params: {
    priceId: PriceId;
    email?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const stripePriceId = PRICE_ID_MAP[params.priceId];
    const isLifetime = LIFETIME_PRICE_IDS.has(stripePriceId);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: isLifetime ? "payment" : "subscription",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      ...(params.email && { customer_email: params.email }),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return session.url;
  },

  /**
   * Verifies the Stripe webhook signature and dispatches events.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        config.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      throw Object.assign(new Error("Invalid Stripe webhook signature"), {
        statusCode: 400,
        code: "INVALID_SIGNATURE",
      });
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      default:
        // Unhandled event types are silently ignored
        break;
    }
  },
};

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const email = session.customer_details?.email ?? session.customer_email;
  if (!email) {
    throw new Error("checkout.session.completed: no customer email");
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  if (!customerId) {
    throw new Error("checkout.session.completed: no customer id");
  }

  // Determine plan + lifetime flag from the line items
  // We expand line_items in the webhook payload by default; fall back to
  // retrieving the session if needed.
  let stripePriceId: string | null = null;
  if (session.line_items?.data[0]?.price?.id) {
    stripePriceId = session.line_items.data[0].price.id;
  } else {
    const expanded = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["line_items.data.price"],
    });
    stripePriceId = expanded.line_items?.data[0]?.price?.id ?? null;
  }

  if (!stripePriceId) {
    throw new Error("checkout.session.completed: could not determine price ID");
  }

  const isLifetime = LIFETIME_PRICE_IDS.has(stripePriceId);
  const plan: Plan = isLifetime
    ? (LIFETIME_PRICE_TO_PLAN[stripePriceId] ?? "solo")
    : (PRICE_TO_PLAN[stripePriceId] ?? "solo");

  // Upsert user
  const user = await db.user.upsert({
    where: { email },
    create: { email },
    update: {},
  });

  if (isLifetime) {
    // Lifetime purchase — create/update subscription with lifetime status
    await db.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        stripeCustomerId: customerId,
        plan,
        status: "lifetime",
      },
      update: {
        stripeCustomerId: customerId,
        plan,
        status: "lifetime",
      },
    });

    const licenseKey = await licenseService.createForUser({
      userId: user.id,
      plan,
      expiresAt: null, // lifetime — never expires
    });

    await emailService.sendLicenseKey({ to: email, licenseKey, plan });
  } else {
    // Subscription purchase handled by invoice.paid — just ensure subscription row exists
    const stripeSubId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;

    await db.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSubId,
        plan,
        status: "active",
      },
      update: {
        stripeCustomerId: customerId,
        ...(stripeSubId !== null && { stripeSubscriptionId: stripeSubId }),
        plan,
        status: "active",
      },
    });
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const stripeSubId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id ?? null;
  if (!stripeSubId) return;

  // Fetch the subscription from Stripe to get current plan + period
  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  const priceId = stripeSub.items.data[0]?.price.id ?? null;
  const plan: Plan = priceId ? (PRICE_TO_PLAN[priceId] ?? "solo") : "solo";
  const periodEnd = new Date(stripeSub.current_period_end * 1000);

  // Find the subscription record in our DB by Stripe customer ID
  const sub = await db.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    include: { user: true },
  });

  if (!sub) return;

  await db.subscription.update({
    where: { stripeCustomerId: customerId },
    data: {
      plan,
      status: "active",
      stripeSubscriptionId: stripeSubId,
      currentPeriodEnd: periodEnd,
    },
  });

  // On first payment, create + email the license key
  const existingKey = await db.licenseKey.findFirst({
    where: { userId: sub.userId },
  });

  if (!existingKey) {
    const licenseKey = await licenseService.createForUser({
      userId: sub.userId,
      plan,
      expiresAt: periodEnd,
    });
    await emailService.sendLicenseKey({
      to: sub.user.email,
      licenseKey,
      plan,
    });
  } else {
    // Renewal — update expiry on existing key
    await db.licenseKey.update({
      where: { id: existingKey.id },
      data: { expiresAt: periodEnd, plan },
    });
  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const sub = await db.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    include: { user: true },
  });
  if (!sub) return;

  await db.subscription.update({
    where: { stripeCustomerId: customerId },
    data: { status: "past_due" },
  });

  const nextRetry = invoice.next_payment_attempt
    ? new Date(invoice.next_payment_attempt * 1000)
    : null;

  await emailService.sendPaymentFailedNotice({
    to: sub.user.email,
    plan: sub.plan,
    retryDate: nextRetry,
  });
}

async function handleSubscriptionDeleted(
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer?.id;
  if (!customerId) return;

  const sub = await db.subscription.findUnique({
    where: { stripeCustomerId: customerId },
    include: { user: true },
  });
  if (!sub) return;

  const periodEnd = sub.currentPeriodEnd;

  await db.subscription.update({
    where: { stripeCustomerId: customerId },
    data: { status: "canceled" },
  });

  await emailService.sendCancellationNotice({
    to: sub.user.email,
    plan: sub.plan,
    accessUntil: periodEnd ?? new Date(),
  });
}

async function handleSubscriptionUpdated(
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer?.id;
  if (!customerId) return;

  const priceId = stripeSub.items.data[0]?.price.id;
  const plan: Plan = priceId ? (PRICE_TO_PLAN[priceId] ?? "solo") : "solo";

  const stripeStatus = stripeSub.status;
  type OurStatus = "active" | "canceled" | "past_due" | "lifetime" | "trialing";
  const statusMap: Record<string, OurStatus> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    paused: "past_due",
  };

  const status: OurStatus = statusMap[stripeStatus] ?? "active";
  const periodEnd = new Date(stripeSub.current_period_end * 1000);

  await db.subscription.update({
    where: { stripeCustomerId: customerId },
    data: {
      plan,
      status,
      stripeSubscriptionId: stripeSub.id,
      currentPeriodEnd: periodEnd,
    },
  });

  // Sync expiry on the license key
  const sub = await db.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });
  if (sub) {
    await db.licenseKey.updateMany({
      where: { userId: sub.userId },
      data: { plan, expiresAt: periodEnd },
    });
  }
}
