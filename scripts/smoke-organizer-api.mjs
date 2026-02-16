const base = process.env.BASE_URL ?? "http://localhost:3001";
const apiKey = process.env.ORGANIZER_API_KEY ?? "dev-organizer-key";

async function request(path, init = {}) {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  const unauthorizedList = await request("/api/organizer/events");
  console.log("unauthorized-list", unauthorizedList.status, unauthorizedList.body);

  const authHeaders = {
    "content-type": "application/json",
    "x-api-key": apiKey
  };

  const list = await request("/api/organizer/events", { headers: { "x-api-key": apiKey } });
  console.log("list", list.status, list.body);

  const overview = await request("/api/organizer/overview", {
    headers: { "x-api-key": apiKey }
  });
  console.log("overview", overview.status, overview.body);

  const retention = await request(`/api/organizer/analytics/retention?from=${today}&to=${today}`, {
    headers: { "x-api-key": apiKey }
  });
  console.log("retention", retention.status, retention.body);

  const created = await request("/api/organizer/events", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Campus Builders Meetup",
      description: "Weekly builder meetup",
      startAt: new Date(Date.now() + 60_000).toISOString(),
      endAt: new Date(Date.now() + 120_000).toISOString(),
      checkInSecret: "builder-2026",
      ticketPriceLamports: 0,
      poapCollection: null,
      status: "draft"
    })
  });
  console.log("create", created.status, created.body);

  const createdJson = JSON.parse(created.body);
  const eventId = createdJson?.event?.id;
  if (!eventId) {
    return;
  }

  const patched = await request(`/api/organizer/events/${eventId}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ status: "published" })
  });
  console.log("patch", patched.status, patched.body);

  const stats = await request(`/api/organizer/events/${eventId}/stats`, {
    headers: { "x-api-key": apiKey }
  });
  console.log("stats", stats.status, stats.body);

  const timeseries = await request(
    `/api/organizer/events/solana-campus-week/analytics/timeseries?from=${today}&to=${today}`,
    {
      headers: { "x-api-key": apiKey }
    }
  );
  console.log("timeseries", timeseries.status, timeseries.body);

  const participants = await request(
    "/api/organizer/events/solana-campus-week/participants?stage=claimed&limit=10&offset=0",
    {
      headers: { "x-api-key": apiKey }
    }
  );
  console.log("participants", participants.status, participants.body);

  const exported = await request(
    "/api/organizer/events/solana-campus-week/export.csv?stage=claimed&limit=10&offset=0",
    {
      headers: { "x-api-key": apiKey }
    }
  );
  console.log("export", exported.status, exported.body.split("\n")[0]);

  const exportedCreated = await request(`/api/organizer/events/${eventId}/export.csv`, {
    headers: { "x-api-key": apiKey }
  });
  console.log("export-created", exportedCreated.status, exportedCreated.body.split("\n")[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
