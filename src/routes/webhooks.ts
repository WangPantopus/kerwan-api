import type { FastifyInstance } from "fastify";
import { stripeService } from "../services/stripeService.js";

export async function webhookRoutes(app: FastifyInstance) {
  // POST /api/webhooks/stripe
  // Stripe sends a raw request body — we must NOT let Fastify JSON-parse it
  // before we verify the signature. We register a raw content-type parser
  // scoped to this route only via the `preParsing` hook + addContentTypeParser.
  app.post(
    "/stripe",
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const signature = request.headers["stripe-signature"];
      if (!signature || typeof signature !== "string") {
        return reply.status(400).send({
          error: "Missing stripe-signature header",
          code: "MISSING_SIGNATURE",
          statusCode: 400,
        });
      }

      // rawBody is populated by the raw body plugin registered in app.ts
      const rawBody = (request as unknown as { rawBody: Buffer }).rawBody;
      if (!rawBody) {
        return reply.status(400).send({
          error: "Could not read raw request body",
          code: "BAD_REQUEST",
          statusCode: 400,
        });
      }

      await stripeService.handleWebhook(rawBody, signature);
      return reply.status(200).send({ received: true });
    },
  );
}
