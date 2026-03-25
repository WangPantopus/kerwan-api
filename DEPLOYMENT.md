# Kerwan API — Deployment Plan

## Overview

The API is deployed as a Dockerised Node.js service on **Railway**. Three
environments map to three Git branches:

| Branch    | Environment         | Railway service          |
|-----------|---------------------|--------------------------|
| `master`  | Production          | `kerwan-api`             |
| `staging` | Staging             | `kerwan-api-staging`     |
| `dev`     | Local / CI only     | —                        |

---

## First-time Setup

### 1. Create a Railway project

```bash
npm install -g @railway/cli
railway login
railway init          # creates a new project
railway service new   # creates the kerwan-api service
```

### 2. Provision a PostgreSQL database

In the Railway dashboard:
- Add a **PostgreSQL** plugin to the project.
- Railway will inject `DATABASE_URL` automatically.

For a staging environment, add a second PostgreSQL plugin and wire it to the
staging service.

### 3. Set environment variables

In Railway → kerwan-api → Variables, set every variable from `.env.example`:

```
NODE_ENV=production
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SOLO_MONTHLY=price_...
STRIPE_PRICE_SOLO_YEARLY=price_...
STRIPE_PRICE_SOLO_LIFETIME=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_PRO_LIFETIME=price_...
RESEND_API_KEY=re_...
APP_URL=https://kerwan.app
APP_LATEST_VERSION=1.0.0
APP_DOWNLOAD_BASE_URL=https://releases.kerwan.app
APP_RELEASE_NOTES_URL=https://kerwan.app/changelog
CHECKOUT_SUCCESS_URL=https://kerwan.app/welcome?session_id={CHECKOUT_SESSION_ID}
CHECKOUT_CANCEL_URL=https://kerwan.app/pricing
CORS_ORIGIN=https://kerwan.app
```

### 4. Add the Railway deploy token to GitHub

In Railway → Project Settings → Tokens, generate a deploy token.
Add it to GitHub → Settings → Secrets → Actions as `RAILWAY_TOKEN`.

Repeat for staging with secret name `RAILWAY_TOKEN_STAGING`.

### 5. Configure Stripe webhooks

In the Stripe dashboard:
- Add a webhook endpoint: `https://api.kerwan.app/api/webhooks/stripe`
- Select events:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`
  - `customer.subscription.updated`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## Deploy Flow

### Normal development

```
feature branch → PR → dev → PR → staging → PR → master
                       CI        CI + deploy  CI + deploy
```

1. Open a PR from your feature branch → `dev`.
2. CI runs (lint, typecheck, test). Merge when green.
3. Open a PR from `dev` → `staging`. This deploys to the Railway staging
   environment. Smoke-test the staging URL.
4. Open a PR from `staging` → `master`. This deploys to production.

### Hotfix

Branch from `master`, fix, PR directly to `master` after CI passes.

---

## Database Migrations

Migrations are run automatically at container start via `prisma migrate deploy`
(see `Dockerfile`). No manual step is needed on each deploy.

To create a new migration locally:

```bash
# Edit prisma/schema.prisma, then:
npx prisma migrate dev --name describe_your_change
# Commit the generated migration file alongside your code change.
```

**Never hand-edit generated migration files.** If you need to customise SQL,
create a new migration instead.

---

## Rollback

Railway supports instant rollback to any prior deployment from the dashboard
(Deployments → select a prior build → Rollback).

For database rollbacks, you must write and apply a reverse migration manually.
This is why schema changes should be backward-compatible where possible (add
columns before removing old ones, never rename a column in a single migration).

---

## Monitoring & Alerting

- **Health check**: Railway pings `GET /api/health` every 30 s. Sustained
  failures trigger an automatic restart.
- **Logs**: Streamed in the Railway dashboard and available via
  `railway logs --tail`.
- **Error tracking**: Integrate Sentry by setting `SENTRY_DSN` and calling
  `Sentry.init()` in `src/server.ts` (not included by default to keep
  dependencies lean).

---

## Custom Domain

In Railway → Networking → Custom Domain, add `api.kerwan.app` and point a
CNAME record to the generated Railway domain. Railway provisions a TLS cert
automatically.
