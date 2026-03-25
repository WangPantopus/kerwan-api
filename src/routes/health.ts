import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";

export async function healthRoute(app: FastifyInstance) {
  app.get("/api/health", async (_request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return reply.status(200).send({
        status: "ok",
        db: "ok",
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.status(503).send({
        status: "degraded",
        db: "unreachable",
        timestamp: new Date().toISOString(),
      });
    }
  });
}
