import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";

import { config } from "./config.js";
import { AppError } from "./lib/errors.js";
import { healthRoute } from "./routes/health.js";
import { licenseRoutes } from "./routes/license.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { updatesRoutes } from "./routes/updates.js";
import { checkoutRoutes } from "./routes/checkout.js";
import { validateUserAgent } from "./middleware/userAgent.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      ...(config.NODE_ENV !== "production" && {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }),
    },
    trustProxy: true,
  });

  // ─── Raw body capture (required for Stripe webhook signature verification) ──
  // We add a preParsing hook that clones the raw payload into request.rawBody
  // before the JSON body parser consumes the stream.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req: FastifyRequest, body: Buffer, done) => {
      // Attach raw buffer for routes that need it (e.g. Stripe webhooks)
      (req as unknown as { rawBody: Buffer }).rawBody = body;
      try {
        const parsed: unknown = JSON.parse(body.toString("utf8"));
        done(null, parsed);
      } catch (err) {
        const error = err as Error;
        error.message = `Invalid JSON: ${error.message}`;
        done(error, undefined);
      }
    },
  );

  // ─── Security ───────────────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: false, // API only — no HTML
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN === "*" ? true : config.CORS_ORIGIN.split(","),
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Global rate limit — generous for most endpoints
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, context) => ({
      error: "Too many requests",
      code: "RATE_LIMITED",
      statusCode: 429,
      retryAfter: context.after,
    }),
  });

  // ─── Error handler ──────────────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("; "),
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send(error);
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: "BAD_REQUEST",
        statusCode: error.statusCode,
      });
    }

    app.log.error({ err: error }, "Unhandled error");
    return reply.status(500).send({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    });
  });

  // ─── Routes ─────────────────────────────────────────────────────────────────
  await app.register(healthRoute);

  // License endpoints — tighter rate limit (10 req/min per IP) + User-Agent check
  await app.register(
    async (instance) => {
      instance.addHook("preHandler", validateUserAgent);
      await instance.register(rateLimit, {
        max: 10,
        timeWindow: "1 minute",
        keyGenerator: (req) =>
          req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
          req.ip,
        errorResponseBuilder: (_req, context) => ({
          error: "Too many license requests",
          code: "RATE_LIMITED",
          statusCode: 429,
          retryAfter: context.after,
        }),
      });
      await instance.register(licenseRoutes, { prefix: "/api/license" });
    },
  );

  await app.register(webhookRoutes, { prefix: "/api/webhooks" });
  await app.register(updatesRoutes, { prefix: "/api/updates" });
  await app.register(
    async (instance) => {
      instance.addHook("preHandler", validateUserAgent);
      await instance.register(checkoutRoutes, { prefix: "/api/checkout" });
    },
  );

  return app;
}
