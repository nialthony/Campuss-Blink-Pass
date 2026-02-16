import { spawn } from "child_process";
import path from "path";

const root = process.cwd();
const baseUrl = "http://localhost:3001";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // no-op while waiting server boot
    }
    await sleep(500);
  }
  throw new Error("API did not become healthy in time");
}

async function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath], {
      cwd: root,
      stdio: "inherit",
      shell: true
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} failed with code ${code}`));
    });
  });
}

async function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  await new Promise((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      shell: true
    });
    killer.on("exit", () => resolve());
  });
}

async function main() {
  const api = spawn("cmd.exe", ["/c", "corepack pnpm exec tsx src/index.ts"], {
    cwd: path.join(root, "apps/actions-api"),
    stdio: "inherit",
    shell: false
  });

  try {
    await waitForHealth(baseUrl);
    await runScript("scripts/smoke-actions-api.mjs");
    await runScript("scripts/smoke-organizer-api.mjs");
    await runScript("scripts/smoke-organizer-web.mjs");
  } finally {
    await killProcessTree(api.pid);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
