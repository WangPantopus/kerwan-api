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

const kerwan = { "user-agent": "Kerwan/1.0" };

describe("POST /api/checkout", () => {
  it("returns 201 with a checkout URL for a valid plan", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checkout",
      headers: kerwan,
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
      headers: kerwan,
      payload: { plan: "enterprise" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts optional email in the body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checkout",
      headers: kerwan,
      payload: { plan: "pro_lifetime", email: "test@example.com" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 403 when User-Agent is not Kerwan", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/checkout",
      headers: { "user-agent": "curl/7.0" },
      payload: { plan: "solo_monthly" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("INVALID_USER_AGENT");
  });
});

describe("GET /api/checkout/plans", () => {
  it("returns all 6 plans", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/checkout/plans",
      headers: kerwan,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.plans).toHaveLength(6);
    const ids = body.plans.map((p: { id: string }) => p.id);
    expect(ids).toContain("solo_monthly");
    expect(ids).toContain("pro_lifetime");
  });
});
