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

const validKey = "KERWAN-AAAA-BBBB-CCCC-DDDD";
const machineId = "mac-test-001";
const email = "test@example.com";

function makeLicense(overrides: Record<string, unknown> = {}) {
  return {
    id: "lic-1",
    key: validKey,
    userId: "user-1",
    plan: "solo" as const,
    machineId: null,
    activatedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    user: { id: "user-1", email, createdAt: new Date(), subscription: null },
    ...overrides,
  };
}

// ─── POST /api/license/validate ───────────────────────────────────────────────

describe("POST /api/license/validate", () => {
  it("returns 200 with valid:false when key not found", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/license/validate",
      payload: { key: validKey, machineId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.plan).toBe("free");
  });

  it("returns 200 with valid:true for an activated key", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId }) as never,
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/license/validate",
      payload: { key: validKey, machineId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.plan).toBe("solo");
    expect(body.features).toMatchObject({ llm: true, team_sharing: false });
  });

  it("returns 422 when machine doesn't match", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId: "other-mac" }) as never,
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/license/validate",
      payload: { key: validKey, machineId },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("LICENSE_MACHINE_MISMATCH");
  });

  it("returns 400 when body is missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/license/validate",
      payload: { key: validKey }, // missing machineId
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /api/license/activate ──────────────────────────────────────────────

describe("POST /api/license/activate", () => {
  it("activates a key and returns 201", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense() as never,
    );
    vi.mocked(db.licenseKey.update).mockResolvedValue(
      makeLicense({ machineId, activatedAt: new Date() }) as never,
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/license/activate",
      payload: { key: validKey, machineId, email },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.plan).toBe("solo");
  });

  it("returns 422 when key is not found", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/license/activate",
      payload: { key: validKey, machineId, email },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("LICENSE_INVALID");
  });

  it("returns 400 for invalid email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/license/activate",
      payload: { key: validKey, machineId, email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /api/license/deactivate ────────────────────────────────────────────

describe("POST /api/license/deactivate", () => {
  it("returns 204 on successful deactivation", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId }) as never,
    );
    vi.mocked(db.licenseKey.update).mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: "/api/license/deactivate",
      payload: { key: validKey, machineId },
    });

    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when key not found", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/license/deactivate",
      payload: { key: "KERWAN-XXXX-XXXX-XXXX-XXXX", machineId },
    });

    expect(res.statusCode).toBe(404);
  });
});
