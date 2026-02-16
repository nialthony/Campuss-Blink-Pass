const apiBaseInput = document.getElementById("apiBase");
const eventIdInput = document.getElementById("eventId");
const walletInput = document.getElementById("wallet");
const txRefInput = document.getElementById("txRef");
const resultType = document.getElementById("resultType");
const resultBody = document.getElementById("resultBody");
const walletForm = document.getElementById("walletForm");
const txRefForm = document.getElementById("txRefForm");
const eventsList = document.getElementById("eventsList");
const refreshEvents = document.getElementById("refreshEvents");

function setTag(label, className = "") {
  resultType.textContent = label;
  resultType.className = `tag ${className}`.trim();
}

function setResultHtml(html) {
  resultBody.innerHTML = html;
}

function isoText(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleString()} (${value})`;
}

function kvRows(rows) {
  return `
    <dl class="kvs">
      ${rows
        .map(
          (row) => `
            <div>
              <dt>${row.key}</dt>
              <dd>${row.value}</dd>
            </div>
          `
        )
        .join("")}
    </dl>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error ?? `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

function eventMetaText(event) {
  const start = isoText(event.startAt);
  return `${event.status} | starts ${start}`;
}

function renderEvents(events) {
  if (!events.length) {
    eventsList.textContent = "No published events found.";
    return;
  }

  eventsList.innerHTML = events
    .map(
      (event) => `
        <article class="event-row">
          <div class="event-row-head">
            <div class="event-title">${escapeHtml(event.name)}</div>
            <span class="tag status-${escapeHtml(event.status)}">${escapeHtml(event.status)}</span>
          </div>
          <div class="event-meta">${escapeHtml(eventMetaText(event))}</div>
          <div class="event-meta">${escapeHtml(event.id)}</div>
          <div class="event-actions">
            <button type="button" class="ghost-btn use-event-btn" data-event-id="${escapeHtml(event.id)}">
              Use Event
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadEvents() {
  const apiBase = apiBaseInput.value.trim().replace(/\/$/, "");
  if (!apiBase) {
    eventsList.textContent = "Isi API Base dulu.";
    return;
  }

  eventsList.textContent = "Loading events...";
  try {
    const data = await getJson(`${apiBase}/api/verifier/events`);
    renderEvents(data.events ?? []);
  } catch (error) {
    eventsList.textContent = error instanceof Error ? error.message : "Failed to load events";
  }
}

async function submitWalletVerification(event) {
  event.preventDefault();
  const apiBase = apiBaseInput.value.trim().replace(/\/$/, "");
  const eventId = eventIdInput.value.trim();
  const wallet = walletInput.value.trim();

  if (!apiBase || !eventId || !wallet) {
    setTag("Input Error", "status-error");
    setResultHtml("API Base, Event ID, dan Wallet wajib diisi.");
    return;
  }

  setTag("Wallet Lookup");
  setResultHtml("Memproses request...");

  try {
    const data = await getJson(
      `${apiBase}/api/verifier/events/${encodeURIComponent(eventId)}/wallets/${encodeURIComponent(wallet)}`
    );
    const verification = data.verification;

    setTag(verification.status, `status-${verification.status}`);
    setResultHtml(
      kvRows([
        { key: "Event", value: escapeHtml(data.event?.name ?? verification.eventId) },
        { key: "Event ID", value: escapeHtml(verification.eventId) },
        { key: "Wallet", value: escapeHtml(verification.wallet) },
        { key: "Status", value: escapeHtml(verification.status) },
        { key: "Registered At", value: escapeHtml(isoText(verification.registered?.at)) },
        { key: "Register TxRef", value: escapeHtml(verification.registered?.txRef ?? "-") },
        { key: "Checked-In At", value: escapeHtml(isoText(verification.checkedIn?.at)) },
        { key: "Check-in TxRef", value: escapeHtml(verification.checkedIn?.txRef ?? "-") },
        { key: "Claimed At", value: escapeHtml(isoText(verification.claimed?.at)) },
        { key: "Claim TxRef", value: escapeHtml(verification.claimed?.txRef ?? "-") },
        { key: "Mint Address", value: escapeHtml(verification.claimed?.mintAddress ?? "-") }
      ])
    );
  } catch (error) {
    setTag("Error", "status-error");
    setResultHtml(escapeHtml(error instanceof Error ? error.message : "Unknown error"));
  }
}

async function submitTxRefVerification(event) {
  event.preventDefault();
  const apiBase = apiBaseInput.value.trim().replace(/\/$/, "");
  const txRef = txRefInput.value.trim();

  if (!apiBase || !txRef) {
    setTag("Input Error", "status-error");
    setResultHtml("API Base dan Tx Ref wajib diisi.");
    return;
  }

  setTag("Proof Lookup");
  setResultHtml("Memproses request...");

  try {
    const data = await getJson(`${apiBase}/api/verifier/refs/${encodeURIComponent(txRef)}`);
    const verification = data.verification;

    setTag("proof-ok", "status-ok");
    setResultHtml(
      kvRows([
        { key: "Event", value: escapeHtml(data.event?.name ?? verification.eventId) },
        { key: "Event ID", value: escapeHtml(verification.eventId) },
        { key: "Wallet", value: escapeHtml(verification.wallet) },
        { key: "Stage", value: escapeHtml(verification.stage) },
        { key: "Occurred At", value: escapeHtml(isoText(verification.occurredAt)) },
        { key: "TxRef", value: escapeHtml(verification.txRef) },
        { key: "Mint Address", value: escapeHtml(verification.mintAddress ?? "-") }
      ])
    );
  } catch (error) {
    setTag("Error", "status-error");
    setResultHtml(escapeHtml(error instanceof Error ? error.message : "Unknown error"));
  }
}

walletForm.addEventListener("submit", (event) => {
  submitWalletVerification(event);
});

txRefForm.addEventListener("submit", (event) => {
  submitTxRefVerification(event);
});

eventsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest(".use-event-btn");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const eventId = button.dataset.eventId;
  if (!eventId) {
    return;
  }

  eventIdInput.value = eventId;
  if (walletInput.value.trim()) {
    walletForm.requestSubmit();
    return;
  }
  walletInput.focus();
});

refreshEvents.addEventListener("click", () => {
  loadEvents();
});

apiBaseInput.addEventListener("change", () => {
  loadEvents();
});

function bootFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const paramApiBase = params.get("apiBase");
  const paramEventId = params.get("eventId");
  const paramWallet = params.get("wallet");
  const paramTxRef = params.get("txRef");

  if (paramApiBase) {
    apiBaseInput.value = paramApiBase;
  }
  if (paramEventId) {
    eventIdInput.value = paramEventId;
  }
  if (paramWallet) {
    walletInput.value = paramWallet;
  }
  if (paramTxRef) {
    txRefInput.value = paramTxRef;
  }

  if (paramTxRef) {
    txRefForm.requestSubmit();
    return;
  }
  if (paramEventId && paramWallet) {
    walletForm.requestSubmit();
  }
}

async function boot() {
  await loadEvents();
  bootFromQuery();
}

boot();
