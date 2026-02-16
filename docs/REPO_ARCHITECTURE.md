# Repo Architecture

## Directory Tree

```txt
.
|-- apps
|   |-- actions-api
|   |   |-- src
|   |   |   |-- config.ts
|   |   |   |-- index.ts
|   |   |   |-- middleware
|   |   |   |   |-- action-audit-log.ts
|   |   |   |   |-- organizer-auth.ts
|   |   |   |   `-- rate-limit.ts
|   |   |   |-- routes
|   |   |   |   |-- actions.ts
|   |   |   |   |-- organizer.ts
|   |   |   |   `-- verifier.ts
|   |   |   `-- lib
|   |   |       |-- poap.ts
|   |   |       `-- solana.ts
|   |   |-- package.json
|   |   `-- tsconfig.json
|   `-- organizer-web
|       |-- app.js
|       |-- index.html
|       |-- package.json
|       |-- README.md
|       |-- server.mjs
|       `-- styles.css
|-- docs
|   |-- REPO_ARCHITECTURE.md
|   |-- TECHNICAL_SPEC.md
|   |-- WEEK1_EXECUTION.md
|   |-- WEEK2_EXECUTION.md
|   `-- WEEK3_EXECUTION.md
|-- packages
|   |-- db
|   |   |-- src
|   |   |   `-- index.ts
|   |   |-- package.json
|   |   `-- tsconfig.json
|   `-- shared-types
|       |-- src
|       |   `-- index.ts
|       `-- package.json
|-- .env.example
|-- package.json
|-- pnpm-workspace.yaml
`-- tsconfig.base.json
```

## Technical Decisions (MVP)

1. `actions-api` dipisah dari web agar endpoint Blink tetap ringan dan stabil.
2. Shared type package dipakai untuk sinkron kontrak data antara API dan frontend.
3. Store abstraction (`@campus/db`) mendukung PostgreSQL dan memory fallback untuk development cepat.
4. Start from off-chain workflow untuk speed delivery, dengan verifier API publik untuk validasi status wallet/txRef pada MVP.
5. Gunakan Solana devnet untuk development dan testing awal.

## Planned Near-Term Additions

- `apps/organizer-web` organizer dashboard full-feature (planned)
- `packages/db` migration scripts versioned (planned)
- `packages/poap-minter` (mint abstraction)
