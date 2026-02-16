# Campus Blink Pass

Monorepo starter untuk project grant Solana Indonesia:
- Blink Actions API: register, check-in, claim POAP
- Organizer verifier web app
- Database layer: PostgreSQL store + memory fallback
- Shared types package

## Quick Start

1. Install dependency:
```bash
corepack pnpm install
```

2. Copy environment file:
```bash
copy .env.example .env
copy apps\actions-api\.env.example apps\actions-api\.env
```

3. Run API:
```bash
corepack pnpm --filter @campus/actions-api dev
```

4. Run verifier web:
```bash
corepack pnpm --filter @campus/organizer-web dev
```

5. Health check:
`GET http://localhost:3001/health`

6. Smoke test flow:
```bash
node scripts\smoke-actions-api.mjs
```

7. Smoke test organizer flow:
```bash
node scripts\smoke-organizer-api.mjs
```

8. Smoke test verifier web:
```bash
node scripts\smoke-organizer-web.mjs
```

9. Full integration verify:
```bash
node scripts\verify-api.mjs
```

## Optional: Enable PostgreSQL

Isi `DATABASE_URL` pada `.env` atau `apps/actions-api/.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/campus_blink_pass
```

Jika `DATABASE_URL` kosong, service otomatis pakai memory store.

## Organizer API Auth

Set API key organizer via env:

```bash
ORGANIZER_API_KEY=dev-organizer-key
```

Use header `x-api-key` untuk akses endpoint `/api/organizer/*`.

Organizer endpoints yang tersedia:
- `GET /api/organizer/overview`
- `GET /api/organizer/analytics/retention?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/organizer/events`
- `GET /api/organizer/events/:eventId`
- `POST /api/organizer/events`
- `PATCH /api/organizer/events/:eventId`
- `GET /api/organizer/events/:eventId/stats`
- `GET /api/organizer/events/:eventId/analytics/timeseries?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/organizer/events/:eventId/participants?stage=all|registered|checked-in|claimed&search=<wallet>&limit=200&offset=0`
- `GET /api/organizer/events/:eventId/export.csv?stage=all|registered|checked-in|claimed&search=<wallet>&limit=200&offset=0`

Verifier endpoints (public):
- `GET /api/verifier/events?status=published|all`
- `GET /api/verifier/events/:eventId/wallets/:wallet`
- `GET /api/verifier/refs/:txRef`

Response `POST /api/actions/*` sekarang menyertakan `txRef`.
Khusus `claim-poap` juga menyertakan:
- `mintAddress`
- `verifyUrl` (deep-link ke web verifier by txRef)
- `verifyWalletUrl` (deep-link ke web verifier by wallet)
- `mintMode` (`mock|real`)
- `mintTxSignature` + `mintExplorerUrl` saat mode real aktif

## Rate Limit

Actions endpoint `/api/actions/*` dibatasi per IP:

```bash
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
```

## Real POAP Mint (Devnet)

Untuk mengaktifkan mint on-chain real (SPL token) saat `claim-poap`:

1. Set env:
```bash
POAP_MINT_MODE=real
POAP_MINTER_SECRET_KEY=[1,2,3,...]
```

`POAP_MINTER_SECRET_KEY` harus format JSON array secret key Solana.

2. Saat claim, API akan:
- membuat collection mint otomatis jika `event.poapCollection` masih kosong,
- mint `1` token (decimals `0`) ke wallet claimant,
- menyimpan signature tx mint sebagai `txRef`.

Catatan:
- Jika faucet devnet kena limit (`429 Too Many Requests`), isi wallet minter manual via faucet atau gunakan wallet yang sudah funded.
- Quick verify real mint (best effort): `corepack pnpm verify:api:real`

## Workspace

- `apps/actions-api`: Solana Actions API service
- `apps/organizer-web`: verifier web UI (MVP), organizer dashboard lanjutan masih planned
- `packages/db`: event store abstraction (postgres/memory)
- `packages/shared-types`: shared domain types
- `docs/`: technical spec dan execution docs
