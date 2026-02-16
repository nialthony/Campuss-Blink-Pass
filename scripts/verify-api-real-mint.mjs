import { spawn } from "child_process";

function runVerifyWithEnv(env) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/verify-api.mjs"], {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      shell: true
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`verify-api.mjs exited with code ${code}`));
    });
  });
}

function generateTempMinter() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cmd.exe",
      [
        "/c",
        "corepack pnpm --filter @campus/actions-api exec node scripts/gen-keypair.mjs"
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "inherit"],
        shell: false
      }
    );

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to generate temp minter (code ${code})`));
        return;
      }

      try {
        const start = output.indexOf("{");
        const end = output.lastIndexOf("}");
        if (start === -1 || end === -1 || end <= start) {
          throw new Error("JSON payload not found");
        }
        const parsed = JSON.parse(output.slice(start, end + 1));
        resolve(parsed);
      } catch {
        reject(new Error("Failed to parse generated minter payload"));
      }
    });
  });
}

async function main() {
  const minter = await generateTempMinter();
  const env = {
    ...process.env,
    POAP_MINT_MODE: "real",
    POAP_MINTER_SECRET_KEY: JSON.stringify(minter.secret),
    TEST_ACCOUNT: minter.pubkey
  };

  console.log("Running real mint verify with temp minter:", minter.pubkey);
  await runVerifyWithEnv(env);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
