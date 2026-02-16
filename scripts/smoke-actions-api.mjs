const base = process.env.BASE_URL ?? "http://localhost:3001";
const eventId = process.env.EVENT_ID ?? "solana-campus-week";
const account = process.env.TEST_ACCOUNT ?? "11111111111111111111111111111111";
const secret = process.env.TEST_SECRET ?? "campus-2026";

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const bodyText = await res.text();
  return { status: res.status, bodyText };
}

async function get(path) {
  const res = await fetch(`${base}${path}`);
  const bodyText = await res.text();
  return { status: res.status, bodyText };
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function assertStatus(name, response, expected = 200) {
  if (response.status !== expected) {
    throw new Error(`${name} expected ${expected}, got ${response.status}: ${response.bodyText}`);
  }
}

async function main() {
  const register = await post(`/api/actions/events/${eventId}/register`, { account });
  const checkin = await post(`/api/actions/events/${eventId}/check-in`, { account, secret });
  const claim = await post(`/api/actions/events/${eventId}/claim-poap`, { account });
  const verifierEvents = await get("/api/verifier/events");

  assertStatus("register", register);
  assertStatus("check-in", checkin);
  assertStatus("claim", claim);
  assertStatus("verify-events", verifierEvents);

  const registerJson = tryParseJson(register.bodyText);
  const checkinJson = tryParseJson(checkin.bodyText);
  const claimJson = tryParseJson(claim.bodyText);

  console.log("register", register.status, register.bodyText);
  console.log("check-in", checkin.status, checkin.bodyText);
  console.log("claim", claim.status, claim.bodyText);

  const walletVerify = await get(`/api/verifier/events/${eventId}/wallets/${account}`);
  assertStatus("verify-wallet", walletVerify);
  console.log("verify-wallet", walletVerify.status, walletVerify.bodyText);
  console.log("verify-events", verifierEvents.status, verifierEvents.bodyText);

  const claimTxRef = claimJson?.txRef ?? checkinJson?.txRef ?? registerJson?.txRef;
  if (claimTxRef) {
    const txVerify = await get(`/api/verifier/refs/${claimTxRef}`);
    assertStatus("verify-txref", txVerify);
    console.log("verify-txref", txVerify.status, txVerify.bodyText);
  }

  console.log("claim-verify-url", claimJson?.verifyUrl ?? "n/a");
  console.log("claim-wallet-verify-url", claimJson?.verifyWalletUrl ?? "n/a");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
