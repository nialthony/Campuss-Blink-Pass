import "dotenv/config";

const PORT = Number(process.env.PORT ?? "3001");
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const APP_BASE_URL = process.env.APP_BASE_URL ?? `http://localhost:${PORT}`;
const TREASURY_PUBKEY = process.env.TREASURY_PUBKEY ?? "11111111111111111111111111111111";
const DATABASE_URL = process.env.DATABASE_URL;
const ORGANIZER_API_KEY = process.env.ORGANIZER_API_KEY ?? "dev-organizer-key";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? "60000");
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? "60");
const SOLANA_NETWORK = process.env.SOLANA_NETWORK ?? "devnet";
const POAP_MINT_MODE = process.env.POAP_MINT_MODE ?? "mock";
const POAP_MINTER_SECRET_KEY = process.env.POAP_MINTER_SECRET_KEY;
const VERIFIER_WEB_BASE_URL = process.env.VERIFIER_WEB_BASE_URL ?? "http://localhost:3010";
const DB_FALLBACK_TO_MEMORY = process.env.DB_FALLBACK_TO_MEMORY !== "0";

export const config = {
  port: PORT,
  solanaRpcUrl: SOLANA_RPC_URL,
  solanaNetwork: SOLANA_NETWORK,
  appBaseUrl: APP_BASE_URL,
  treasuryPubkey: TREASURY_PUBKEY,
  databaseUrl: DATABASE_URL,
  organizerApiKey: ORGANIZER_API_KEY,
  rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
  rateLimitMax: RATE_LIMIT_MAX,
  poapMintMode: POAP_MINT_MODE,
  poapMinterSecretKey: POAP_MINTER_SECRET_KEY,
  verifierWebBaseUrl: VERIFIER_WEB_BASE_URL,
  dbFallbackToMemory: DB_FALLBACK_TO_MEMORY
};
