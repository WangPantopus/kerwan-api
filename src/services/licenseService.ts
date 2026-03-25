import type { Plan } from "@prisma/client";
import { db } from "../db/client.js";
import { LicenseError, NotFoundError, ValidationError } from "../lib/errors.js";
import { generateUniqueLicenseKey } from "../lib/licenseKey.js";
import {
  PLAN_FEATURES,
  type LicenseActivateResponse,
  type LicenseValidateResponse,
} from "../types.js";

export const licenseService = {
  /**
   * Validates a license key for a given machine.
   * Called by the macOS app on launch and periodically.
   */
  async validate(
    key: string,
    machineId: string,
  ): Promise<LicenseValidateResponse> {
    const license = await db.licenseKey.findUnique({
      where: { key },
      include: {
        user: { include: { subscription: true } },
      },
    });

    if (!license) {
      return {
        valid: false,
        plan: "free",
        features: PLAN_FEATURES["free"],
        expiresAt: null,
      };
    }

    // Machine binding check
    if (license.machineId && license.machineId !== machineId) {
      throw new LicenseError(
        "This license key is activated on a different machine",
        "LICENSE_MACHINE_MISMATCH",
      );
    }

    // Not yet activated — key exists but hasn't been bound
    if (!license.machineId) {
      throw new LicenseError(
        "License key has not been activated yet",
        "LICENSE_INVALID",
      );
    }

    // Expiry check (subscription-type keys only; lifetime keys have null expiresAt)
    if (license.expiresAt && license.expiresAt < new Date()) {
      return {
        valid: false,
        plan: license.plan,
        features: PLAN_FEATURES[license.plan],
        expiresAt: license.expiresAt.toISOString(),
      };
    }

    // For subscription-backed keys, also verify the subscription is still healthy
    const sub = license.user.subscription;
    if (license.expiresAt !== null) {
      // Subscription key — check subscription status
      if (sub && sub.status === "canceled") {
        const now = new Date();
        const periodEnd = sub.currentPeriodEnd;
        if (periodEnd && periodEnd < now) {
          return {
            valid: false,
            plan: license.plan,
            features: PLAN_FEATURES[license.plan],
            expiresAt: periodEnd.toISOString(),
          };
        }
      }
    }

    return {
      valid: true,
      plan: license.plan,
      features: PLAN_FEATURES[license.plan],
      expiresAt: license.expiresAt?.toISOString() ?? null,
    };
  },

  /**
   * Activates a license key — binds it to a machineId.
   * Idempotent: re-activating the same key+machine returns success.
   */
  async activate(
    key: string,
    machineId: string,
    email: string,
  ): Promise<LicenseActivateResponse> {
    const license = await db.licenseKey.findUnique({
      where: { key },
      include: { user: true },
    });

    if (!license) {
      throw new LicenseError("License key not found", "LICENSE_INVALID");
    }

    // Verify the email matches the license owner (prevent key sharing)
    if (license.user.email.toLowerCase() !== email.toLowerCase()) {
      throw new LicenseError(
        "License key does not match the provided email address",
        "LICENSE_INVALID",
      );
    }

    // Already activated on this machine — idempotent success
    if (license.machineId === machineId) {
      return {
        valid: true,
        plan: license.plan,
        features: PLAN_FEATURES[license.plan],
        expiresAt: license.expiresAt?.toISOString() ?? null,
      };
    }

    // Already activated on a different machine
    if (license.machineId && license.machineId !== machineId) {
      throw new LicenseError(
        "This license key is already activated on another machine. Deactivate it there first.",
        "LICENSE_MAX_ACTIVATIONS",
      );
    }

    // Expiry check
    if (license.expiresAt && license.expiresAt < new Date()) {
      throw new LicenseError("License key has expired", "LICENSE_EXPIRED");
    }

    const updated = await db.licenseKey.update({
      where: { key },
      data: {
        machineId,
        activatedAt: new Date(),
      },
    });

    return {
      valid: true,
      plan: updated.plan,
      features: PLAN_FEATURES[updated.plan],
      expiresAt: updated.expiresAt?.toISOString() ?? null,
    };
  },

  /**
   * Creates a new license key for a user.
   * Called internally by the webhook handler after a successful purchase.
   */
  async createForUser(params: {
    userId: string;
    plan: Plan;
    expiresAt: Date | null;
  }): Promise<string> {
    const key = await generateUniqueLicenseKey();
    await db.licenseKey.create({
      data: {
        userId: params.userId,
        key,
        plan: params.plan,
        expiresAt: params.expiresAt,
      },
    });
    return key;
  },

  /**
   * Deactivates a license key (unbinds it from machineId).
   * Allows the user to move to a different machine.
   */
  async deactivate(key: string, machineId: string): Promise<void> {
    const license = await db.licenseKey.findUnique({ where: { key } });

    if (!license) {
      throw new NotFoundError("License key not found");
    }

    if (!license.machineId) {
      // Already deactivated — idempotent
      return;
    }

    if (license.machineId !== machineId) {
      throw new ValidationError(
        "machineId does not match the activated machine for this key",
      );
    }

    await db.licenseKey.update({
      where: { key },
      data: { machineId: null, activatedAt: null },
    });
  },
};
