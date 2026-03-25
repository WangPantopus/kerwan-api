import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

// Mock stripeService so tests control webhook handling without touching Stripe SDK
vi.mock("../../src/services/stripeService.js", () => ({
  stripeService: {
    handleWebhook: vi.fn(),
    createCheckoutSession: vi
      .fn()
      .mockResolvedValue("https://checkout.stripe.com/test"),
  },
}));

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      payload: JSON.stringify({ type: "checkout.session.completed" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("MISSING_SIGNATURE");
  });

  it("returns 400 when handleWebhook throws an invalid-signature error", async () => {
    const { stripeService } = await import("../../src/services/stripeService.js");
    vi.mocked(stripeService.handleWebhook).mockRejectedValue(
      Object.assign(new Error("Invalid Stripe webhook signature"), {
        statusCode: 400,
        code: "INVALID_SIGNATURE",
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      payload: JSON.stringify({ type: "checkout.session.completed" }),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1234,v1=invalidsig",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 when handleWebhook resolves successfully", async () => {
    const { stripeService } = await import("../../src/services/stripeService.js");
    vi.mocked(stripeService.handleWebhook).mockResolvedValue(undefined);

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/stripe",
      payload: JSON.stringify({ type: "invoice.paid" }),
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=9999,v1=validsig",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
  });
});
