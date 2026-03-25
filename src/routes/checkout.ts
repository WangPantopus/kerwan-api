import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { stripeService, type PriceId } from "../services/stripeService.js";
import { config } from "../config.js";

const VALID_PRICE_IDS: PriceId[] = [
  "solo_monthly",
  "solo_yearly",
  "solo_lifetime",
  "pro_monthly",
  "pro_yearly",
  "pro_lifetime",
];

const createSessionSchema = z.object({
  plan: z.enum([
    "solo_monthly",
    "solo_yearly",
    "solo_lifetime",
    "pro_monthly",
    "pro_yearly",
    "pro_lifetime",
  ] as [PriceId, ...PriceId[]]),
  email: z.string().email().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function checkoutRoutes(app: FastifyInstance) {
  // POST /api/checkout
  // Creates a Stripe Checkout Session and returns the redirect URL.
  app.post("/", async (request, reply) => {
    const body = createSessionSchema.parse(request.body);

    const sessionParams: Parameters<typeof stripeService.createCheckoutSession>[0] = {
      priceId: body.plan,
      successUrl: body.successUrl ?? config.CHECKOUT_SUCCESS_URL,
      cancelUrl: body.cancelUrl ?? config.CHECKOUT_CANCEL_URL,
      ...(body.email !== undefined && { email: body.email }),
    };
    const url = await stripeService.createCheckoutSession(sessionParams);

    return reply.status(201).send({ url });
  });

  // GET /api/checkout/plans
  // Returns plan pricing metadata for the frontend to display.
  app.get("/plans", async (_request, reply) => {
    return reply.send({
      plans: [
        {
          id: "solo_monthly",
          name: "Solo",
          billing: "monthly",
          price: 1900,
          currency: "usd",
          description: "For independent professionals",
        },
        {
          id: "solo_yearly",
          name: "Solo",
          billing: "yearly",
          price: 19900,
          currency: "usd",
          description: "For independent professionals (save ~13%)",
        },
        {
          id: "solo_lifetime",
          name: "Solo Lifetime",
          billing: "one_time",
          price: 19900,
          currency: "usd",
          description: "Pay once, use forever",
        },
        {
          id: "pro_monthly",
          name: "Pro",
          billing: "monthly",
          price: 2900,
          currency: "usd",
          description: "For teams and power users",
        },
        {
          id: "pro_yearly",
          name: "Pro",
          billing: "yearly",
          price: 29900,
          currency: "usd",
          description: "For teams and power users (save ~14%)",
        },
        {
          id: "pro_lifetime",
          name: "Pro Lifetime",
          billing: "one_time",
          price: 29900,
          currency: "usd",
          description: "Pay once, use forever — team features included",
        },
      ],
    });
  });
}
