import { Router } from "express";
import type { EventStore } from "@campus/db";
import { z } from "zod";
import { issuePoapCredential } from "../lib/poap.js";
import { assertValidPubkey, buildActionTx, buildTxRef, isOnCurvePubkey } from "../lib/solana.js";
import { config } from "../config.js";

const postSchema = z.object({
  account: z.string().min(32),
  secret: z.string().optional()
});

function actionMeta(params: {
  title: string;
  description: string;
  label: string;
  href: string;
}) {
  return {
    title: params.title,
    icon: "https://placehold.co/512x512/png?text=Campus+Blink+Pass",
    description: params.description,
    label: params.label,
    links: {
      actions: [
        {
          label: params.label,
          href: params.href
        }
      ]
    }
  };
}

function ensureCheckInWindow(startAt: string, endAt: string): boolean {
  const now = Date.now();
  return now >= new Date(startAt).getTime() && now <= new Date(endAt).getTime();
}

function explorerTxUrl(signature: string): string {
  const clusterParam = config.solanaNetwork && config.solanaNetwork !== "mainnet-beta"
    ? `?cluster=${encodeURIComponent(config.solanaNetwork)}`
    : "";
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}${clusterParam}`;
}

export function createActionsRouter(store: EventStore): Router {
  const actionsRouter: Router = Router();

  actionsRouter.get("/events/:eventId/register", async (req, res) => {
    const event = await store.getEventById(req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json(
      actionMeta({
        title: `${event.name} Registration`,
        description: event.description,
        label: event.ticketPriceLamports > 0 ? "Pay & Register" : "Register",
        href: `${config.appBaseUrl}/api/actions/events/${event.id}/register`
      })
    );
  });

  actionsRouter.post("/events/:eventId/register", async (req, res) => {
    const event = await store.getEventById(req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const { account } = parsed.data;

    try {
      assertValidPubkey(account);
    } catch {
      res.status(400).json({ error: "Invalid account pubkey" });
      return;
    }

    if (await store.hasRegistration(event.id, account)) {
      res.status(409).json({ error: "Wallet already registered for this event" });
      return;
    }

    const tx = await buildActionTx({
      account,
      lamports: event.ticketPriceLamports,
      memo: `register:${event.id}:${account}`
    });

    const txRef = buildTxRef(tx);
    await store.addRegistration(event.id, account, txRef);

    res.json({
      transaction: tx,
      txRef,
      message: `Sign to register for ${event.name}`
    });
  });

  actionsRouter.get("/events/:eventId/check-in", async (req, res) => {
    const event = await store.getEventById(req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json(
      actionMeta({
        title: `${event.name} Check-in`,
        description: "Check in to become eligible for POAP claim.",
        label: "Check-in",
        href: `${config.appBaseUrl}/api/actions/events/${event.id}/check-in`
      })
    );
  });

  actionsRouter.post("/events/:eventId/check-in", async (req, res) => {
    const event = await store.getEventById(req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const { account, secret } = parsed.data;

    try {
      assertValidPubkey(account);
    } catch {
      res.status(400).json({ error: "Invalid account pubkey" });
      return;
    }

    if (!(await store.hasRegistration(event.id, account))) {
      res.status(400).json({ error: "Wallet is not registered for this event" });
      return;
    }

    if (!ensureCheckInWindow(event.startAt, event.endAt)) {
      res.status(400).json({ error: "Check-in window is closed" });
      return;
    }

    if (secret !== event.checkInSecret) {
      res.status(403).json({ error: "Invalid check-in secret" });
      return;
    }

    if (await store.hasCheckin(event.id, account)) {
      res.status(409).json({ error: "Wallet already checked in" });
      return;
    }

    const tx = await buildActionTx({
      account,
      memo: `checkin:${event.id}:${account}`
    });

    const txRef = buildTxRef(tx);
    await store.addCheckin(event.id, account, txRef);

    res.json({
      transaction: tx,
      txRef,
      message: `Sign to check in for ${event.name}`
    });
  });

  actionsRouter.get("/events/:eventId/claim-poap", async (req, res) => {
    const event = await store.getEventById(req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json(
      actionMeta({
        title: `${event.name} Claim POAP`,
        description: "Claim your event credential after successful check-in.",
        label: "Claim POAP",
        href: `${config.appBaseUrl}/api/actions/events/${event.id}/claim-poap`
      })
    );
  });

  actionsRouter.post("/events/:eventId/claim-poap", async (req, res) => {
    const event = await store.getEventById(req.params.eventId);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const { account } = parsed.data;

    try {
      assertValidPubkey(account);
    } catch {
      res.status(400).json({ error: "Invalid account pubkey" });
      return;
    }
    if (config.poapMintMode.toLowerCase() === "real" && !isOnCurvePubkey(account)) {
      res.status(400).json({ error: "Claim wallet must be on-curve for real mint mode" });
      return;
    }

    if (!(await store.hasCheckin(event.id, account))) {
      res.status(400).json({ error: "Wallet has not checked in yet" });
      return;
    }

    if (await store.hasClaim(event.id, account)) {
      res.status(409).json({ error: "POAP already claimed" });
      return;
    }

    const tx = await buildActionTx({
      account,
      memo: `claim-poap:${event.id}:${account}`
    });

    let mintResult: Awaited<ReturnType<typeof issuePoapCredential>> | null = null;
    try {
      mintResult = await issuePoapCredential({
        event,
        wallet: account,
        store
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mint POAP";
      res.status(502).json({ error: message });
      return;
    }
    if (!mintResult) {
      res.status(502).json({ error: "Failed to mint POAP" });
      return;
    }
    const txRef = mintResult.txRef ?? buildTxRef(tx);
    const mintAddress = mintResult.mintAddress;
    await store.addClaim(event.id, account, txRef, mintAddress);

    const verifyTxUrl = `${config.verifierWebBaseUrl}/?txRef=${encodeURIComponent(txRef)}`;
    const verifyWalletUrl =
      `${config.verifierWebBaseUrl}/?eventId=${encodeURIComponent(event.id)}` +
      `&wallet=${encodeURIComponent(account)}`;

    res.json({
      transaction: tx,
      txRef,
      mintAddress,
      poapCollection: mintResult.poapCollection,
      verifyUrl: verifyTxUrl,
      verifyWalletUrl,
      mintMode: mintResult.mode,
      mintTxSignature: mintResult.txRef,
      mintExplorerUrl: mintResult.txRef ? explorerTxUrl(mintResult.txRef) : null,
      message: `Sign to claim POAP for ${event.name}`
    });
  });

  return actionsRouter;
}
