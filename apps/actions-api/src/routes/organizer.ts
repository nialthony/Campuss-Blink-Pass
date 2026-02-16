import { Router } from "express";
import type { EventStore } from "@campus/db";
import type {
  CreateEventInput,
  ParticipantsQuery,
  TimeseriesQuery,
  UpdateEventInput
} from "@campus/shared-types";
import { z } from "zod";

const statusSchema = z.enum(["draft", "published", "ended"]);

const createEventSchema = z
  .object({
    id: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/).optional(),
    name: z.string().min(3).max(120),
    description: z.string().min(3).max(1000),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    checkInSecret: z.string().min(4).max(128),
    ticketPriceLamports: z.number().int().nonnegative().default(0),
    poapCollection: z.string().min(1).nullable().default(null),
    status: statusSchema.default("draft")
  })
  .superRefine((value, ctx) => {
    if (new Date(value.startAt).getTime() >= new Date(value.endAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "endAt must be later than startAt"
      });
    }
  });

const updateEventSchema = z
  .object({
    name: z.string().min(3).max(120).optional(),
    description: z.string().min(3).max(1000).optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    checkInSecret: z.string().min(4).max(128).optional(),
    ticketPriceLamports: z.number().int().nonnegative().optional(),
    poapCollection: z.string().min(1).nullable().optional(),
    status: statusSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

const participantsQuerySchema = z.object({
  stage: z.enum(["all", "registered", "checked-in", "claimed"]).default("all"),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  offset: z.coerce.number().int().min(0).default(0)
});

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const timeseriesQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional()
});

function slugifyEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

function ensureEventTime(startAt: string, endAt: string): boolean {
  return new Date(startAt).getTime() < new Date(endAt).getTime();
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function defaultTimeseriesQuery(): TimeseriesQuery {
  const to = new Date();
  const from = new Date(to.getTime());
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: toDateOnly(from),
    to: toDateOnly(to)
  };
}

function parseParticipantsQuery(input: unknown): {
  ok: true;
  query: ParticipantsQuery;
} | {
  ok: false;
  details: ReturnType<z.ZodError["flatten"]>;
} {
  const parsed = participantsQuerySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      details: parsed.error.flatten()
    };
  }

  return {
    ok: true,
    query: {
      stage: parsed.data.stage,
      search: parsed.data.search && parsed.data.search.length > 0 ? parsed.data.search : null,
      limit: parsed.data.limit,
      offset: parsed.data.offset
    }
  };
}

function parseTimeseriesQuery(input: unknown): {
  ok: true;
  query: TimeseriesQuery;
} | {
  ok: false;
  details: ReturnType<z.ZodError["flatten"]>;
} {
  const parsed = timeseriesQuerySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      details: parsed.error.flatten()
    };
  }

  const fallback = defaultTimeseriesQuery();
  const query: TimeseriesQuery = {
    from: parsed.data.from ?? fallback.from,
    to: parsed.data.to ?? fallback.to
  };

  if (query.from > query.to) {
    return {
      ok: false,
      details: {
        formErrors: ["from must be less than or equal to to"],
        fieldErrors: {}
      }
    };
  }

  const fromDate = new Date(`${query.from}T00:00:00.000Z`);
  const toDate = new Date(`${query.to}T00:00:00.000Z`);
  const dayCount = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  if (dayCount > 366) {
    return {
      ok: false,
      details: {
        formErrors: ["date range cannot exceed 366 days"],
        fieldErrors: {}
      }
    };
  }

  return {
    ok: true,
    query
  };
}

export function createOrganizerRouter(store: EventStore): Router {
  const router = Router();

  router.get("/overview", async (_req, res) => {
    const overview = await store.getOverview();
    res.json({ overview });
  });

  router.get("/analytics/retention", async (req, res) => {
    const parsedQuery = parseTimeseriesQuery(req.query);
    if (!parsedQuery.ok) {
      res.status(400).json({ error: "Invalid query", details: parsedQuery.details });
      return;
    }

    const cohorts = await store.getRetentionCohorts(parsedQuery.query);
    const totals = cohorts.reduce(
      (acc, cohort) => {
        acc.cohortSize += cohort.cohortSize;
        acc.retainedD7 += cohort.retainedD7;
        return acc;
      },
      { cohortSize: 0, retainedD7: 0 }
    );

    res.json({
      range: parsedQuery.query,
      totals: {
        cohortSize: totals.cohortSize,
        retainedD7: totals.retainedD7,
        retentionRateD7:
          totals.cohortSize > 0 ? Number((totals.retainedD7 / totals.cohortSize).toFixed(4)) : 0
      },
      cohorts
    });
  });

  router.get("/events", async (_req, res) => {
    const events = await store.listEvents();
    res.json({ events });
  });

  router.get("/events/:eventId", async (req, res) => {
    const event = await store.getEventById(req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({ event });
  });

  router.post("/events", async (req, res) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const input = parsed.data;
    const baseId = input.id ?? `${slugifyEventName(input.name)}-${Date.now()}`;
    const existing = await store.getEventById(baseId);
    if (existing) {
      res.status(409).json({ error: "Event id already exists" });
      return;
    }

    const createInput: CreateEventInput = {
      id: baseId,
      name: input.name,
      description: input.description,
      startAt: input.startAt,
      endAt: input.endAt,
      checkInSecret: input.checkInSecret,
      ticketPriceLamports: input.ticketPriceLamports,
      poapCollection: input.poapCollection,
      status: input.status
    };

    const created = await store.createEvent(createInput);
    res.status(201).json({ event: created });
  });

  router.patch("/events/:eventId", async (req, res) => {
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const eventId = req.params.eventId;
    const current = await store.getEventById(eventId);
    if (!current) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const patch: UpdateEventInput = parsed.data;
    const mergedStartAt = patch.startAt ?? current.startAt;
    const mergedEndAt = patch.endAt ?? current.endAt;
    if (!ensureEventTime(mergedStartAt, mergedEndAt)) {
      res.status(400).json({ error: "endAt must be later than startAt" });
      return;
    }

    const updated = await store.updateEvent(eventId, patch);
    if (!updated) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({ event: updated });
  });

  router.get("/events/:eventId/stats", async (req, res) => {
    const eventId = req.params.eventId;
    const event = await store.getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const stats = await store.getEventStats(eventId);
    res.json({ eventId, stats });
  });

  router.get("/events/:eventId/analytics/timeseries", async (req, res) => {
    const eventId = req.params.eventId;
    const event = await store.getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const parsedQuery = parseTimeseriesQuery(req.query);
    if (!parsedQuery.ok) {
      res.status(400).json({ error: "Invalid query", details: parsedQuery.details });
      return;
    }

    const points = await store.getEventTimeseries(eventId, parsedQuery.query);
    const totals = points.reduce(
      (acc, point) => {
        acc.registrations += point.registrations;
        acc.checkins += point.checkins;
        acc.claims += point.claims;
        return acc;
      },
      { registrations: 0, checkins: 0, claims: 0 }
    );

    res.json({
      eventId,
      range: parsedQuery.query,
      totals,
      points
    });
  });

  router.get("/events/:eventId/participants", async (req, res) => {
    const eventId = req.params.eventId;
    const event = await store.getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const parsedQuery = parseParticipantsQuery(req.query);
    if (!parsedQuery.ok) {
      res.status(400).json({ error: "Invalid query", details: parsedQuery.details });
      return;
    }

    const page = await store.listParticipantsPage(eventId, parsedQuery.query);
    res.json({
      eventId,
      query: parsedQuery.query,
      page
    });
  });

  router.get("/events/:eventId/export.csv", async (req, res) => {
    const eventId = req.params.eventId;
    const event = await store.getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const parsedQuery = parseParticipantsQuery(req.query);
    if (!parsedQuery.ok) {
      res.status(400).json({ error: "Invalid query", details: parsedQuery.details });
      return;
    }

    const page = await store.listParticipantsPage(eventId, parsedQuery.query);
    const rows = [
      "wallet,registeredAt,checkedInAt,claimedAt",
      ...page.rows.map((participant) =>
        [
          escapeCsvCell(participant.wallet),
          escapeCsvCell(participant.registeredAt ?? ""),
          escapeCsvCell(participant.checkedInAt ?? ""),
          escapeCsvCell(participant.claimedAt ?? "")
        ].join(",")
      )
    ];

    const filename = `${eventId}-participants.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.setHeader("X-Total-Count", String(page.total));
    res.status(200).send(rows.join("\n"));
  });

  return router;
}
