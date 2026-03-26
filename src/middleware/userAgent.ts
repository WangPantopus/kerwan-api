import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

const ALLOWED_USER_AGENT_PREFIX = "Kerwan/";

/**
 * Fastify preHandler hook that validates the User-Agent header.
 * Only allows requests from the Kerwan macOS app (User-Agent starts with "Kerwan/").
 * Stripe webhooks and health checks bypass this — it's only applied to license + checkout routes.
 */
export function validateUserAgent(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction,
): void {
  const ua = request.headers["user-agent"] ?? "";

  if (!ua.startsWith(ALLOWED_USER_AGENT_PREFIX)) {
    reply.status(403).send({
      error: "Forbidden: requests must originate from the Kerwan app",
      code: "INVALID_USER_AGENT",
      statusCode: 403,
    });
    return;
  }

  done();
}
