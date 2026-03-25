import { vi } from "vitest";

// ─── Minimal env stubs so config.ts doesn't throw during tests ────────────────
process.env["NODE_ENV"] = "test";
process.env["DATABASE_URL"] = "postgresql://test:test@localhost:5432/kerwan_test";
process.env["STRIPE_SECRET_KEY"] = "sk_test_stub";
process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_stub";
process.env["STRIPE_PRICE_SOLO_MONTHLY"] = "price_solo_monthly";
process.env["STRIPE_PRICE_SOLO_YEARLY"] = "price_solo_yearly";
process.env["STRIPE_PRICE_SOLO_LIFETIME"] = "price_solo_lifetime";
process.env["STRIPE_PRICE_PRO_MONTHLY"] = "price_pro_monthly";
process.env["STRIPE_PRICE_PRO_YEARLY"] = "price_pro_yearly";
process.env["STRIPE_PRICE_PRO_LIFETIME"] = "price_pro_lifetime";
process.env["RESEND_API_KEY"] = "re_stub";
process.env["APP_URL"] = "https://kerwan.app";
process.env["CHECKOUT_SUCCESS_URL"] = "https://kerwan.app/welcome";
process.env["CHECKOUT_CANCEL_URL"] = "https://kerwan.app/pricing";

// Mock the Prisma client — tests that need DB use their own mock
vi.mock("../src/db/client.js", () => ({
  db: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    licenseKey: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
