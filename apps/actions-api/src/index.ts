import cors from "cors";
import express from "express";
import { createEventStore } from "@campus/db";
import { config } from "./config.js";
import { createActionsRouter } from "./routes/actions.js";
import { createOrganizerRouter } from "./routes/organizer.js";
import { createVerifierRouter } from "./routes/verifier.js";
import { organizerAuth } from "./middleware/organizer-auth.js";
import { createIpRateLimiter } from "./middleware/rate-limit.js";
import { actionAuditLogger } from "./middleware/action-audit-log.js";

async function bootstrap(): Promise<void> {
  const app = express();
  const store = createEventStore(config.databaseUrl);
  await store.init();

  app.use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-api-key"]
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "actions-api",
      storeMode: config.databaseUrl ? "postgres" : "memory",
      timestamp: new Date().toISOString()
    });
  });

  app.get("/actions.json", (_req, res) => {
    res.json({
      rules: [
        {
          pathPattern: "/api/actions/**",
          apiPath: "/api/actions/**"
        }
      ]
    });
  });

  app.use(
    "/api/actions",
    createIpRateLimiter({
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMax
    }),
    actionAuditLogger(),
    createActionsRouter(store)
  );

  app.use("/api/organizer", organizerAuth, createOrganizerRouter(store));
  app.use("/api/verifier", createVerifierRouter(store));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  });

  app.listen(config.port, () => {
    // Keep startup log short and explicit for local development.
    console.log(`actions-api listening on http://localhost:${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start actions-api:", err);
  process.exit(1);
});
