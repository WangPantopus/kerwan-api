import { describe, it, expect, vi, beforeEach } from "vitest";
import { licenseService } from "../../src/services/licenseService.js";
import { db } from "../../src/db/client.js";
import { LicenseError } from "../../src/lib/errors.js";
import { PLAN_FEATURES } from "../../src/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const machineId = "mac-abc123";
const email = "user@example.com";

function makeLicense(overrides: Record<string, unknown> = {}) {
  return {
    id: "lic-1",
    key: "KERWAN-AAAA-BBBB-CCCC-DDDD",
    userId: "user-1",
    plan: "solo" as const,
    machineId: null,
    activatedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    user: {
      id: "user-1",
      email,
      createdAt: new Date(),
      subscription: null,
    },
    ...overrides,
  };
}

// ─── validate ─────────────────────────────────────────────────────────────────

describe("licenseService.validate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns valid:false with free plan when key not found", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(null);
    const result = await licenseService.validate("KERWAN-XXXX-XXXX-XXXX-XXXX", machineId);
    expect(result).toEqual({
      valid: false,
      plan: "free",
      features: PLAN_FEATURES.free,
      expiresAt: null,
    });
  });

  it("throws LICENSE_MACHINE_MISMATCH when machineId doesn't match", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId: "other-machine" }) as never,
    );
    await expect(
      licenseService.validate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId),
    ).rejects.toThrow(LicenseError);
  });

  it("throws LICENSE_INVALID when key is not yet activated", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId: null }) as never,
    );
    await expect(
      licenseService.validate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId),
    ).rejects.toThrow(LicenseError);
  });

  it("returns valid:true for an active activated key", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId }) as never,
    );
    vi.mocked(db.licenseKey.update).mockResolvedValue({} as never);

    const result = await licenseService.validate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId);
    expect(result.valid).toBe(true);
    expect(result.plan).toBe("solo");
    expect(result.features).toEqual(PLAN_FEATURES.solo);
  });

  it("returns valid:false for an expired key", async () => {
    const past = new Date(Date.now() - 86400_000);
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId, expiresAt: past }) as never,
    );

    const result = await licenseService.validate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId);
    expect(result.valid).toBe(false);
    expect(result.expiresAt).toBe(past.toISOString());
  });

  it("returns valid:false when subscription is canceled and period has ended", async () => {
    const past = new Date(Date.now() - 86400_000);
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({
        machineId,
        expiresAt: new Date(Date.now() + 86400_000), // not expired by key
        user: {
          id: "user-1",
          email,
          createdAt: new Date(),
          subscription: {
            status: "canceled",
            currentPeriodEnd: past, // but period ended
          },
        },
      }) as never,
    );

    const result = await licenseService.validate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId);
    expect(result.valid).toBe(false);
  });
});

// ─── activate ─────────────────────────────────────────────────────────────────

describe("licenseService.activate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("activates an unbound key", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense() as never,
    );
    vi.mocked(db.licenseKey.update).mockResolvedValue(
      makeLicense({ machineId, activatedAt: new Date() }) as never,
    );

    const result = await licenseService.activate(
      "KERWAN-AAAA-BBBB-CCCC-DDDD",
      machineId,
      email,
    );
    expect(result.valid).toBe(true);
    expect(result.plan).toBe("solo");
    expect(db.licenseKey.update).toHaveBeenCalledOnce();
  });

  it("is idempotent for the same machine", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId }) as never,
    );

    const result = await licenseService.activate(
      "KERWAN-AAAA-BBBB-CCCC-DDDD",
      machineId,
      email,
    );
    expect(result.valid).toBe(true);
    expect(db.licenseKey.update).not.toHaveBeenCalled();
  });

  it("throws LICENSE_MAX_ACTIVATIONS when already on a different machine", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId: "other-machine" }) as never,
    );
    await expect(
      licenseService.activate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId, email),
    ).rejects.toThrow(LicenseError);
  });

  it("throws LICENSE_INVALID when key not found", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(null);
    await expect(
      licenseService.activate("KERWAN-XXXX-XXXX-XXXX-XXXX", machineId, email),
    ).rejects.toThrow(LicenseError);
  });

  it("throws LICENSE_INVALID when email doesn't match", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense() as never,
    );
    await expect(
      licenseService.activate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId, "wrong@example.com"),
    ).rejects.toThrow(LicenseError);
  });

  it("throws LICENSE_EXPIRED for an expired key", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ expiresAt: new Date(Date.now() - 1000) }) as never,
    );
    await expect(
      licenseService.activate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId, email),
    ).rejects.toThrow(LicenseError);
  });
});

// ─── deactivate ───────────────────────────────────────────────────────────────

describe("licenseService.deactivate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deactivates an active key", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId }) as never,
    );
    vi.mocked(db.licenseKey.update).mockResolvedValue({} as never);

    await licenseService.deactivate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId);
    expect(db.licenseKey.update).toHaveBeenCalledWith({
      where: { key: "KERWAN-AAAA-BBBB-CCCC-DDDD" },
      data: { machineId: null, activatedAt: null },
    });
  });

  it("is idempotent when key is already deactivated", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(
      makeLicense({ machineId: null }) as never,
    );

    await licenseService.deactivate("KERWAN-AAAA-BBBB-CCCC-DDDD", machineId);
    expect(db.licenseKey.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when key doesn't exist", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(null);
    await expect(
      licenseService.deactivate("KERWAN-XXXX-XXXX-XXXX-XXXX", machineId),
    ).rejects.toThrow("License key not found");
  });
});
