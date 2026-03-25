import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

// Mock Stripe so tests don't make real API calls
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" }),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  })),
}));

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/checkout", () => {
  it("returns 201 with a checkout URL for a valid plan", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checkout",
      payload: { plan: "solo_monthly" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.url).toContain("stripe.com");
  });

  it("returns 400 for an invalid plan", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checkout",
      payload: { plan: "enterprise" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts optional email in the body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checkout",
      payload: { plan: "pro_lifetime", email: "test@example.com" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("GET /api/checkout/plans", () => {
  it("returns all 6 plans", async () => {
    const res = await app.inject({ method: "GET", url: "/api/checkout/plans" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plans).toHaveLength(6);
    const ids = body.plans.map((p: { id: string }) => p.id);
    expect(ids).toContain("solo_monthly");
    expect(ids).toContain("pro_lifetime");
  });
});
