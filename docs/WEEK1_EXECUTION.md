# Week 1 Execution Plan

## Goal
Membuat jalur end-to-end minimal:
`register -> check-in -> claim-poap` via Solana Actions.

## Backlog

1. Setup workspace dan dependency.
2. Implement `GET/POST` untuk tiga action endpoint.
3. Implement transaction builder (memo/transfer).
4. Seed data event dummy.
5. Integrasi CORS dan `actions.json`.
6. Test dengan inspector + curl.

## Definition of Done

1. `pnpm --filter @campus/actions-api dev` jalan tanpa error.
2. Ketiga endpoint action bisa diakses.
3. POST endpoint mengembalikan base64 transaction.
4. Basic validation untuk wallet pubkey dan check-in secret aktif.

## Test Commands

```bash
curl http://localhost:3001/health
curl http://localhost:3001/actions.json
curl http://localhost:3001/api/actions/events/solana-campus-week/register
node scripts/smoke-actions-api.mjs
```
