import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildApp } from "../../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/updates/latest", () => {
  it("returns JSON with version field", async () => {
    const res = await app.inject({ method: "GET", url: "/api/updates/latest" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.version).toBeDefined();
    expect(body.minimumSystemVersion).toBe("13.0");
  });
});

describe("GET /api/updates/appcast.xml", () => {
  it("returns valid XML with Sparkle namespace", async () => {
    const res = await app.inject({ method: "GET", url: "/api/updates/appcast.xml" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.payload).toContain("<rss");
    expect(res.payload).toContain("sparkle");
    expect(res.payload).toContain("<sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion>");
  });
});
