import type { EventStore } from "@campus/db";
import type { EventEntity } from "@campus/shared-types";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo
} from "@solana/spl-token";
import { config } from "../config.js";
import { buildMockMintAddress } from "./solana.js";

type MintMode = "mock" | "real";

interface MintResult {
  mode: MintMode;
  mintAddress: string;
  txRef: string | null;
  poapCollection: string | null;
}

const connection = new Connection(config.solanaRpcUrl, "confirmed");
let cachedMinter: Keypair | null = null;

function parseMintMode(): MintMode {
  return config.poapMintMode.toLowerCase() === "real" ? "real" : "mock";
}

function getMinter(): Keypair {
  if (cachedMinter) {
    return cachedMinter;
  }

  const raw = config.poapMinterSecretKey;
  if (!raw) {
    throw new Error("POAP_MINTER_SECRET_KEY is required when POAP_MINT_MODE=real");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("POAP_MINTER_SECRET_KEY must be JSON array of uint8");
  }

  if (!Array.isArray(parsed) || parsed.length < 64) {
    throw new Error("POAP_MINTER_SECRET_KEY is invalid");
  }

  const secret = Uint8Array.from(parsed as number[]);
  cachedMinter = Keypair.fromSecretKey(secret);
  return cachedMinter;
}

async function ensureMinterBalance(minter: Keypair): Promise<void> {
  const minRequired = 0.03 * LAMPORTS_PER_SOL;
  const current = await connection.getBalance(minter.publicKey, "confirmed");
  if (current >= minRequired) {
    return;
  }

  if (config.solanaNetwork !== "devnet") {
    throw new Error("Minter wallet balance too low");
  }

  const signature = await connection.requestAirdrop(minter.publicKey, LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    },
    "confirmed"
  );
}

async function resolveCollectionMint(params: {
  event: EventEntity;
  store: EventStore;
  minter: Keypair;
}): Promise<PublicKey> {
  if (params.event.poapCollection) {
    return new PublicKey(params.event.poapCollection);
  }

  const created = await createMint(
    connection,
    params.minter,
    params.minter.publicKey,
    null,
    0
  );

  await params.store.updateEvent(params.event.id, {
    poapCollection: created.toBase58()
  });

  return created;
}

export async function issuePoapCredential(params: {
  event: EventEntity;
  wallet: string;
  store: EventStore;
}): Promise<MintResult> {
  const mode = parseMintMode();
  if (mode === "mock") {
    return {
      mode,
      mintAddress: buildMockMintAddress(params.event.id, params.wallet),
      txRef: null,
      poapCollection: params.event.poapCollection
    };
  }

  const minter = getMinter();
  await ensureMinterBalance(minter);

  const collectionMint = await resolveCollectionMint({
    event: params.event,
    store: params.store,
    minter
  });

  const recipientWallet = new PublicKey(params.wallet);
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    minter,
    collectionMint,
    recipientWallet
  );

  const mintTxSignature = await mintTo(
    connection,
    minter,
    collectionMint,
    recipientAta.address,
    minter,
    1
  );

  return {
    mode,
    mintAddress: recipientAta.address.toBase58(),
    txRef: mintTxSignature,
    poapCollection: collectionMint.toBase58()
  };
}
