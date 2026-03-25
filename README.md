# Kerwan API

Backend API service for [Kerwan](https://kerwan.app) — a local-first macOS desktop app that passively captures professional activity and converts it into searchable client timelines, billable session suggestions, and relationship memory.

> This repo contains **only the backend API**. The macOS app (Swift/SwiftUI), Chrome extension (JS), and Whisper/Ollama AI pipeline all run locally on the user's machine. This service handles licensing, billing, and update distribution — no user data ever touches this server.

---

## What This Service Does

| Endpoint | Purpose |
|---|---|
| `POST /api/license/validate` | Verify a license key on app launch |
| `POST /api/license/activate` | Activate a new license key + bind to machine ID |
| `POST /api/webhooks/stripe` | Handle Stripe subscription lifecycle events |
| `GET /api/updates/latest` | Serve Sparkle auto-update appcast manifest |
| `GET /api/health` | Health check |

## What This Service Does NOT Do

- Store, process, or transmit user activity data (audio, transcripts, emails, contacts)
- Run AI inference — all AI (Whisper, Ollama, nomic-embed-text) runs on the user's device
- Act as a relay between the macOS app and any third-party service

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Fastify |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth / Billing | Stripe |
| Deployment | Railway |
| CI/CD | GitHub Actions |

---

## Database Schema (PostgreSQL)

Three core tables:

- **`users`** — email + created_at
- **`subscriptions`** — Stripe customer/subscription IDs, plan (`free` / `solo` / `pro`), status
- **`license_keys`** — license key strings (`KERWAN-XXXX-XXXX-XXXX-XXXX`), machine binding, expiry

---

## Repo Structure (planned)

```
kerwan-api/
├── src/
│   ├── routes/
│   │   ├── license.ts       # /api/license/*
│   │   ├── updates.ts       # /api/updates/latest (Sparkle appcast)
│   │   └── webhooks.ts      # /api/webhooks/stripe
│   ├── services/
│   │   ├── licenseService.ts
│   │   └── stripeService.ts
│   ├── db/
│   │   └── prisma/
│   │       └── schema.prisma
│   ├── middleware/
│   └── app.ts               # Fastify app entry point
├── tests/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Branches

| Branch | Purpose |
|---|---|
| `master` | Production — deployed to Railway production environment |
| `staging` | Staging — deployed to Railway staging environment, mirrors production config |
| `dev` | Active development — PRs merge here first |

---

## License Validation Flow

1. macOS app reads license key from Keychain on launch
2. Sends `POST /api/license/validate` with `{ key, machineId }`
3. Server checks key validity, plan status, and machine binding
4. Returns `{ valid: true, plan: "solo", features: { ... } }`
5. App caches the response — valid for 7 days offline. After 7 days without validation, paid features are disabled but local capture continues (no data loss)

---

## Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in: DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

# Run database migrations
npx prisma migrate dev

# Start dev server
npm run dev
```

---

## Related

- Kerwan macOS app — Swift 5.9+ / SwiftUI (private repo)
- Kerwan Chrome extension — Manifest V3 (private repo)
