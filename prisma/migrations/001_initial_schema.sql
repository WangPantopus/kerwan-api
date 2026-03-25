-- Migration: 001_initial_schema
-- Description: Create initial tables for users, subscriptions, and license keys

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE plan AS ENUM ('free', 'solo', 'pro');

CREATE TYPE subscription_status AS ENUM (
  'active',
  'canceled',
  'past_due',
  'lifetime',
  'trialing'
);

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id                     UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID                NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT                NOT NULL UNIQUE,
  stripe_subscription_id TEXT                UNIQUE,
  plan                   plan                NOT NULL DEFAULT 'free',
  status                 subscription_status NOT NULL DEFAULT 'active',
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE TABLE license_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key          TEXT        NOT NULL UNIQUE,
  plan         plan        NOT NULL,
  machine_id   TEXT,
  activated_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_license_keys_user_id ON license_keys(user_id);
CREATE INDEX idx_license_keys_machine_id ON license_keys(machine_id) WHERE machine_id IS NOT NULL;
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
