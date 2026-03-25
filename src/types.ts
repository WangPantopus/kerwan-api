import type { Plan } from "@prisma/client";

// ─── Feature flags returned to the macOS app ─────────────────────────────────

export interface PlanFeatures {
  llm: boolean;
  unlimited_history: boolean;
  crm_export: boolean;
  team_sharing: boolean;
}

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  free: {
    llm: false,
    unlimited_history: false,
    crm_export: false,
    team_sharing: false,
  },
  solo: {
    llm: true,
    unlimited_history: true,
    crm_export: true,
    team_sharing: false,
  },
  pro: {
    llm: true,
    unlimited_history: true,
    crm_export: true,
    team_sharing: true,
  },
};

// ─── API response shapes ──────────────────────────────────────────────────────

export interface LicenseValidateResponse {
  valid: boolean;
  plan: Plan;
  features: PlanFeatures;
  expiresAt: string | null;
}

export interface LicenseActivateResponse {
  valid: boolean;
  plan: Plan;
  features: PlanFeatures;
  expiresAt: string | null;
}

export interface CheckoutSessionResponse {
  url: string;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  statusCode: number;
}
