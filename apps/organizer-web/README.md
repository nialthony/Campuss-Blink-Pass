# Organizer Web Verifier (MVP)

UI ringan untuk validasi credential event:
- event explorer (`/api/verifier/events`)
- lookup by wallet (`/api/verifier/events/:eventId/wallets/:wallet`)
- lookup by txRef (`/api/verifier/refs/:txRef`)

Deep-link supported:
- `/?txRef=<txRef>`
- `/?eventId=<eventId>&wallet=<wallet>`

## Run

```bash
corepack pnpm --filter @campus/organizer-web dev
```

Default URL:
- `http://localhost:3010`

Pastikan API jalan di:
- `http://localhost:3001`
