import { spawn } from "child_process";
import path from "path";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForUrl(url, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // wait until server is ready
    }
    await sleep(300);
  }
  throw new Error(`URL not ready: ${url}`);
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
  const web = spawn("cmd.exe", ["/c", "corepack pnpm dev"], {
    cwd: path.join(process.cwd(), "apps/organizer-web"),
    stdio: "inherit",
    shell: false
  });

  try {
    await waitForUrl("http://localhost:3010");
    const indexRes = await fetch("http://localhost:3010");
    const indexHtml = await indexRes.text();
    if (!indexHtml.includes("Verifier Console")) {
      throw new Error("Verifier heading not found in index page");
    }
    if (!indexHtml.includes("Event Explorer")) {
      throw new Error("Event explorer section not found in index page");
    }

    const cssRes = await fetch("http://localhost:3010/styles.css");
    if (!cssRes.ok) {
      throw new Error(`styles.css not served (status ${cssRes.status})`);
    }

    console.log("organizer-web smoke OK");
  } finally {
    await killProcessTree(web.pid);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
