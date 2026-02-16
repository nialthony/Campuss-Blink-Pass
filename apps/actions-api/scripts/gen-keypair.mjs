import { Keypair } from "@solana/web3.js";

const kp = Keypair.generate();
process.stdout.write(
  JSON.stringify({
    pubkey: kp.publicKey.toBase58(),
    secret: Array.from(kp.secretKey)
  })
);
