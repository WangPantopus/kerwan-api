import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateLicenseKeyString, generateUniqueLicenseKey } from "../../src/lib/licenseKey.js";
import { db } from "../../src/db/client.js";

describe("generateLicenseKeyString", () => {
  it("produces keys matching the KERWAN-XXXX-XXXX-XXXX-XXXX format", () => {
    const key = generateLicenseKeyString();
    expect(key).toMatch(/^KERWAN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("generates unique keys on repeated calls", () => {
    const keys = new Set(Array.from({ length: 1000 }, generateLicenseKeyString));
    // With 36^16 ≈ 7.9e24 possible keys, 1000 collisions would be astronomically unlikely
    expect(keys.size).toBe(1000);
  });

  it("uses only uppercase alphanumeric characters", () => {
    for (let i = 0; i < 100; i++) {
      const key = generateLicenseKeyString();
      const segments = key.replace("KERWAN-", "").split("-");
      for (const segment of segments) {
        expect(segment).toMatch(/^[A-Z0-9]{4}$/);
      }
    }
  });
});

describe("generateUniqueLicenseKey", () => {
  beforeEach(() => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue(null);
  });

  it("returns a key when no collision exists", async () => {
    const key = await generateUniqueLicenseKey();
    expect(key).toMatch(/^KERWAN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("retries on collision and eventually returns a unique key", async () => {
    // First call returns an existing key (collision), second is null (free)
    vi.mocked(db.licenseKey.findUnique)
      .mockResolvedValueOnce({ id: "existing" } as never)
      .mockResolvedValue(null);

    const key = await generateUniqueLicenseKey();
    expect(key).toMatch(/^KERWAN-/);
    expect(db.licenseKey.findUnique).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting max attempts", async () => {
    vi.mocked(db.licenseKey.findUnique).mockResolvedValue({ id: "existing" } as never);
    await expect(generateUniqueLicenseKey(3)).rejects.toThrow(
      "Failed to generate a unique license key",
    );
  });
});
