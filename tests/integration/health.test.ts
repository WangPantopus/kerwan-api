import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/client.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/health", () => {
  it("returns 200 with status ok when DB is reachable", async () => {
    vi.mocked(db.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);

    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });

  it("returns 503 when DB is unreachable", async () => {
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error("Connection refused"));

    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("unreachable");
  });
});
