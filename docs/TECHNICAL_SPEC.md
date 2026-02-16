# Technical Spec: Campus Blink Pass (MVP)

## 1. Objective

Membangun platform event kampus/komunitas berbasis Solana Blink yang mendukung:
- registrasi peserta dari link Blink,
- check-in event dengan validasi secret + waktu,
- claim POAP/credential on-chain,
- halaman verifikasi credential publik.

Target MVP: siap dipakai untuk 2 event pilot dalam 4 minggu.

## 2. Scope

### In Scope (MVP)
- Solana Actions endpoint untuk:
  - `register`
  - `check-in`
  - `claim-poap`
- Organizer endpoint untuk:
  - create event
  - list event
  - update event
- Organizer dashboard basic:
  - buat event,
  - lihat jumlah registrasi/check-in/claim,
  - export CSV sederhana.
- Verifier page:
  - cek wallet/event/tx hash.
- Proteksi dasar anti-abuse:
  - 1 wallet 1 check-in per event,
  - validasi check-in secret,
  - validasi rentang waktu check-in.

### Out of Scope (Post-MVP)
- Dynamic pricing tiket.
- Fiat on-ramp.
- Multi-organizer RBAC kompleks.
- Mobile native app.

## 3. Users

- `Participant`: register, check-in, claim POAP.
- `Organizer`: create/manage event, monitor progress.
- `Verifier`: cek validitas credential.

## 4. High-Level Flow

1. Organizer create event di dashboard.
2. Sistem generate URL Blink register:
   - `/api/actions/events/:eventId/register`
3. Peserta klik Blink register dan sign transaction.
4. Saat event, peserta check-in via Blink:
   - `/api/actions/events/:eventId/check-in`
5. Setelah check-in valid, peserta claim POAP:
   - `/api/actions/events/:eventId/claim-poap`
6. Verifier cek status credential di halaman publik.

## 5. Architecture

- `apps/actions-api`
  - Node.js + Express + TypeScript
  - Endpoint Solana Actions + organizer API
  - Integrasi Solana RPC (`@solana/web3.js`) + SPL token mint (`@solana/spl-token`)
- `apps/organizer-web`
  - Verifier web MVP (HTML/CSS/JS)
  - Event explorer + wallet/txRef verification
- `packages/shared-types`
  - domain types shared
- `packages/db`
  - storage abstraction (postgres/memory)

Storage mode:
- local default: memory
- production target: PostgreSQL via `DATABASE_URL`

## 6. Data Model (Logical)

### Event
- `id: string`
- `name: string`
- `description: string`
- `startAt: ISO datetime`
- `endAt: ISO datetime`
- `checkInSecret: string`
- `ticketPriceLamports: number`
- `poapCollection: string | null`
- `status: draft | published | ended`

### Registration
- `id: string`
- `eventId: string`
- `wallet: string`
- `txSignature: string`
- `registeredAt: ISO datetime`

### CheckIn
- `id: string`
- `eventId: string`
- `wallet: string`
- `txSignature: string`
- `checkedInAt: ISO datetime`

### Claim
- `id: string`
- `eventId: string`
- `wallet: string`
- `mintAddress: string | null`
- `txSignature: string`
- `claimedAt: ISO datetime`

## 7. API Contract (MVP)

### Health
- `GET /health`

### Actions manifest
- `GET /actions.json`

### Organizer API (protected by `x-api-key`)
- `GET /api/organizer/overview`
- `GET /api/organizer/analytics/retention`
- `GET /api/organizer/events`
- `GET /api/organizer/events/:eventId`
- `POST /api/organizer/events`
- `PATCH /api/organizer/events/:eventId`
- `GET /api/organizer/events/:eventId/stats`
- `GET /api/organizer/events/:eventId/analytics/timeseries`
- `GET /api/organizer/events/:eventId/participants`
- `GET /api/organizer/events/:eventId/export.csv`

### Verifier API (public)
- `GET /api/verifier/events`
- `GET /api/verifier/events/:eventId/wallets/:wallet`
- `GET /api/verifier/refs/:txRef`

### Register Action
- `GET /api/actions/events/:eventId/register`
  - return action metadata + label/button.
- `POST /api/actions/events/:eventId/register`
  - body: `{ "account": "<wallet pubkey>" }`
  - return: `{ "transaction": "<base64 tx>", "txRef": "<proof ref>", "message": "..." }`

### Check-in Action
- `GET /api/actions/events/:eventId/check-in`
- `POST /api/actions/events/:eventId/check-in`
  - body: `{ "account": "<wallet>", "secret": "<check-in secret>" }`

### Claim POAP Action
- `GET /api/actions/events/:eventId/claim-poap`
- `POST /api/actions/events/:eventId/claim-poap`
  - body: `{ "account": "<wallet>" }`
  - precondition: wallet sudah check-in.
  - return includes: `txRef`, `mintAddress`, `verifyUrl`, `verifyWalletUrl`, `mintMode`.
  - jika `POAP_MINT_MODE=real`, `txRef` berisi signature tx mint on-chain.

## 8. Security and Abuse Prevention

- Validate public key format.
- Organizer route protected by API key (`x-api-key`).
- Check-in hanya valid di time window event.
- Secret wajib benar untuk check-in.
- Single claim per wallet per event.
- Basic rate limiting per IP untuk `/api/actions/*`.
- Log audit event action (request id + wallet + status).

## 9. Observability

- Structured log (JSON):
  - `timestamp`, `route`, `eventId`, `wallet`, `result`.
- Metrics:
  - register attempts/success
  - check-in attempts/success
  - claim attempts/success
  - error rate per endpoint

## 10. Delivery Plan (4 Weeks)

### Week 1
- Repo scaffold
- Actions endpoints stub + Solana tx builder
- Event seed + local testing with inspector

### Week 2
- DB hardening (PostgreSQL indexes + backup policy)
- Organizer auth basic
- Check-in window enforcement + rate limit

### Week 3
- POAP mint integration
- Public verifier page
- Event analytics v1

### Week 4
- Pilot 2 event
- bugfix + hardening
- docs + open-source release

## 11. Success Metrics

- 2 event pilot sukses end-to-end
- 300 registrasi wallet unik
- 150 credential claimed
- tx success rate > 95%
- median action completion < 15 detik
