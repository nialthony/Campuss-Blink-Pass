# Week 3 Execution Plan

## Goal
Mulai fase verifier + proof tracking agar credential event bisa dicek publik berdasarkan wallet atau `txRef`.

## Backlog

1. Tambahkan penyimpanan `txRef` untuk register/check-in/claim.
2. Tambahkan `mintAddress` (mock) pada claim untuk MVP verifier.
3. Tambahkan endpoint verifier publik:
   - `GET /api/verifier/events`
   - `GET /api/verifier/events/:eventId/wallets/:wallet`
   - `GET /api/verifier/refs/:txRef`
4. Implement web verifier MVP di `apps/organizer-web` (event explorer + deep-link).
5. Tambahkan deep-link verifier pada response `claim-poap`.
6. Integrasi POAP mint on-chain real via SPL token (`POAP_MINT_MODE=real`).
7. Tambahkan smoke flow verifier ke script API.
8. Update dokumentasi endpoint dan arsitektur.

## Definition of Done

1. Flow actions existing tetap kompatibel.
2. Mode memory dan postgres sama-sama menyimpan proof (`txRef`).
3. Wallet verifier mengembalikan status `not-registered|registered|checked-in|claimed`.
4. Lookup `txRef` bisa resolve stage + event + wallet.
5. Typecheck dan verify script lolos.

## Runbook

```bash
corepack pnpm typecheck
node scripts/verify-api.mjs
```
