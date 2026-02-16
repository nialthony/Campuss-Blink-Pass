# Week 2 Execution Plan

## Goal
Memindahkan state event/attendance dari memory-only ke persistence layer yang siap production.

## Backlog

1. Implement `@campus/db` storage abstraction.
2. Integrasi PostgreSQL store dengan auto table bootstrap.
3. Tambahkan memory fallback jika `DATABASE_URL` tidak tersedia.
4. Refactor actions router agar sepenuhnya store-driven.
5. Tambahkan organizer API + auth API key.
6. Tambahkan organizer analytics endpoint (`overview`, `retention`, `stats`, `timeseries`, `participants`, `export.csv`).
7. Tambahkan index DB untuk query analytics/event feed.
8. Tambahkan rate limit dan action audit log.
9. Tambahkan smoke test untuk memastikan flow tetap stabil.

## Definition of Done

1. Endpoint register/check-in/claim tetap kompatibel (tanpa perubahan kontrak JSON).
2. Service jalan di mode memory dan mode postgres.
3. Data dedup tetap terjaga (`1 wallet` per event untuk register/check-in/claim).
4. Organizer endpoint butuh `x-api-key`.
5. Rate limit aktif untuk route actions.
6. Typecheck lolos.

## Runbook

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm dev:api
node scripts/smoke-actions-api.mjs
node scripts/smoke-organizer-api.mjs
```
