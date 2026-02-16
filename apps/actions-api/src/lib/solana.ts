import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import { config } from "../config.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const connection = new Connection(config.solanaRpcUrl, "confirmed");

export function assertValidPubkey(pubkey: string): PublicKey {
  return new PublicKey(pubkey);
}

export function isOnCurvePubkey(pubkey: string): boolean {
  const key = new PublicKey(pubkey);
  return PublicKey.isOnCurve(key.toBytes());
}

export async function buildActionTx(params: {
  account: string;
  memo: string;
  lamports?: number;
}): Promise<string> {
  const payer = new PublicKey(params.account);
  const treasury = new PublicKey(config.treasuryPubkey);

  const tx = new Transaction();
  tx.feePayer = payer;

  if ((params.lamports ?? 0) > 0) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey: treasury,
        lamports: params.lamports ?? 0
      })
    );
  }

  tx.add(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(params.memo, "utf-8")
    })
  );

  const { blockhash } = await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = blockhash;

  return tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  }).toString("base64");
}

export function buildTxRef(serializedTxBase64: string): string {
  const entropy = randomBytes(16).toString("hex");
  const digest = createHash("sha256").update(serializedTxBase64).update(entropy).digest("hex");
  return `txr_${digest.slice(0, 40)}`;
}

export function buildMockMintAddress(eventId: string, wallet: string): string {
  const seed = createHash("sha256")
    .update(`mint:${eventId}:${wallet}:${Date.now()}:${randomBytes(8).toString("hex")}`)
    .digest()
    .subarray(0, 32);
  return new PublicKey(seed).toBase58();
}
