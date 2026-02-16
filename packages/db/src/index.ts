import type {
  ActionRecord,
  ClaimRecord,
  CreateEventInput,
  EventEntity,
  EventParticipantRow,
  EventStats,
  EventTimeseriesPoint,
  RetentionCohortPoint,
  RetentionQuery,
  OrganizerOverview,
  ParticipantsPage,
  ParticipantsQuery,
  TimeseriesQuery,
  TxVerification,
  UpdateEventInput,
  WalletVerification
} from "@campus/shared-types";
import { Pool } from "pg";

export interface EventStore {
  init(): Promise<void>;
  listEvents(): Promise<EventEntity[]>;
  getEventById(eventId: string): Promise<EventEntity | null>;
  createEvent(input: CreateEventInput): Promise<EventEntity>;
  updateEvent(eventId: string, patch: UpdateEventInput): Promise<EventEntity | null>;
  getOverview(): Promise<OrganizerOverview>;
  getEventStats(eventId: string): Promise<EventStats>;
  getEventTimeseries(eventId: string, query: TimeseriesQuery): Promise<EventTimeseriesPoint[]>;
  getRetentionCohorts(query: RetentionQuery): Promise<RetentionCohortPoint[]>;
  listParticipants(eventId: string): Promise<EventParticipantRow[]>;
  listParticipantsPage(eventId: string, query: ParticipantsQuery): Promise<ParticipantsPage>;
  getWalletVerification(eventId: string, wallet: string): Promise<WalletVerification>;
  getTxVerification(txRef: string): Promise<TxVerification | null>;
  hasRegistration(eventId: string, wallet: string): Promise<boolean>;
  addRegistration(eventId: string, wallet: string, txRef: string): Promise<void>;
  hasCheckin(eventId: string, wallet: string): Promise<boolean>;
  addCheckin(eventId: string, wallet: string, txRef: string): Promise<void>;
  hasClaim(eventId: string, wallet: string): Promise<boolean>;
  addClaim(eventId: string, wallet: string, txRef: string, mintAddress: string | null): Promise<void>;
}

interface DbEventRow {
  id: string;
  name: string;
  description: string;
  start_at: string;
  end_at: string;
  check_in_secret: string;
  ticket_price_lamports: number;
  poap_collection: string | null;
  status: "draft" | "published" | "ended";
}

interface DbCountRow {
  count: string;
}

interface DbParticipantRow {
  wallet: string;
  registered_at: string | null;
  checked_in_at: string | null;
  claimed_at: string | null;
  registration_tx_ref: string | null;
  checkin_tx_ref: string | null;
  claim_tx_ref: string | null;
  claim_mint_address: string | null;
}

interface DbTimeseriesRow {
  date: string;
  registrations: number;
  checkins: number;
  claims: number;
}

interface DbRetentionRow {
  cohort_date: string;
  cohort_size: string;
  retained_d7: string;
}

interface DbTxVerificationRow {
  event_id: string;
  wallet: string;
  stage: "register" | "check-in" | "claim";
  occurred_at: string;
  mint_address: string | null;
}

interface ActionEntry {
  at: string;
  txRef: string | null;
}

interface ClaimEntry extends ActionEntry {
  mintAddress: string | null;
}

function createSeedEvent(): EventEntity {
  const now = Date.now();
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
  return {
    id: "solana-campus-week",
    name: "Solana Campus Week",
    description: "Community meetup for builders and students.",
    startAt: new Date(now - oneMonthMs).toISOString(),
    endAt: new Date(now + oneMonthMs).toISOString(),
    checkInSecret: "campus-2026",
    ticketPriceLamports: 0,
    poapCollection: null,
    status: "published"
  };
}

function normalizeWallet(wallet: string): string {
  return wallet.toLowerCase();
}

function normalizeEventInput(input: CreateEventInput): EventEntity {
  return {
    id: input.id ?? `event-${Date.now()}`,
    name: input.name,
    description: input.description,
    startAt: new Date(input.startAt).toISOString(),
    endAt: new Date(input.endAt).toISOString(),
    checkInSecret: input.checkInSecret,
    ticketPriceLamports: input.ticketPriceLamports,
    poapCollection: input.poapCollection,
    status: input.status
  };
}

function toEventEntity(row: DbEventRow): EventEntity {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    checkInSecret: row.check_in_secret,
    ticketPriceLamports: Number(row.ticket_price_lamports),
    poapCollection: row.poap_collection,
    status: row.status
  };
}

function matchesStage(row: EventParticipantRow, stage: ParticipantsQuery["stage"]): boolean {
  if (stage === "all") {
    return true;
  }
  if (stage === "registered") {
    return row.registeredAt !== null;
  }
  if (stage === "checked-in") {
    return row.checkedInAt !== null;
  }
  return row.claimedAt !== null;
}

function matchesSearch(row: EventParticipantRow, search: string | null): boolean {
  if (!search) {
    return true;
  }
  return row.wallet.toLowerCase().includes(search.toLowerCase());
}

function toDayUtc(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function enumerateDayRange(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function toActionRecord(value: ActionEntry | undefined): ActionRecord | null {
  if (!value) {
    return null;
  }
  return {
    at: value.at,
    txRef: value.txRef
  };
}

function toClaimRecord(value: ClaimEntry | undefined): ClaimRecord | null {
  if (!value) {
    return null;
  }
  return {
    at: value.at,
    txRef: value.txRef,
    mintAddress: value.mintAddress
  };
}

function buildWalletVerification(params: {
  eventId: string;
  wallet: string;
  registered: ActionEntry | undefined;
  checkedIn: ActionEntry | undefined;
  claimed: ClaimEntry | undefined;
}): WalletVerification {
  let status: WalletVerification["status"] = "not-registered";
  if (params.registered) {
    status = "registered";
  }
  if (params.checkedIn) {
    status = "checked-in";
  }
  if (params.claimed) {
    status = "claimed";
  }

  return {
    eventId: params.eventId,
    wallet: params.wallet,
    status,
    registered: toActionRecord(params.registered),
    checkedIn: toActionRecord(params.checkedIn),
    claimed: toClaimRecord(params.claimed)
  };
}

class MemoryStore implements EventStore {
  private events = new Map<string, EventEntity>();
  private registrations = new Map<string, ActionEntry>();
  private checkins = new Map<string, ActionEntry>();
  private claims = new Map<string, ClaimEntry>();

  constructor() {
    const seed = createSeedEvent();
    this.events.set(seed.id, seed);
  }

  async init(): Promise<void> {
    return;
  }

  async listEvents(): Promise<EventEntity[]> {
    return [...this.events.values()];
  }

  async getEventById(eventId: string): Promise<EventEntity | null> {
    return this.events.get(eventId) ?? null;
  }

  async createEvent(input: CreateEventInput): Promise<EventEntity> {
    const normalized = normalizeEventInput(input);
    this.events.set(normalized.id, normalized);
    return normalized;
  }

  async updateEvent(eventId: string, patch: UpdateEventInput): Promise<EventEntity | null> {
    const current = this.events.get(eventId);
    if (!current) {
      return null;
    }

    const merged: EventEntity = {
      ...current,
      ...patch,
      startAt: patch.startAt ? new Date(patch.startAt).toISOString() : current.startAt,
      endAt: patch.endAt ? new Date(patch.endAt).toISOString() : current.endAt
    };

    this.events.set(eventId, merged);
    return merged;
  }

  async getOverview(): Promise<OrganizerOverview> {
    const events = [...this.events.values()];
    const eventsByStatus = {
      draft: events.filter((event) => event.status === "draft").length,
      published: events.filter((event) => event.status === "published").length,
      ended: events.filter((event) => event.status === "ended").length
    };

    const registrationsTotal = this.registrations.size;
    const checkinsTotal = this.checkins.size;
    const claimsTotal = this.claims.size;
    const overallCheckinRate =
      registrationsTotal > 0 ? Number((checkinsTotal / registrationsTotal).toFixed(4)) : 0;
    const overallClaimRate = checkinsTotal > 0 ? Number((claimsTotal / checkinsTotal).toFixed(4)) : 0;

    return {
      eventsTotal: events.length,
      eventsByStatus,
      registrationsTotal,
      checkinsTotal,
      claimsTotal,
      overallCheckinRate,
      overallClaimRate
    };
  }

  async getEventStats(eventId: string): Promise<EventStats> {
    const registrations = [...this.registrations.keys()].filter((key) => key.startsWith(`${eventId}:`)).length;
    const checkins = [...this.checkins.keys()].filter((key) => key.startsWith(`${eventId}:`)).length;
    const claims = [...this.claims.keys()].filter((key) => key.startsWith(`${eventId}:`)).length;
    const checkinRate = registrations > 0 ? Number((checkins / registrations).toFixed(4)) : 0;
    const claimRate = checkins > 0 ? Number((claims / checkins).toFixed(4)) : 0;

    return {
      eventId,
      registrations,
      checkins,
      claims,
      checkinRate,
      claimRate
    };
  }

  async getEventTimeseries(eventId: string, query: TimeseriesQuery): Promise<EventTimeseriesPoint[]> {
    const timeline = new Map<string, EventTimeseriesPoint>();
    for (const day of enumerateDayRange(query.from, query.to)) {
      timeline.set(day, {
        date: day,
        registrations: 0,
        checkins: 0,
        claims: 0
      });
    }

    const bump = (
      source: Map<string, ActionEntry | ClaimEntry>,
      field: "registrations" | "checkins" | "claims"
    ): void => {
      for (const [key, entry] of source.entries()) {
        if (!key.startsWith(`${eventId}:`)) {
          continue;
        }
        const day = toDayUtc(entry.at);
        if (day < query.from || day > query.to) {
          continue;
        }
        const point = timeline.get(day);
        if (!point) {
          continue;
        }
        point[field] += 1;
      }
    };

    bump(this.registrations, "registrations");
    bump(this.checkins, "checkins");
    bump(this.claims, "claims");

    return [...timeline.values()];
  }

  async getRetentionCohorts(query: RetentionQuery): Promise<RetentionCohortPoint[]> {
    const firstByWallet = new Map<string, string[]>();

    for (const [key, entry] of this.registrations.entries()) {
      const wallet = key.split(":")[1] ?? "";
      if (!wallet) {
        continue;
      }
      const entries = firstByWallet.get(wallet) ?? [];
      entries.push(entry.at);
      firstByWallet.set(wallet, entries);
    }

    const cohorts = new Map<string, { cohortSize: number; retainedD7: number }>();
    for (const day of enumerateDayRange(query.from, query.to)) {
      cohorts.set(day, { cohortSize: 0, retainedD7: 0 });
    }

    for (const timestamps of firstByWallet.values()) {
      const sorted = [...timestamps].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      const firstTs = sorted[0];
      if (!firstTs) {
        continue;
      }

      const cohortDate = toDayUtc(firstTs);
      if (cohortDate < query.from || cohortDate > query.to) {
        continue;
      }

      const firstMs = new Date(firstTs).getTime();
      const retentionWindowMs = firstMs + 7 * 24 * 60 * 60 * 1000;
      const retainedD7 = sorted.some((timestamp) => {
        const ts = new Date(timestamp).getTime();
        return ts > firstMs && ts <= retentionWindowMs;
      });

      const cohort = cohorts.get(cohortDate);
      if (!cohort) {
        continue;
      }
      cohort.cohortSize += 1;
      if (retainedD7) {
        cohort.retainedD7 += 1;
      }
    }

    return [...cohorts.entries()].map(([cohortDate, value]) => ({
      cohortDate,
      cohortSize: value.cohortSize,
      retainedD7: value.retainedD7,
      retentionRateD7:
        value.cohortSize > 0 ? Number((value.retainedD7 / value.cohortSize).toFixed(4)) : 0
    }));
  }

  async listParticipants(eventId: string): Promise<EventParticipantRow[]> {
    const wallets = new Set<string>();
    for (const key of this.registrations.keys()) {
      if (key.startsWith(`${eventId}:`)) {
        wallets.add(key.split(":")[1] ?? "");
      }
    }
    for (const key of this.checkins.keys()) {
      if (key.startsWith(`${eventId}:`)) {
        wallets.add(key.split(":")[1] ?? "");
      }
    }
    for (const key of this.claims.keys()) {
      if (key.startsWith(`${eventId}:`)) {
        wallets.add(key.split(":")[1] ?? "");
      }
    }

    return [...wallets]
      .filter((wallet) => wallet.length > 0)
      .map((wallet) => {
        const composite = `${eventId}:${wallet}`;
        return {
          wallet,
          registeredAt: this.registrations.get(composite)?.at ?? null,
          checkedInAt: this.checkins.get(composite)?.at ?? null,
          claimedAt: this.claims.get(composite)?.at ?? null
        };
      })
      .sort((a, b) => a.wallet.localeCompare(b.wallet));
  }

  async listParticipantsPage(eventId: string, query: ParticipantsQuery): Promise<ParticipantsPage> {
    const allRows = await this.listParticipants(eventId);
    const filtered = allRows.filter(
      (row) => matchesStage(row, query.stage) && matchesSearch(row, query.search)
    );
    return {
      rows: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      limit: query.limit,
      offset: query.offset
    };
  }

  async getWalletVerification(eventId: string, wallet: string): Promise<WalletVerification> {
    const normalizedWallet = normalizeWallet(wallet);
    const key = `${eventId}:${normalizedWallet}`;
    return buildWalletVerification({
      eventId,
      wallet: normalizedWallet,
      registered: this.registrations.get(key),
      checkedIn: this.checkins.get(key),
      claimed: this.claims.get(key)
    });
  }

  async getTxVerification(txRef: string): Promise<TxVerification | null> {
    for (const [composite, entry] of this.registrations.entries()) {
      if (entry.txRef !== txRef) {
        continue;
      }
      const [eventId, wallet] = composite.split(":");
      return {
        txRef,
        eventId: eventId ?? "",
        wallet: wallet ?? "",
        stage: "register",
        occurredAt: entry.at,
        mintAddress: null
      };
    }

    for (const [composite, entry] of this.checkins.entries()) {
      if (entry.txRef !== txRef) {
        continue;
      }
      const [eventId, wallet] = composite.split(":");
      return {
        txRef,
        eventId: eventId ?? "",
        wallet: wallet ?? "",
        stage: "check-in",
        occurredAt: entry.at,
        mintAddress: null
      };
    }

    for (const [composite, entry] of this.claims.entries()) {
      if (entry.txRef !== txRef) {
        continue;
      }
      const [eventId, wallet] = composite.split(":");
      return {
        txRef,
        eventId: eventId ?? "",
        wallet: wallet ?? "",
        stage: "claim",
        occurredAt: entry.at,
        mintAddress: entry.mintAddress
      };
    }

    return null;
  }

  async hasRegistration(eventId: string, wallet: string): Promise<boolean> {
    return this.registrations.has(`${eventId}:${normalizeWallet(wallet)}`);
  }

  async addRegistration(eventId: string, wallet: string, txRef: string): Promise<void> {
    this.registrations.set(`${eventId}:${normalizeWallet(wallet)}`, {
      at: new Date().toISOString(),
      txRef
    });
  }

  async hasCheckin(eventId: string, wallet: string): Promise<boolean> {
    return this.checkins.has(`${eventId}:${normalizeWallet(wallet)}`);
  }

  async addCheckin(eventId: string, wallet: string, txRef: string): Promise<void> {
    this.checkins.set(`${eventId}:${normalizeWallet(wallet)}`, {
      at: new Date().toISOString(),
      txRef
    });
  }

  async hasClaim(eventId: string, wallet: string): Promise<boolean> {
    return this.claims.has(`${eventId}:${normalizeWallet(wallet)}`);
  }

  async addClaim(
    eventId: string,
    wallet: string,
    txRef: string,
    mintAddress: string | null
  ): Promise<void> {
    this.claims.set(`${eventId}:${normalizeWallet(wallet)}`, {
      at: new Date().toISOString(),
      txRef,
      mintAddress
    });
  }
}

class PostgresStore implements EventStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl
    });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        check_in_secret TEXT NOT NULL,
        ticket_price_lamports BIGINT NOT NULL DEFAULT 0,
        poap_collection TEXT NULL,
        status TEXT NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        wallet TEXT NOT NULL,
        tx_ref TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(event_id, wallet)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS checkins (
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        wallet TEXT NOT NULL,
        tx_ref TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(event_id, wallet)
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS claims (
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        wallet TEXT NOT NULL,
        tx_ref TEXT NULL,
        mint_address TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(event_id, wallet)
      );
    `);

    await this.pool.query(`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS tx_ref TEXT NULL;`);
    await this.pool.query(`ALTER TABLE checkins ADD COLUMN IF NOT EXISTS tx_ref TEXT NULL;`);
    await this.pool.query(`ALTER TABLE claims ADD COLUMN IF NOT EXISTS tx_ref TEXT NULL;`);
    await this.pool.query(`ALTER TABLE claims ADD COLUMN IF NOT EXISTS mint_address TEXT NULL;`);

    await this.pool.query(`CREATE INDEX IF NOT EXISTS registrations_event_created_idx ON registrations(event_id, created_at);`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS checkins_event_created_idx ON checkins(event_id, created_at);`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS claims_event_created_idx ON claims(event_id, created_at);`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS registrations_wallet_created_idx ON registrations(wallet, created_at);`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS registrations_tx_ref_idx ON registrations(tx_ref);`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS checkins_tx_ref_idx ON checkins(tx_ref);`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS claims_tx_ref_idx ON claims(tx_ref);`);

    const seed = createSeedEvent();
    await this.pool.query(
      `
        INSERT INTO events (
          id, name, description, start_at, end_at, check_in_secret,
          ticket_price_lamports, poap_collection, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING;
      `,
      [
        seed.id,
        seed.name,
        seed.description,
        seed.startAt,
        seed.endAt,
        seed.checkInSecret,
        seed.ticketPriceLamports,
        seed.poapCollection,
        seed.status
      ]
    );
  }

  async listEvents(): Promise<EventEntity[]> {
    const result = await this.pool.query<DbEventRow>(
      `
        SELECT
          id, name, description, start_at, end_at, check_in_secret,
          ticket_price_lamports, poap_collection, status
        FROM events
        ORDER BY start_at DESC;
      `
    );
    return result.rows.map(toEventEntity);
  }

  async getEventById(eventId: string): Promise<EventEntity | null> {
    const result = await this.pool.query<DbEventRow>(
      `
        SELECT
          id, name, description, start_at, end_at, check_in_secret,
          ticket_price_lamports, poap_collection, status
        FROM events
        WHERE id = $1
        LIMIT 1;
      `,
      [eventId]
    );

    const row = result.rows[0];
    return row ? toEventEntity(row) : null;
  }

  async createEvent(input: CreateEventInput): Promise<EventEntity> {
    const normalized = normalizeEventInput(input);
    const result = await this.pool.query<DbEventRow>(
      `
        INSERT INTO events (
          id, name, description, start_at, end_at, check_in_secret,
          ticket_price_lamports, poap_collection, status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id, name, description, start_at, end_at, check_in_secret, ticket_price_lamports, poap_collection, status;
      `,
      [
        normalized.id,
        normalized.name,
        normalized.description,
        normalized.startAt,
        normalized.endAt,
        normalized.checkInSecret,
        normalized.ticketPriceLamports,
        normalized.poapCollection,
        normalized.status
      ]
    );
    return toEventEntity(result.rows[0]);
  }

  async updateEvent(eventId: string, patch: UpdateEventInput): Promise<EventEntity | null> {
    const current = await this.getEventById(eventId);
    if (!current) {
      return null;
    }

    const merged: EventEntity = {
      ...current,
      ...patch,
      startAt: patch.startAt ? new Date(patch.startAt).toISOString() : current.startAt,
      endAt: patch.endAt ? new Date(patch.endAt).toISOString() : current.endAt
    };

    const result = await this.pool.query<DbEventRow>(
      `
        UPDATE events
        SET
          name = $2,
          description = $3,
          start_at = $4,
          end_at = $5,
          check_in_secret = $6,
          ticket_price_lamports = $7,
          poap_collection = $8,
          status = $9
        WHERE id = $1
        RETURNING id, name, description, start_at, end_at, check_in_secret, ticket_price_lamports, poap_collection, status;
      `,
      [
        eventId,
        merged.name,
        merged.description,
        merged.startAt,
        merged.endAt,
        merged.checkInSecret,
        merged.ticketPriceLamports,
        merged.poapCollection,
        merged.status
      ]
    );

    const row = result.rows[0];
    return row ? toEventEntity(row) : null;
  }

  async getOverview(): Promise<OrganizerOverview> {
    const [eventsTotalRes, eventsByStatusRes, registrationCount, checkinCount, claimCount] = await Promise.all([
      this.pool.query<DbCountRow>(`SELECT COUNT(*)::text as count FROM events;`),
      this.pool.query<{ draft: string; published: string; ended: string }>(
        `
          SELECT
            SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END)::text AS draft,
            SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END)::text AS published,
            SUM(CASE WHEN status = 'ended' THEN 1 ELSE 0 END)::text AS ended
          FROM events;
        `
      ),
      this.pool.query<DbCountRow>(`SELECT COUNT(*)::text as count FROM registrations;`),
      this.pool.query<DbCountRow>(`SELECT COUNT(*)::text as count FROM checkins;`),
      this.pool.query<DbCountRow>(`SELECT COUNT(*)::text as count FROM claims;`)
    ]);

    const eventsTotal = Number(eventsTotalRes.rows[0]?.count ?? "0");
    const eventsByStatus = {
      draft: Number(eventsByStatusRes.rows[0]?.draft ?? "0"),
      published: Number(eventsByStatusRes.rows[0]?.published ?? "0"),
      ended: Number(eventsByStatusRes.rows[0]?.ended ?? "0")
    };
    const registrationsTotal = Number(registrationCount.rows[0]?.count ?? "0");
    const checkinsTotal = Number(checkinCount.rows[0]?.count ?? "0");
    const claimsTotal = Number(claimCount.rows[0]?.count ?? "0");
    const overallCheckinRate =
      registrationsTotal > 0 ? Number((checkinsTotal / registrationsTotal).toFixed(4)) : 0;
    const overallClaimRate = checkinsTotal > 0 ? Number((claimsTotal / checkinsTotal).toFixed(4)) : 0;

    return {
      eventsTotal,
      eventsByStatus,
      registrationsTotal,
      checkinsTotal,
      claimsTotal,
      overallCheckinRate,
      overallClaimRate
    };
  }

  async getEventStats(eventId: string): Promise<EventStats> {
    const [registrationCount, checkinCount, claimCount] = await Promise.all([
      this.pool.query<DbCountRow>(`SELECT COUNT(*)::text as count FROM registrations WHERE event_id = $1;`, [eventId]),
      this.pool.query<DbCountRow>(`SELECT COUNT(*)::text as count FROM checkins WHERE event_id = $1;`, [eventId]),
      this.pool.query<DbCountRow>(`SELECT COUNT(*)::text as count FROM claims WHERE event_id = $1;`, [eventId])
    ]);

    const registrations = Number(registrationCount.rows[0]?.count ?? "0");
    const checkins = Number(checkinCount.rows[0]?.count ?? "0");
    const claims = Number(claimCount.rows[0]?.count ?? "0");
    const checkinRate = registrations > 0 ? Number((checkins / registrations).toFixed(4)) : 0;
    const claimRate = checkins > 0 ? Number((claims / checkins).toFixed(4)) : 0;

    return {
      eventId,
      registrations,
      checkins,
      claims,
      checkinRate,
      claimRate
    };
  }

  async getEventTimeseries(eventId: string, query: TimeseriesQuery): Promise<EventTimeseriesPoint[]> {
    const result = await this.pool.query<DbTimeseriesRow>(
      `
        WITH days AS (
          SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS day
        ),
        reg AS (
          SELECT created_at::date AS day, COUNT(*)::int AS count
          FROM registrations
          WHERE event_id = $1 AND created_at::date BETWEEN $2::date AND $3::date
          GROUP BY created_at::date
        ),
        chk AS (
          SELECT created_at::date AS day, COUNT(*)::int AS count
          FROM checkins
          WHERE event_id = $1 AND created_at::date BETWEEN $2::date AND $3::date
          GROUP BY created_at::date
        ),
        clm AS (
          SELECT created_at::date AS day, COUNT(*)::int AS count
          FROM claims
          WHERE event_id = $1 AND created_at::date BETWEEN $2::date AND $3::date
          GROUP BY created_at::date
        )
        SELECT
          TO_CHAR(days.day, 'YYYY-MM-DD') AS date,
          COALESCE(reg.count, 0)::int AS registrations,
          COALESCE(chk.count, 0)::int AS checkins,
          COALESCE(clm.count, 0)::int AS claims
        FROM days
        LEFT JOIN reg ON reg.day = days.day
        LEFT JOIN chk ON chk.day = days.day
        LEFT JOIN clm ON clm.day = days.day
        ORDER BY days.day ASC;
      `,
      [eventId, query.from, query.to]
    );

    return result.rows.map((row) => ({
      date: row.date,
      registrations: Number(row.registrations),
      checkins: Number(row.checkins),
      claims: Number(row.claims)
    }));
  }

  async getRetentionCohorts(query: RetentionQuery): Promise<RetentionCohortPoint[]> {
    const result = await this.pool.query<DbRetentionRow>(
      `
        WITH first_touch AS (
          SELECT
            wallet,
            MIN(created_at) AS first_ts,
            MIN(created_at::date) AS cohort_date
          FROM registrations
          GROUP BY wallet
        ),
        eligible AS (
          SELECT wallet, first_ts, cohort_date
          FROM first_touch
          WHERE cohort_date BETWEEN $1::date AND $2::date
        ),
        retained AS (
          SELECT
            e.wallet,
            e.cohort_date,
            EXISTS (
              SELECT 1
              FROM registrations r
              WHERE r.wallet = e.wallet
                AND r.created_at > e.first_ts
                AND r.created_at <= e.first_ts + INTERVAL '7 day'
            ) AS retained_d7
          FROM eligible e
        ),
        agg AS (
          SELECT
            cohort_date,
            COUNT(*)::bigint AS cohort_size,
            SUM(CASE WHEN retained_d7 THEN 1 ELSE 0 END)::bigint AS retained_d7
          FROM retained
          GROUP BY cohort_date
        ),
        days AS (
          SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS cohort_date
        )
        SELECT
          TO_CHAR(days.cohort_date, 'YYYY-MM-DD') AS cohort_date,
          COALESCE(agg.cohort_size, 0)::text AS cohort_size,
          COALESCE(agg.retained_d7, 0)::text AS retained_d7
        FROM days
        LEFT JOIN agg ON agg.cohort_date = days.cohort_date
        ORDER BY days.cohort_date ASC;
      `,
      [query.from, query.to]
    );

    return result.rows.map((row) => {
      const cohortSize = Number(row.cohort_size);
      const retainedD7 = Number(row.retained_d7);
      return {
        cohortDate: row.cohort_date,
        cohortSize,
        retainedD7,
        retentionRateD7: cohortSize > 0 ? Number((retainedD7 / cohortSize).toFixed(4)) : 0
      };
    });
  }

  async listParticipants(eventId: string): Promise<EventParticipantRow[]> {
    const result = await this.pool.query<DbParticipantRow>(
      `
        SELECT
          wallets.wallet AS wallet,
          registrations.created_at AS registered_at,
          registrations.tx_ref AS registration_tx_ref,
          checkins.created_at AS checked_in_at,
          checkins.tx_ref AS checkin_tx_ref,
          claims.created_at AS claimed_at,
          claims.tx_ref AS claim_tx_ref,
          claims.mint_address AS claim_mint_address
        FROM (
          SELECT wallet FROM registrations WHERE event_id = $1
          UNION
          SELECT wallet FROM checkins WHERE event_id = $1
          UNION
          SELECT wallet FROM claims WHERE event_id = $1
        ) wallets
        LEFT JOIN registrations ON registrations.event_id = $1 AND registrations.wallet = wallets.wallet
        LEFT JOIN checkins ON checkins.event_id = $1 AND checkins.wallet = wallets.wallet
        LEFT JOIN claims ON claims.event_id = $1 AND claims.wallet = wallets.wallet
        ORDER BY wallets.wallet ASC;
      `,
      [eventId]
    );

    return result.rows.map((row) => ({
      wallet: row.wallet,
      registeredAt: row.registered_at ? new Date(row.registered_at).toISOString() : null,
      checkedInAt: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : null,
      claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null
    }));
  }

  async listParticipantsPage(eventId: string, query: ParticipantsQuery): Promise<ParticipantsPage> {
    const stageCondition = {
      all: "TRUE",
      registered: "base.registered_at IS NOT NULL",
      "checked-in": "base.checked_in_at IS NOT NULL",
      claimed: "base.claimed_at IS NOT NULL"
    }[query.stage];

    const params: Array<string | number> = [eventId];
    let searchClause = "";
    if (query.search) {
      params.push(`%${query.search.toLowerCase()}%`);
      searchClause = ` AND LOWER(base.wallet) LIKE $${params.length}`;
    }

    const baseCte = `
      WITH wallets AS (
        SELECT wallet FROM registrations WHERE event_id = $1
        UNION
        SELECT wallet FROM checkins WHERE event_id = $1
        UNION
        SELECT wallet FROM claims WHERE event_id = $1
      ),
      base AS (
        SELECT
          wallets.wallet AS wallet,
          registrations.created_at AS registered_at,
          registrations.tx_ref AS registration_tx_ref,
          checkins.created_at AS checked_in_at,
          checkins.tx_ref AS checkin_tx_ref,
          claims.created_at AS claimed_at,
          claims.tx_ref AS claim_tx_ref,
          claims.mint_address AS claim_mint_address
        FROM wallets
        LEFT JOIN registrations ON registrations.event_id = $1 AND registrations.wallet = wallets.wallet
        LEFT JOIN checkins ON checkins.event_id = $1 AND checkins.wallet = wallets.wallet
        LEFT JOIN claims ON claims.event_id = $1 AND claims.wallet = wallets.wallet
      )
    `;

    const countResult = await this.pool.query<DbCountRow>(
      `
        ${baseCte}
        SELECT COUNT(*)::text AS count
        FROM base
        WHERE ${stageCondition}${searchClause};
      `,
      params
    );

    const rowParams = [...params];
    rowParams.push(query.limit);
    const limitParam = `$${rowParams.length}`;
    rowParams.push(query.offset);
    const offsetParam = `$${rowParams.length}`;

    const rowsResult = await this.pool.query<DbParticipantRow>(
      `
        ${baseCte}
        SELECT
          base.wallet AS wallet,
          base.registered_at AS registered_at,
          base.registration_tx_ref AS registration_tx_ref,
          base.checked_in_at AS checked_in_at,
          base.checkin_tx_ref AS checkin_tx_ref,
          base.claimed_at AS claimed_at,
          base.claim_tx_ref AS claim_tx_ref,
          base.claim_mint_address AS claim_mint_address
        FROM base
        WHERE ${stageCondition}${searchClause}
        ORDER BY base.wallet ASC
        LIMIT ${limitParam}
        OFFSET ${offsetParam};
      `,
      rowParams
    );

    const rows = rowsResult.rows.map((row) => ({
      wallet: row.wallet,
      registeredAt: row.registered_at ? new Date(row.registered_at).toISOString() : null,
      checkedInAt: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : null,
      claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null
    }));

    return {
      rows,
      total: Number(countResult.rows[0]?.count ?? "0"),
      limit: query.limit,
      offset: query.offset
    };
  }

  async getWalletVerification(eventId: string, wallet: string): Promise<WalletVerification> {
    const normalizedWallet = normalizeWallet(wallet);
    const result = await this.pool.query<DbParticipantRow>(
      `
        SELECT
          $2::text AS wallet,
          registrations.created_at AS registered_at,
          registrations.tx_ref AS registration_tx_ref,
          checkins.created_at AS checked_in_at,
          checkins.tx_ref AS checkin_tx_ref,
          claims.created_at AS claimed_at,
          claims.tx_ref AS claim_tx_ref,
          claims.mint_address AS claim_mint_address
        FROM (SELECT 1) seed
        LEFT JOIN registrations ON registrations.event_id = $1 AND registrations.wallet = $2
        LEFT JOIN checkins ON checkins.event_id = $1 AND checkins.wallet = $2
        LEFT JOIN claims ON claims.event_id = $1 AND claims.wallet = $2;
      `,
      [eventId, normalizedWallet]
    );

    const row = result.rows[0];
    return buildWalletVerification({
      eventId,
      wallet: normalizedWallet,
      registered:
        row?.registered_at != null
          ? {
              at: new Date(row.registered_at).toISOString(),
              txRef: row.registration_tx_ref
            }
          : undefined,
      checkedIn:
        row?.checked_in_at != null
          ? {
              at: new Date(row.checked_in_at).toISOString(),
              txRef: row.checkin_tx_ref
            }
          : undefined,
      claimed:
        row?.claimed_at != null
          ? {
              at: new Date(row.claimed_at).toISOString(),
              txRef: row.claim_tx_ref,
              mintAddress: row.claim_mint_address
            }
          : undefined
    });
  }

  async getTxVerification(txRef: string): Promise<TxVerification | null> {
    const result = await this.pool.query<DbTxVerificationRow>(
      `
        SELECT
          event_id,
          wallet,
          stage,
          occurred_at,
          mint_address
        FROM (
          SELECT
            event_id,
            wallet,
            'register'::text AS stage,
            created_at AS occurred_at,
            NULL::text AS mint_address
          FROM registrations
          WHERE tx_ref = $1
          UNION ALL
          SELECT
            event_id,
            wallet,
            'check-in'::text AS stage,
            created_at AS occurred_at,
            NULL::text AS mint_address
          FROM checkins
          WHERE tx_ref = $1
          UNION ALL
          SELECT
            event_id,
            wallet,
            'claim'::text AS stage,
            created_at AS occurred_at,
            mint_address
          FROM claims
          WHERE tx_ref = $1
        ) unioned
        ORDER BY occurred_at DESC
        LIMIT 1;
      `,
      [txRef]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      txRef,
      eventId: row.event_id,
      wallet: row.wallet,
      stage: row.stage,
      occurredAt: new Date(row.occurred_at).toISOString(),
      mintAddress: row.mint_address
    };
  }

  async hasRegistration(eventId: string, wallet: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM registrations WHERE event_id = $1 AND wallet = $2 LIMIT 1;`,
      [eventId, normalizeWallet(wallet)]
    );
    return result.rows.length > 0;
  }

  async addRegistration(eventId: string, wallet: string, txRef: string): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO registrations (event_id, wallet, tx_ref)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id, wallet)
        DO UPDATE SET tx_ref = COALESCE(registrations.tx_ref, EXCLUDED.tx_ref);
      `,
      [eventId, normalizeWallet(wallet), txRef]
    );
  }

  async hasCheckin(eventId: string, wallet: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM checkins WHERE event_id = $1 AND wallet = $2 LIMIT 1;`,
      [eventId, normalizeWallet(wallet)]
    );
    return result.rows.length > 0;
  }

  async addCheckin(eventId: string, wallet: string, txRef: string): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO checkins (event_id, wallet, tx_ref)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id, wallet)
        DO UPDATE SET tx_ref = COALESCE(checkins.tx_ref, EXCLUDED.tx_ref);
      `,
      [eventId, normalizeWallet(wallet), txRef]
    );
  }

  async hasClaim(eventId: string, wallet: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM claims WHERE event_id = $1 AND wallet = $2 LIMIT 1;`,
      [eventId, normalizeWallet(wallet)]
    );
    return result.rows.length > 0;
  }

  async addClaim(
    eventId: string,
    wallet: string,
    txRef: string,
    mintAddress: string | null
  ): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO claims (event_id, wallet, tx_ref, mint_address)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (event_id, wallet)
        DO UPDATE SET
          tx_ref = COALESCE(claims.tx_ref, EXCLUDED.tx_ref),
          mint_address = COALESCE(claims.mint_address, EXCLUDED.mint_address);
      `,
      [eventId, normalizeWallet(wallet), txRef, mintAddress]
    );
  }
}

export function createEventStore(databaseUrl?: string): EventStore {
  if (!databaseUrl) {
    return new MemoryStore();
  }
  return new PostgresStore(databaseUrl);
}
