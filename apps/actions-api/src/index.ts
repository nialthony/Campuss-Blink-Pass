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

let appPromise: Promise<express.Express> | null = null;

async function createApp(): Promise<express.Express> {
  const app = express();
  let storeMode: "postgres" | "memory" = config.databaseUrl ? "postgres" : "memory";
  let store = createEventStore(config.databaseUrl);
  try {
    await store.init();
  } catch (error) {
    if (!config.databaseUrl || !config.dbFallbackToMemory) {
      throw error;
    }
    console.error("Failed to initialize postgres store. Falling back to memory store.", error);
    store = createEventStore();
    await store.init();
    storeMode = "memory";
  }

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
      storeMode,
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

  return app;
}

export async function getApp(): Promise<express.Express> {
  if (!appPromise) {
    appPromise = createApp().catch((error) => {
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

async function startLocalServer(): Promise<void> {
  const app = await getApp();
  app.listen(config.port, () => {
    // Keep startup log short and explicit for local development.
    console.log(`actions-api listening on http://localhost:${config.port}`);
  });
}

export default async function handler(req: express.Request, res: express.Response): Promise<void> {
  try {
    const app = await getApp();
    app(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bootstrap error";
    console.error("actions-api bootstrap error:", error);

    if (typeof res.status === "function" && typeof res.json === "function") {
      res.status(500).json({ error: "Function bootstrap failed", message });
      return;
    }

    const legacyRes = res as unknown as {
      statusCode: number;
      setHeader(name: string, value: string): void;
      end(payload: string): void;
    };
    legacyRes.statusCode = 500;
    legacyRes.setHeader("content-type", "application/json; charset=utf-8");
    legacyRes.end(JSON.stringify({ error: "Function bootstrap failed", message }));
  }
}

if (!process.env.VERCEL) {
  startLocalServer().catch((err) => {
    console.error("Failed to start actions-api:", err);
    process.exit(1);
  });
}
