import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().url(),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Stripe price IDs — subscription
  STRIPE_PRICE_SOLO_MONTHLY: z.string().min(1),
  STRIPE_PRICE_SOLO_YEARLY: z.string().min(1),
  STRIPE_PRICE_PRO_MONTHLY: z.string().min(1),
  STRIPE_PRICE_PRO_YEARLY: z.string().min(1),

  // Stripe price IDs — one-time lifetime
  STRIPE_PRICE_SOLO_LIFETIME: z.string().min(1),
  STRIPE_PRICE_PRO_LIFETIME: z.string().min(1),

  // Email — Resend
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().default("Kerwan <noreply@kerwan.app>"),

  // App
  APP_URL: z.string().url().default("https://kerwan.app"),
  APP_LATEST_VERSION: z.string().default("1.0.0"),
  APP_DOWNLOAD_BASE_URL: z.string().url().optional(),
  APP_RELEASE_NOTES_URL: z.string().url().optional(),

  // Checkout redirect URLs
  CHECKOUT_SUCCESS_URL: z
    .string()
    .url()
    .default("https://kerwan.app/welcome?session_id={CHECKOUT_SESSION_ID}"),
  CHECKOUT_CANCEL_URL: z.string().url().default("https://kerwan.app/pricing"),

  // License encryption key — used to HMAC-sign license keys for tamper detection
  LICENSE_ENCRYPTION_KEY: z.string().min(32),

  // Optional: internal admin key for server-to-server calls
  ADMIN_API_KEY: z.string().min(32).optional(),

  // CORS
  CORS_ORIGIN: z.string().default("*"),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const messages = Object.entries(errors)
      .map(([k, v]) => `  ${k}: ${v?.join(", ")}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${messages}`);
  }
  return result.data;
}

export const config = parseEnv();
export type Config = typeof config;
