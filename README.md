# MoiFlow Monorepo

MoiFlow is a Tamil/English, offline-first app with two clearly separated
domains — **Moi** (events, gift entries, people, villages, reports) and
**Finance** (credits, loans, business, transactions, settlements, reports, AI
insights) — backed by a shared FastAPI service and a web admin portal.

## Structure

```
.
├── apps/
│   ├── mobile/         React Native app (Moi + Finance + common)
│   ├── admin-portal/   Web admin portal (React + Vite) — talks to the API only
│   └── api-backend/    FastAPI modular monolith (auth, OTP, subscriptions, AI, Moi/Finance APIs, admin)
├── shared/             Cross-app TypeScript: types, constants, utils
├── package.json        npm workspaces root
└── README.md
```

The mobile `src/` is organized by domain so Moi and Finance business logic stay
separated, with shared mobile code under `common/`:

```
apps/mobile/src/
├── moi/       Moi domain (events, entries, people, villages, reports)
├── finance/   Finance domain (credits, loans, business, transactions)
└── common/    Shared mobile code (auth, navigation, theme, i18n, db, api, di)
```

## Architecture

```
Admin Portal ──┐
               ├──> FastAPI Backend ──> PostgreSQL
Mobile App  ───┘                    └─> (mobile also uses local offline-first SQLite)
```

- PostgreSQL is never exposed directly to the mobile app or the browser.
- All third-party secrets (2Factor, RevenueCat, Sarvam AI) live only in the
  backend and are read from environment variables — never shipped to clients.
- The backend is a single modular monolith (no microservices), suited to a solo
  developer: low cost, simple to operate, easy to scale later.

## Apps

### `apps/mobile` — React Native
The existing MoiFlow app. Offline-first SQLite storage, Tamil/English i18n,
voice input, OCR, MPIN auth. Uses the RevenueCat SDK for subscription status.

```bash
npm run mobile           # start Metro
npm run mobile:android   # run on Android
npm run mobile:test      # jest
```

### `apps/api-backend` — FastAPI + PostgreSQL
Authentication, 2Factor OTP, user + subscription management, RevenueCat webhook
handling, Sarvam AI service layer, Moi/Finance/Admin APIs.

```bash
cd apps/api-backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env                            # then fill in secrets
alembic upgrade head
uvicorn app.main:app --reload
```

### `apps/admin-portal` — React + Vite
Dashboard, users, subscriptions, Moi/Finance overview, AI usage, OTP/activity
monitoring, system config, audit logs. Communicates only with the FastAPI
backend.

```bash
npm run admin        # dev server
npm run admin:build  # production build
```

## Development phases

1. Monorepo structure and project separation ✅
2. FastAPI backend + PostgreSQL + migrations
3. Authentication + 2Factor OTP
4. RevenueCat + Google Play subscriptions
5. Sarvam AI integration
6. Admin portal + dashboard
7. Connect mobile Moi and Finance modules to backend APIs
8. Testing, security, error handling, documentation
