import { Router } from "express";
import type { EventStore } from "@campus/db";
import { assertValidPubkey } from "../lib/solana.js";

export function createVerifierRouter(store: EventStore): Router {
  const router = Router();

  router.get("/events", async (req, res) => {
    const status = req.query.status === "all" ? "all" : "published";
    const events = await store.listEvents();
    const filtered = events.filter((event) => status === "all" || event.status === "published");
    res.json({
      events: filtered.map((event) => ({
        id: event.id,
        name: event.name,
        description: event.description,
        startAt: event.startAt,
        endAt: event.endAt,
        status: event.status,
        poapCollection: event.poapCollection
      }))
    });
  });

  router.get("/events/:eventId/wallets/:wallet", async (req, res) => {
    const eventId = req.params.eventId;
    const wallet = req.params.wallet;

    const event = await store.getEventById(eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    try {
      assertValidPubkey(wallet);
    } catch {
      res.status(400).json({ error: "Invalid wallet pubkey" });
      return;
    }

    const verification = await store.getWalletVerification(eventId, wallet);
    res.json({
      event: {
        id: event.id,
        name: event.name
      },
      verification
    });
  });

  router.get("/refs/:txRef", async (req, res) => {
    const txRef = req.params.txRef;
    if (!txRef || txRef.length < 8) {
      res.status(400).json({ error: "Invalid txRef" });
      return;
    }

    const verification = await store.getTxVerification(txRef);
    if (!verification) {
      res.status(404).json({ error: "txRef not found" });
      return;
    }

    const event = await store.getEventById(verification.eventId);
    res.json({
      verification,
      event: event
        ? {
            id: event.id,
            name: event.name
          }
        : null
    });
  });

  return router;
}
