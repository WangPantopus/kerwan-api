import { randomBytes } from "node:crypto";
import { db } from "../db/client.js";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SEGMENT_LENGTH = 4;
const SEGMENT_COUNT = 4;

/**
 * Generates a single random segment of alphanumeric uppercase characters.
 * Uses crypto.randomBytes for cryptographic randomness.
 */
function generateSegment(): string {
  const bytes = randomBytes(SEGMENT_LENGTH * 2); // extra bytes for rejection sampling
  let segment = "";
  let i = 0;
  while (segment.length < SEGMENT_LENGTH) {
    const byte = bytes[i++]!;
    // Rejection sampling to avoid modulo bias
    if (byte < 256 - (256 % CHARSET.length)) {
      segment += CHARSET[byte % CHARSET.length];
    }
  }
  return segment;
}

/**
 * Generates a license key in the format KERWAN-XXXX-XXXX-XXXX-XXXX.
 */
export function generateLicenseKeyString(): string {
  const segments = Array.from({ length: SEGMENT_COUNT }, generateSegment);
  return `KERWAN-${segments.join("-")}`;
}

/**
 * Generates a unique license key string, retrying on collision.
 * Practically, collision probability is ~1 in 1.6 trillion — this is
 * defensive programming only.
 */
export async function generateUniqueLicenseKey(
  maxAttempts = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = generateLicenseKeyString();
    const existing = await db.licenseKey.findUnique({ where: { key } });
    if (!existing) {
      return key;
    }
  }
  throw new Error("Failed to generate a unique license key after multiple attempts");
}
